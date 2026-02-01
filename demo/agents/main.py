#!/usr/bin/env python3
"""
Main orchestrator for the prediction market agents flow.
Starts watcher, UI, creator scheduler, and decider scheduler.
"""

import argparse
import json
import signal
import subprocess
import sys
import time
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import requests

try:
    from . import config
except ImportError:
    # Allow running as script directly
    import config

# Global state
running = True
watcher_process: Optional[subprocess.Popen] = None
ui_process: Optional[subprocess.Popen] = None
pending_markets = {}  # market_id -> creation_time


def signal_handler(sig, frame):
    """Handle Ctrl+C gracefully."""
    global running, watcher_process, ui_process
    print("\n\nShutting down gracefully...")
    running = False
    
    if watcher_process:
        watcher_process.terminate()
    if ui_process:
        ui_process.terminate()
    
    # Wait for processes to terminate
    if watcher_process:
        watcher_process.wait(timeout=5)
    if ui_process:
        ui_process.wait(timeout=5)
    
    sys.exit(0)


def start_watcher(streamer: str) -> subprocess.Popen:
    """Start the watcher process."""
    print(f"Starting watcher for {streamer}...")
    process = subprocess.Popen(
        [sys.executable, str(config.WATCHER_SCRIPT), streamer],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    print(f"✓ Watcher started (PID: {process.pid})")
    return process


def start_ui(streamer: str) -> subprocess.Popen:
    """Start the UI process."""
    print(f"Starting UI for {streamer}...")
    process = subprocess.Popen(
        [sys.executable, str(config.UI_SCRIPT), streamer],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    print(f"✓ UI started (PID: {process.pid})")
    return process


def load_game_context(streamer: str) -> Optional[dict]:
    """Load game context JSON file."""
    context_path = Path(__file__).parent / "watcher" / streamer / "game_context.json"
    
    if not context_path.exists():
        return None
    
    try:
        with open(context_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading game context: {e}")
        return None


def get_latest_frame(context: dict) -> Optional[dict]:
    """Get the latest frame from game context."""
    frames = context.get("session", {}).get("frames", [])
    if not frames:
        return None
    return frames[-1]


def create_market_via_api(streamer: str) -> Optional[dict]:
    """Call creator API to generate market, then create it via market API."""
    try:
        # Step 1: Call creator API to get market data
        creator_url = f"{config.CREATOR_API_URL}/market/{streamer}"
        print(f"Calling creator API: {creator_url}")
        
        response = requests.get(creator_url, timeout=30)
        if response.status_code != 200:
            print(f"Creator API error: {response.status_code} - {response.text}")
            return None
        
        market_data = response.json()
        print(f"Market data received: {market_data.get('question', 'N/A')}")
        
        # Step 2: Create market via market API
        market_api_url = f"{config.MARKET_API_URL}/market/create"
        
        # Convert duration_minutes to seconds for endTime
        duration_seconds = market_data.get("duration_minutes", 5) * 60
        
        create_payload = {
            "question": market_data.get("question"),
            "initialLiquidity": 10000000,  # 10 USDC
            "endTime": duration_seconds,
        }
        
        print(f"Creating market via API: {market_api_url}")
        create_response = requests.post(market_api_url, json=create_payload, timeout=60)
        
        if create_response.status_code != 200:
            print(f"Market creation API error: {create_response.status_code} - {create_response.text}")
            return None
        
        result = create_response.json()
        
        if result.get("success"):
            market_address = result.get("market")
            print(f"✓ Market created: {market_address}")
            
            # Store market creation time for decider scheduling
            pending_markets[market_address] = {
                "creation_time": datetime.now(),
                "market_data": market_data,
                "streamer": streamer,
            }
            
            return {
                "market_address": market_address,
                "market_data": market_data,
                "creation_time": datetime.now().isoformat(),
            }
        else:
            print(f"Market creation failed: {result.get('error', 'Unknown error')}")
            return None
            
    except Exception as e:
        print(f"Error creating market: {e}")
        import traceback
        traceback.print_exc()
        return None


def decide_and_settle_market(streamer: str, market_address: str, market_data: dict) -> bool:
    """Decide market winner and settle via API."""
    try:
        # Step 1: Call decider API
        decider_url = f"{config.DECIDER_API_URL}/decision/{streamer}"
        print(f"Calling decider API: {decider_url}")
        
        decider_response = requests.post(
            decider_url,
            json=market_data,
            timeout=60
        )
        
        if decider_response.status_code != 200:
            print(f"Decider API error: {decider_response.status_code} - {decider_response.text}")
            return False
        
        decision = decider_response.json()
        winning_option = decision.get("decision", {}).get("winning_option", "")
        
        print(f"Decision: {winning_option}")
        
        # Determine yesWinner based on winning option
        # Assuming first option is YES, second is NO
        options = market_data.get("options", [])
        yesWinner = False
        if options and winning_option == options[0]:
            yesWinner = True
        elif options and winning_option == options[1]:
            yesWinner = False
        else:
            # Try to infer from the option text
            yesWinner = "yes" in winning_option.lower() or "terrorist" in winning_option.lower()
        
        # Step 2: Settle market via API
        settle_url = f"{config.MARKET_API_URL}/market/settle"
        settle_payload = {
            "market": market_address,
            "yesWinner": yesWinner,
        }
        
        print(f"Settling market via API: {settle_url}")
        settle_response = requests.post(settle_url, json=settle_payload, timeout=60)
        
        if settle_response.status_code != 200:
            print(f"Settle API error: {settle_response.status_code} - {settle_response.text}")
            return False
        
        result = settle_response.json()
        
        if result.get("success"):
            print(f"✓ Market settled: {market_address} (Winner: {'YES' if yesWinner else 'NO'})")
            return True
        else:
            print(f"Market settlement failed: {result.get('error', 'Unknown error')}")
            return False
            
    except Exception as e:
        print(f"Error deciding/settling market: {e}")
        import traceback
        traceback.print_exc()
        return False


def creator_scheduler(streamer: str):
    """Scheduler that runs creator every 2 minutes."""
    print(f"Creator scheduler started (interval: {config.CREATOR_INTERVAL_SECONDS}s)")
    
    while running:
        try:
            time.sleep(config.CREATOR_INTERVAL_SECONDS)
            
            if not running:
                break
            
            print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Creator cycle starting...")
            
            # Check if game context exists
            context = load_game_context(streamer)
            if not context:
                print("No game context found, skipping...")
                continue
            
            # Create market
            result = create_market_via_api(streamer)
            if result:
                print(f"Market creation scheduled: {result['market_address']}")
            else:
                print("Market creation failed")
                
        except Exception as e:
            print(f"Error in creator scheduler: {e}")
            import traceback
            traceback.print_exc()


def decider_scheduler(streamer: str):
    """Scheduler that checks pending markets and decides/settles them after delay."""
    print(f"Decider scheduler started (delay: {config.DECIDER_DELAY_SECONDS}s)")
    
    while running:
        try:
            time.sleep(10)  # Check every 10 seconds
            
            if not running:
                break
            
            now = datetime.now()
            markets_to_process = []
            
            # Check for markets ready to be decided
            for market_address, market_info in list(pending_markets.items()):
                creation_time = market_info["creation_time"]
                elapsed = (now - creation_time).total_seconds()
                
                if elapsed >= config.DECIDER_DELAY_SECONDS:
                    markets_to_process.append((market_address, market_info))
            
            # Process ready markets
            for market_address, market_info in markets_to_process:
                print(f"\n[{now.strftime('%H:%M:%S')}] Processing market: {market_address}")
                
                # Remove from pending
                del pending_markets[market_address]
                
                # Decide and settle
                market_streamer = market_info.get("streamer", streamer)
                success = decide_and_settle_market(market_streamer, market_address, market_info["market_data"])
                
                if success:
                    print(f"✓ Market {market_address} processed successfully")
                else:
                    print(f"✗ Failed to process market {market_address}")
                    
        except Exception as e:
            print(f"Error in decider scheduler: {e}")
            import traceback
            traceback.print_exc()


def main():
    global running, watcher_process, ui_process
    
    parser = argparse.ArgumentParser(
        description="Orchestrate prediction market agents flow"
    )
    parser.add_argument(
        "streamer",
        help="Twitch streamer username (e.g., 'zeus')"
    )
    parser.add_argument(
        "--market-api-url",
        default=config.MARKET_API_URL,
        help=f"Market API URL (default: {config.MARKET_API_URL})"
    )
    parser.add_argument(
        "--creator-api-url",
        default=config.CREATOR_API_URL,
        help=f"Creator API URL (default: {config.CREATOR_API_URL})"
    )
    parser.add_argument(
        "--decider-api-url",
        default=config.DECIDER_API_URL,
        help=f"Decider API URL (default: {config.DECIDER_API_URL})"
    )
    
    args = parser.parse_args()
    
    # Set up signal handler
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Update config from args (override defaults)
    config.MARKET_API_URL = args.market_api_url
    config.CREATOR_API_URL = args.creator_api_url
    config.DECIDER_API_URL = args.decider_api_url
    
    print("=" * 60)
    print("PREDICTION MARKET AGENTS ORCHESTRATOR")
    print("=" * 60)
    print(f"Streamer: {args.streamer}")
    print(f"Market API: {config.MARKET_API_URL}")
    print(f"Creator API: {config.CREATOR_API_URL}")
    print(f"Decider API: {config.DECIDER_API_URL}")
    print("=" * 60)
    print()
    
    # Start watcher
    try:
        watcher_process = start_watcher(args.streamer)
    except Exception as e:
        print(f"Failed to start watcher: {e}")
        sys.exit(1)
    
    # Start UI
    try:
        ui_process = start_ui(args.streamer)
    except Exception as e:
        print(f"Failed to start UI: {e}")
        watcher_process.terminate()
        sys.exit(1)
    
    # Start creator scheduler thread
    creator_thread = threading.Thread(
        target=creator_scheduler,
        args=(args.streamer,),
        daemon=True
    )
    creator_thread.start()
    
    # Start decider scheduler thread
    decider_thread = threading.Thread(
        target=decider_scheduler,
        args=(args.streamer,),
        daemon=True
    )
    decider_thread.start()
    
    print("\n✓ All components started")
    print("Press Ctrl+C to stop\n")
    
    # Keep main thread alive
    try:
        while running:
            # Check if processes are still alive
            if watcher_process.poll() is not None:
                print("⚠ Watcher process died!")
                break
            if ui_process.poll() is not None:
                print("⚠ UI process died!")
                break
            
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    
    # Cleanup
    signal_handler(None, None)


if __name__ == "__main__":
    main()
