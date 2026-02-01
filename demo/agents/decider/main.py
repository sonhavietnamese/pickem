#!/usr/bin/env python3
"""
Script to decide the winning option for a prediction market.
Reads market data and latest game context frame, then uses Ollama to determine the winner.
Waits until market duration has passed, then settles the market via API.
"""

import argparse
import json
import re
import signal
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

import ollama
import requests

# Import rich for visual indicators
try:
    from rich.console import Console
    from rich.live import Live
    from rich.panel import Panel
    from rich.text import Text
    from rich.spinner import Spinner
    from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TimeRemainingColumn
    from rich.table import Table
    HAS_RICH = True
except ImportError:
    HAS_RICH = False
    print("Warning: 'rich' library not found. Install with: pip install rich")
    print("Falling back to basic terminal output.\n")

# Import config for API URL
try:
    from config import MARKET_API_URL
except ImportError:
    import os
    MARKET_API_URL = os.getenv("MARKET_API_URL", "http://localhost:3000")

# System prompt for market decision
SYSTEM_PROMPT = """Act as a CS2/CS:GO Prediction Market Decider. Your task is to analyze the game state data and determine which option in the prediction market has won.

### TASK:
Compare the baseline state (when the market was created) with the current game state, and determine which of the two market options has occurred based on the prediction type.

### PREDICTION TYPES:
- **Kills**: Compare kill counts, player eliminations, or kill-related metrics
- **Score**: Compare round scores, match scores, or score differences
- **Economy**: Compare money amounts, economy status, or economic advantages
- **Objective**: Compare bomb plant/defuse status, round outcomes, or objective completions

### DECISION CRITERIA:
- Be objective and base your decision solely on quantifiable HUD data
- The decision must be verifiable by looking at the scoreboard/game state
- If the outcome is unclear or the duration hasn't passed, indicate that
- Compare the baseline_value with the current state to determine if the prediction condition was met
- "reason" field: Keep it short and straightforward (max 20 words, one sentence)
- "full_reason" field: Provide detailed explanation with specific data points, numbers, and comparisons

### OUTPUT FORMAT:
Return ONLY a JSON object. Do not include conversational text or markdown blocks outside the JSON.

{
  "winning_option": "Option A" or "Option B" (exact match from the options array),
  "reason": "Short, straightforward one-sentence explanation (max 20 words)",
  "full_reason": "Detailed explanation with specific data points comparing baseline vs current state",
  "baseline_comparison": "Comparison between baseline and current state",
  "is_resolved": true or false (whether the market can be definitively resolved)
}
"""

# Default Ollama model
DEFAULT_MODEL = "gemini-3-flash-preview"

# Global flag for graceful shutdown
running = True

# Check interval for new markets (in seconds)
CHECK_INTERVAL_SECONDS = 30


def load_game_context(username: str) -> dict:
    """Load game context JSON file for the given username."""
    context_path = Path(__file__).parent.parent / "watcher" / username / "game_context.json"
    
    if not context_path.exists():
        raise FileNotFoundError(f"Game context file not found: {context_path}")
    
    with open(context_path, 'r') as f:
        return json.load(f)


def get_latest_frame(context: dict) -> dict:
    """Get the latest frame from the game context."""
    frames = context.get("session", {}).get("frames", [])
    
    if not frames:
        raise ValueError("No frames found in game context")
    
    # Return the last frame (most recent)
    return frames[-1]


def load_market(market_path: str) -> dict:
    """Load market JSON file."""
    market_file = Path(market_path)
    
    if not market_file.exists():
        raise FileNotFoundError(f"Market file not found: {market_file}")
    
    with open(market_file, 'r') as f:
        return json.load(f)


def wait_for_markets_json(username: str, retry_interval: int = 5, console: Console = None) -> Path:
    """
    Wait for markets.json file to exist, retrying every N seconds.
    Respects the global 'running' flag for graceful shutdown.
    
    Args:
        username: Username/streamer name
        retry_interval: Seconds between retries (default: 5)
        console: Rich Console instance (optional)
    
    Returns:
        Path to the markets.json file
    
    Raises:
        FileNotFoundError: If running flag becomes False before file is found
    """
    markets_path = Path(__file__).parent.parent / "creator" / username / "markets.json"
    markets_path = markets_path.resolve()
    
    if HAS_RICH and console:
        console.print(f"[dim]Looking for markets file at: {markets_path}[/dim]")
        
        retry_count = 0
        while not markets_path.exists() and running:
            retry_count += 1
            console.print(f"[yellow]Waiting for markets file... (retry #{retry_count})[/yellow]")
            console.print(f"[dim]Retrying in {retry_interval} seconds...[/dim]")
            
            # Wait for retry_interval seconds, but check running flag periodically
            for _ in range(retry_interval):
                if not running:
                    raise FileNotFoundError(f"Markets file not found: {markets_path} (interrupted)")
                time.sleep(1)
        
        if not running:
            raise FileNotFoundError(f"Markets file not found: {markets_path} (interrupted)")
        
        console.print(f"[green]✓ Markets file found![/green]")
    else:
        print(f"Looking for markets file at: {markets_path}")
        retry_count = 0
        while not markets_path.exists() and running:
            retry_count += 1
            print(f"Markets file not found. Retrying in {retry_interval} seconds... (retry #{retry_count})")
            
            # Wait for retry_interval seconds, but check running flag periodically
            for _ in range(retry_interval):
                if not running:
                    raise FileNotFoundError(f"Markets file not found: {markets_path} (interrupted)")
                time.sleep(1)
        
        if not running:
            raise FileNotFoundError(f"Markets file not found: {markets_path} (interrupted)")
        
        print(f"✓ Markets file found!")
    
    return markets_path


def load_markets_json(username: str, wait_if_missing: bool = True, console: Console = None) -> list:
    """
    Load markets.json array for the given username.
    
    Args:
        username: Username/streamer name
        wait_if_missing: If True, wait for file to exist (default: True)
        console: Rich Console instance (optional)
    
    Returns:
        List of market dictionaries
    """
    markets_path = Path(__file__).parent.parent / "creator" / username / "markets.json"
    markets_path = markets_path.resolve()
    
    if wait_if_missing and not markets_path.exists():
        markets_path = wait_for_markets_json(username, console=console)
    
    if not markets_path.exists():
        raise FileNotFoundError(f"Markets file not found: {markets_path}")
    
    with open(markets_path, 'r') as f:
        markets = json.load(f)
    
    if not isinstance(markets, list):
        raise ValueError(f"Markets file does not contain an array: {markets_path}")
    
    return markets


def get_latest_market(username: str, wait_if_missing: bool = True, console: Console = None) -> dict:
    """
    Get the latest market from markets.json for the given username.
    
    Args:
        username: Username/streamer name
        wait_if_missing: If True, wait for markets.json to exist (default: True)
        console: Rich Console instance (optional)
    
    Returns:
        Latest market dictionary
    """
    markets = load_markets_json(username, wait_if_missing, console=console)
    
    if not markets:
        raise ValueError(f"No markets found in markets.json for {username}")
    
    # Sort by timestamp (newest first)
    markets.sort(key=lambda m: m.get("timestamp", ""), reverse=True)
    
    return markets[0]


def get_settled_markets(username: str) -> set:
    """
    Get set of market addresses that have already been settled.
    Checks decision files in decider/{username}/ directory.
    
    Args:
        username: Username/streamer name
    
    Returns:
        Set of settled market addresses
    """
    decision_dir = Path(__file__).parent / username
    if not decision_dir.exists():
        return set()
    
    settled = set()
    for decision_file in decision_dir.glob("decision_*.json"):
        try:
            with open(decision_file, 'r') as f:
                decision_data = json.load(f)
                market_address = decision_data.get("market_address")
                if market_address and decision_data.get("settle_result", {}).get("success"):
                    settled.add(market_address)
        except (json.JSONDecodeError, IOError):
            continue
    
    return settled


def find_next_unsettled_market(username: str, wait_if_missing: bool = True, console: Console = None) -> dict:
    """
    Find the next market that needs to be settled.
    Returns the oldest unsettled market that has expired.
    
    Args:
        username: Username/streamer name
        wait_if_missing: If True, wait for markets.json to exist (default: True)
        console: Rich Console instance (optional)
    
    Returns:
        Market dictionary or None if no market needs settling
    """
    try:
        markets = load_markets_json(username, wait_if_missing=wait_if_missing, console=console)
    except FileNotFoundError:
        return None
    
    if not markets:
        return None
    
    settled_addresses = get_settled_markets(username)
    
    # Sort by timestamp (oldest first) to process markets in order
    markets.sort(key=lambda m: m.get("timestamp", ""))
    
    current_time = datetime.now()
    
    for market in markets:
        market_address = market.get("api_response", {}).get("market", "")
        
        # Skip if already settled
        if market_address in settled_addresses:
            continue
        
        # Check if market has expired
        timestamp_str = market.get("timestamp")
        if not timestamp_str:
            continue
        
        try:
            market_time = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            if market_time.tzinfo is None:
                market_time = market_time.replace(tzinfo=None)
            
            ollama_market = market.get("ollama_market", {})
            duration_minutes = ollama_market.get("duration_minutes", 5)
            expiration_time = market_time + timedelta(minutes=duration_minutes)
            
            # If market has expired, return it
            if current_time >= expiration_time:
                return market
        except (ValueError, TypeError):
            continue
    
    return None


def signal_handler(sig, frame):
    """Handle Ctrl+C gracefully."""
    global running
    print("\n\nShutting down gracefully...")
    running = False


def wait_until_market_expires(market: dict, console: Console = None) -> None:
    """
    Wait until the market duration has passed.
    
    Args:
        market: Market dict with 'timestamp' and 'ollama_market.duration_minutes'
        console: Rich Console instance (optional)
    """
    timestamp_str = market.get("timestamp")
    if not timestamp_str:
        raise ValueError("Market timestamp not found")
    
    # Parse timestamp
    market_time = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
    if market_time.tzinfo is None:
        # Assume local time if no timezone
        market_time = market_time.replace(tzinfo=None)
    
    # Get duration in minutes
    ollama_market = market.get("ollama_market", {})
    duration_minutes = ollama_market.get("duration_minutes", 5)
    
    # Calculate expiration time
    expiration_time = market_time + timedelta(minutes=duration_minutes)
    
    # Get current time (local)
    current_time = datetime.now()
    if market_time.tzinfo is None:
        # If market time has no timezone, compare with local time
        pass
    else:
        # Convert current time to same timezone
        if current_time.tzinfo is None:
            # Assume local timezone
            import time as time_module
            current_time = current_time.replace(tzinfo=datetime.now().astimezone().tzinfo)
    
    # Check if already expired
    if current_time >= expiration_time:
        if HAS_RICH and console:
            console.print(f"[yellow]Market already expired (expired at {expiration_time})[/yellow]")
        else:
            print(f"Market already expired (expired at {expiration_time})")
        return
    
    # Calculate wait time
    wait_seconds = (expiration_time - current_time).total_seconds()
    wait_minutes = wait_seconds / 60
    total_seconds = int(wait_seconds)
    
    if HAS_RICH and console:
        # Show countdown with progress bar
        console.print(f"\n[cyan]Market expires at:[/cyan] {expiration_time.strftime('%Y-%m-%d %H:%M:%S')}")
        console.print(f"[cyan]Current time:[/cyan] {current_time.strftime('%Y-%m-%d %H:%M:%S')}")
        console.print(f"[yellow]Waiting {wait_minutes:.1f} minutes ({total_seconds} seconds) until market expires...[/yellow]\n")
        
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
            TextColumn("•"),
            TextColumn("[cyan]{task.fields[time_remaining]}[/cyan]"),
            console=console,
            transient=False
        ) as progress:
            task = progress.add_task(
                "[yellow]Waiting for market expiration...[/yellow]",
                total=total_seconds,
                time_remaining=""
            )
            
            start_time = time.time()
            for i in range(total_seconds):
                elapsed = time.time() - start_time
                remaining = total_seconds - i
                remaining_minutes = remaining // 60
                remaining_seconds_display = remaining % 60
                
                # Update progress
                progress.update(
                    task,
                    advance=1,
                    time_remaining=f"{remaining_minutes:02d}:{remaining_seconds_display:02d} remaining"
                )
                time.sleep(1)
        
        console.print(f"[green]✓ Market expiration time reached![/green]\n")
    else:
        # Basic mode
        print(f"Market expires at: {expiration_time}")
        print(f"Current time: {current_time}")
        print(f"Waiting {wait_minutes:.1f} minutes ({total_seconds} seconds) until market expires...")
        
        # Show countdown
        for remaining in range(total_seconds, 0, -1):
            remaining_minutes = remaining // 60
            remaining_seconds_display = remaining % 60
            print(f"\rTime remaining: {remaining_minutes:02d}:{remaining_seconds_display:02d}", end="", flush=True)
            time.sleep(1)
        
        print(f"\nMarket expiration time reached!")


def settle_market_via_api(market_address: str, yes_winner: bool, api_url: str = MARKET_API_URL, console: Console = None, verbose: bool = True) -> dict:
    """
    Settle a prediction market via the API.
    
    Args:
        market_address: Market address from API response
        yes_winner: True if YES option won, False if NO option won
        api_url: Base URL for the API (default: MARKET_API_URL)
        console: Rich Console instance (optional)
        verbose: Whether to print detailed output (default: True)
    
    Returns:
        API response dictionary
    """
    endpoint = f"{api_url}/market/settle"
    
    payload = {
        "market": market_address,
        "yesWinner": yes_winner
    }
    
    try:
        if verbose:
            if HAS_RICH and console:
                console.print(f"[dim]Calling settle API: {endpoint}[/dim]")
            else:
                print(f"Calling settle API: {endpoint}")
                print(f"Settle data: {json.dumps(payload, indent=2)}")
        
        response = requests.post(endpoint, json=payload, timeout=30)
        response.raise_for_status()
        
        result = response.json()
        
        if result.get("success"):
            if verbose:
                if HAS_RICH and console:
                    console.print(f"[green]✓ Market settled successfully![/green]")
                    console.print(f"  [dim]Market address:[/dim] {result.get('market', 'N/A')}")
                    console.print(f"  [dim]Winner:[/dim] {result.get('winner', 'N/A')}")
                    console.print(f"  [dim]Transaction:[/dim] {result.get('signature', 'N/A')}")
                    if result.get('explorerUrl'):
                        console.print(f"  [blue]Explorer:[/blue] {result.get('explorerUrl')}")
                else:
                    print(f"✓ Market settled successfully!")
                    print(f"  Market address: {result.get('market', 'N/A')}")
                    print(f"  Winner: {result.get('winner', 'N/A')}")
                    print(f"  Transaction: {result.get('signature', 'N/A')}")
                    if result.get('explorerUrl'):
                        print(f"  Explorer: {result.get('explorerUrl')}")
            return result
        else:
            error_msg = result.get("error", "Unknown error")
            if HAS_RICH and console:
                console.print(f"[red]✗ API returned error: {error_msg}[/red]")
            else:
                print(f"✗ API returned error: {error_msg}")
            return result
            
    except requests.exceptions.RequestException as e:
        if HAS_RICH and console:
            console.print(f"[red]✗ Error calling settle API: {e}[/red]")
        else:
            print(f"✗ Error calling settle API: {e}", file=sys.stderr)
        raise
    except Exception as e:
        if HAS_RICH and console:
            console.print(f"[red]✗ Unexpected error calling settle API: {e}[/red]")
        else:
            print(f"✗ Unexpected error calling settle API: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        raise


def determine_yes_winner(market: dict, winning_option: str) -> bool:
    """
    Determine if YES won based on the winning option.
    
    Args:
        market: Market dict with 'ollama_market.options'
        winning_option: The winning option string from Ollama decision
    
    Returns:
        True if YES/Option A won, False if NO/Option B won
    """
    options = market.get("ollama_market", {}).get("options", [])
    
    if len(options) < 2:
        raise ValueError(f"Market must have at least 2 options, found: {options}")
    
    option_a = options[0]
    option_b = options[1]
    
    # Check if winning option matches Option A (YES)
    if winning_option.strip() == option_a.strip():
        return True
    elif winning_option.strip() == option_b.strip():
        return False
    else:
        # Try case-insensitive match
        winning_lower = winning_option.lower().strip()
        if winning_lower == option_a.lower().strip():
            return True
        elif winning_lower == option_b.lower().strip():
            return False
        else:
            raise ValueError(f"Winning option '{winning_option}' does not match any market option: {options}")


def decide_market_with_ollama(market: dict, baseline_frame: dict, current_frame: dict, model: str = DEFAULT_MODEL) -> dict:
    """Decide the winning option using Ollama based on market and frame data."""
    # Format the data as JSON strings for the prompt
    market_json = json.dumps(market, indent=2)
    baseline_analysis = baseline_frame.get("analysis", {})
    current_analysis = current_frame.get("analysis", {})
    
    baseline_json = json.dumps(baseline_analysis, indent=2)
    current_json = json.dumps(current_analysis, indent=2)
    
    user_prompt = f"""Analyze the following prediction market and game state data to determine which option has won.

MARKET DATA:
{market_json}

BASELINE STATE (when market was created - frame_id {market.get('frame_id')}):
{baseline_json}

CURRENT STATE (latest frame):
{current_json}

Based on the prediction type "{market.get('prediction_type')}", compare the baseline_value "{market.get('baseline_value')}" with the current game state and determine which option won: {market.get('options')}"""
    
    print(f"Sending data to Ollama ({model}) for market decision...")
    
    try:
        response = ollama.chat(
            model=model,
            messages=[
                {
                    'role': 'system',
                    'content': SYSTEM_PROMPT
                },
                {
                    'role': 'user',
                    'content': user_prompt
                }
            ]
        )
        
        # Extract response content
        if hasattr(response, 'message'):
            response_text = response.message.content
        elif isinstance(response, dict):
            response_text = response.get('message', {}).get('content', '')
        else:
            response_text = str(response)
        
        # Parse JSON from response
        # Try to extract JSON from markdown code blocks first
        json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response_text, re.DOTALL)
        if json_match:
            return json.loads(json_match.group(1))
        
        # Try to find JSON object directly
        json_match = re.search(r'(\{.*\})', response_text, re.DOTALL)
        if json_match:
            return json.loads(json_match.group(1))
        
        # Try parsing the whole response as JSON
        try:
            return json.loads(response_text)
        except json.JSONDecodeError:
            raise ValueError(f"Could not parse JSON from response: {response_text[:200]}...")
            
    except Exception as e:
        print(f"Error deciding market with Ollama: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        raise


def get_frame_by_id(context: dict, frame_id: int) -> dict:
    """Get a specific frame by frame_id."""
    frames = context.get("session", {}).get("frames", [])
    
    for frame in frames:
        if frame.get("frame_number") == frame_id:
            return frame
    
    raise ValueError(f"Frame ID {frame_id} not found")


def process_market(market: dict, username: str, model: str, api_url: str, skip_wait: bool, console: Console = None) -> bool:
    """
    Process and settle a single market.
    
    Args:
        market: Market dictionary
        username: Username/streamer name
        model: Ollama model name
        api_url: API base URL
        skip_wait: Whether to skip waiting for expiration
        console: Rich Console instance (optional)
    
    Returns:
        True if successful, False otherwise
    """
    try:
        market_id = market.get("ollama_market", {}).get("id", "unknown")
        frame_id = market.get("frame_id", "unknown")
        market_address = market.get("api_response", {}).get("market", "")
        
        if HAS_RICH and console:
            console.print(f"[green]✓ Market loaded[/green]")
            console.print(f"  [dim]Market ID:[/dim] {market_id}")
            console.print(f"  [dim]Market Address:[/dim] {market_address}")
            console.print(f"  [dim]Created from frame_id:[/dim] {frame_id}")
            console.print(f"  [dim]Created at:[/dim] {market.get('timestamp', 'unknown')}\n")
        else:
            print(f"Market ID: {market_id}")
            print(f"Market Address: {market_address}")
            print(f"Created from frame_id: {frame_id}")
            print(f"Created at: {market.get('timestamp', 'unknown')}")
        
        if not market_address:
            if HAS_RICH and console:
                console.print("[red]✗ Market address not found in market data[/red]")
            else:
                print("Error: Market address not found in market data")
            return False
        
        # Wait until market expires (unless --skip-wait)
        if not skip_wait:
            wait_until_market_expires(market, console=console)
        else:
            if HAS_RICH and console:
                console.print("[yellow]Skipping wait (--skip-wait flag set)[/yellow]\n")
            else:
                print("Skipping wait (--skip-wait flag set)")
        
        # Load game context
        if HAS_RICH and console:
            with console.status(f"[cyan]Loading game context for {username}...[/cyan]", spinner="dots"):
                context = load_game_context(username)
        else:
            print(f"\nLoading game context for {username}...")
            context = load_game_context(username)
        
        # Get baseline frame (when market was created)
        if HAS_RICH and console:
            with console.status(f"[cyan]Loading baseline frame (frame_id: {frame_id})...[/cyan]", spinner="dots"):
                baseline_frame = get_frame_by_id(context, frame_id)
        else:
            print(f"Loading baseline frame (frame_id: {frame_id})...")
            baseline_frame = get_frame_by_id(context, frame_id)
        
        # Get latest frame (current state)
        if HAS_RICH and console:
            with console.status(f"[cyan]Loading latest frame...[/cyan]", spinner="dots"):
                current_frame = get_latest_frame(context)
        else:
            print("Loading latest frame...")
            current_frame = get_latest_frame(context)
        
        current_frame_id = current_frame.get("frame_number", "unknown")
        
        if HAS_RICH and console:
            console.print(f"[green]✓ Current frame_id:[/green] {current_frame_id}\n")
        else:
            print(f"Current frame_id: {current_frame_id}")
        
        # Prepare market data for decision (combine ollama_market with frame_id)
        ollama_market_data = market.get("ollama_market", {})
        market_for_decision = {
            **ollama_market_data,
            "frame_id": frame_id
        }
        
        # Decide market using Ollama
        if HAS_RICH and console:
            with console.status("[yellow]Deciding market with Ollama...[/yellow]", spinner="dots"):
                decision = decide_market_with_ollama(
                    market_for_decision,
                    baseline_frame,
                    current_frame,
                    model
                )
        else:
            print("\nDeciding market with Ollama...")
            decision = decide_market_with_ollama(
                market_for_decision,
                baseline_frame,
                current_frame,
                model
            )
        
        winning_option = decision.get("winning_option", "")
        is_resolved = decision.get("is_resolved", False)
        
        if HAS_RICH and console:
            console.print(f"\n[bold green]Decision:[/bold green]")
            console.print(f"  [cyan]Winning Option:[/cyan] {winning_option}")
            console.print(f"  [cyan]Reason:[/cyan] {decision.get('reason', 'N/A')}")
            console.print(f"  [cyan]Is Resolved:[/cyan] {is_resolved}\n")
        else:
            print(f"\nDecision:")
            print(f"  Winning Option: {winning_option}")
            print(f"  Reason: {decision.get('reason', 'N/A')}")
            print(f"  Is Resolved: {is_resolved}")
        
        if not is_resolved:
            if HAS_RICH and console:
                console.print("[yellow]⚠ Warning: Market could not be definitively resolved. Proceeding anyway...[/yellow]\n")
            else:
                print("\n⚠ Warning: Market could not be definitively resolved. Proceeding anyway...")
        
        # Determine YES winner
        yes_winner = determine_yes_winner(market, winning_option)
        
        if HAS_RICH and console:
            console.print(f"[cyan]YES Winner:[/cyan] {yes_winner} [dim](Option A = YES, Option B = NO)[/dim]\n")
        else:
            print(f"\nYES Winner: {yes_winner} (Option A = YES, Option B = NO)")
        
        # Settle market via API
        if HAS_RICH and console:
            with console.status("[yellow]Settling market via API...[/yellow]", spinner="dots"):
                settle_result = settle_market_via_api(market_address, yes_winner, api_url, console=console, verbose=False)
            # Show result after spinner
            if settle_result.get("success"):
                console.print(f"[green]✓ Market settled successfully![/green]")
                console.print(f"  [dim]Market address:[/dim] {settle_result.get('market', 'N/A')}")
                console.print(f"  [dim]Winner:[/dim] {settle_result.get('winner', 'N/A')}")
                console.print(f"  [dim]Transaction:[/dim] {settle_result.get('signature', 'N/A')}")
                if settle_result.get('explorerUrl'):
                    console.print(f"  [blue]Explorer:[/blue] {settle_result.get('explorerUrl')}")
        else:
            print("\nSettling market via API...")
            settle_result = settle_market_via_api(market_address, yes_winner, api_url)
        
        # Combine output
        output = {
            "market_id": market_id,
            "market_address": market_address,
            "market_question": market.get("ollama_market", {}).get("question", ""),
            "market_options": market.get("ollama_market", {}).get("options", []),
            "baseline_frame_id": frame_id,
            "current_frame_id": current_frame_id,
            "decision": decision,
            "yes_winner": yes_winner,
            "settle_result": settle_result,
            "timestamp": datetime.now().isoformat()
        }
        
        # Determine output file path
        output_dir = Path(__file__).parent / username
        output_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = output_dir / f"decision_{timestamp}.json"
        
        # Save to file
        with open(output_path, 'w') as f:
            json.dump(output, f, indent=2)
        
        if HAS_RICH and console:
            console.print(f"[green]✓ Decision saved to:[/green] {output_path}\n")
        else:
            print(f"\n✓ Decision saved to: {output_path}")
        
        return True
        
    except Exception as e:
        if HAS_RICH and console:
            console.print(f"[red]✗ Error processing market: {e}[/red]\n")
        else:
            print(f"Error processing market: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return False


def main():
    global running
    
    parser = argparse.ArgumentParser(
        description="Decide the winning option for prediction markets using Ollama. Runs continuously, checking for new markets to settle."
    )
    parser.add_argument(
        "username",
        help="Username/streamer name (e.g., 'mantuuu')"
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"Ollama model to use (default: {DEFAULT_MODEL})"
    )
    parser.add_argument(
        "--api-url",
        default=MARKET_API_URL,
        help=f"API base URL (default: {MARKET_API_URL})"
    )
    parser.add_argument(
        "--check-interval",
        type=int,
        default=CHECK_INTERVAL_SECONDS,
        help=f"Interval between checks for new markets in seconds (default: {CHECK_INTERVAL_SECONDS})"
    )
    parser.add_argument(
        "--skip-wait",
        action="store_true",
        help="Skip waiting for market expiration (for testing)"
    )
    
    args = parser.parse_args()
    
    # Set up signal handler for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    
    # Initialize console
    console = Console() if HAS_RICH else None
    
    # Header
    if HAS_RICH and console:
        console.print("\n[bold cyan]PREDICTION MARKET DECIDER[/bold cyan]")
        console.print("=" * 60 + "\n")
        info_table = Table(show_header=False, box=None, padding=(0, 2))
        info_table.add_column(style="cyan")
        info_table.add_column(style="yellow")
        info_table.add_row("Username:", args.username)
        info_table.add_row("Ollama Model:", args.model)
        info_table.add_row("API URL:", args.api_url)
        info_table.add_row("Check Interval:", f"{args.check_interval} seconds")
        console.print(info_table)
        console.print("\n[yellow]Press Ctrl+C to stop[/yellow]\n")
    else:
        print("="*60)
        print("PREDICTION MARKET DECIDER")
        print("="*60)
        print(f"Username: {args.username}")
        print(f"Ollama Model: {args.model}")
        print(f"API URL: {args.api_url}")
        print(f"Check Interval: {args.check_interval} seconds")
        print("Press Ctrl+C to stop")
        print("="*60)
    
    cycle_count = 0
    # Track if we've found the markets file at least once
    markets_file_found = False
    
    try:
        while running:
            cycle_count += 1
            timestamp_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            if HAS_RICH and console:
                console.print(f"\n[bold cyan]{'='*60}[/bold cyan]")
                console.print(f"[bold cyan]CYCLE #{cycle_count}[/bold cyan] [dim]- {timestamp_str}[/dim]")
                console.print(f"[bold cyan]{'='*60}[/bold cyan]\n")
            else:
                print(f"\n{'='*60}")
                print(f"CYCLE #{cycle_count} - {timestamp_str}")
                print(f"{'='*60}")
            
            # Find next unsettled market
            # Wait for file on first call, then don't wait (to avoid blocking if file disappears)
            wait_for_file = not markets_file_found
            try:
                if HAS_RICH and console:
                    with console.status("[cyan]Checking for markets to settle...[/cyan]", spinner="dots"):
                        market = find_next_unsettled_market(args.username, wait_if_missing=wait_for_file, console=console)
                else:
                    print("Checking for markets to settle...")
                    market = find_next_unsettled_market(args.username, wait_if_missing=wait_for_file, console=console)
                
                # If we successfully checked (even if no market found), mark file as found
                # This prevents waiting on subsequent cycles if file temporarily disappears
                markets_file_found = True
                    
            except (FileNotFoundError, ValueError) as e:
                # Markets file doesn't exist or no markets yet
                if HAS_RICH and console:
                    console.print(f"[yellow]No markets available yet: {e}[/yellow]")
                else:
                    print(f"No markets available yet: {e}")
                market = None
            except Exception as e:
                if HAS_RICH and console:
                    console.print(f"[red]✗ Error checking for markets: {e}[/red]")
                else:
                    print(f"Error checking for markets: {e}", file=sys.stderr)
                market = None
            
            if market:
                if HAS_RICH and console:
                    console.print(f"[green]✓ Found market to settle[/green]\n")
                else:
                    print("Found market to settle\n")
                
                # Process the market
                success = process_market(
                    market,
                    args.username,
                    args.model,
                    args.api_url,
                    args.skip_wait,
                    console=console
                )
                
                if success:
                    if HAS_RICH and console:
                        console.print(f"[green]✓ Cycle #{cycle_count} completed successfully[/green]\n")
                    else:
                        print(f"\n✓ Cycle #{cycle_count} completed successfully")
                else:
                    if HAS_RICH and console:
                        console.print(f"[red]✗ Cycle #{cycle_count} failed[/red]\n")
                    else:
                        print(f"\n✗ Cycle #{cycle_count} failed")
            else:
                if HAS_RICH and console:
                    console.print("[yellow]No markets need settling at this time[/yellow]")
                else:
                    print("No markets need settling at this time")
            
            # Wait before next check (only if still running)
            if running:
                if HAS_RICH and console:
                    console.print(f"\n[yellow]Waiting {args.check_interval} seconds before next check...[/yellow]\n")
                    # Show countdown
                    with Progress(
                        SpinnerColumn(),
                        TextColumn("[progress.description]{task.description}"),
                        BarColumn(),
                        TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
                        TextColumn("•"),
                        TextColumn("[cyan]{task.fields[time_remaining]}[/cyan]"),
                        console=console,
                        transient=False
                    ) as progress:
                        task = progress.add_task(
                            "[yellow]Waiting for next check...[/yellow]",
                            total=args.check_interval,
                            time_remaining=""
                        )
                        
                        for i in range(args.check_interval):
                            if not running:
                                break
                            remaining = args.check_interval - i
                            remaining_minutes = remaining // 60
                            remaining_seconds_display = remaining % 60
                            progress.update(
                                task,
                                advance=1,
                                time_remaining=f"{remaining_minutes:02d}:{remaining_seconds_display:02d} remaining"
                            )
                            time.sleep(1)
                else:
                    print(f"\nWaiting {args.check_interval} seconds before next check...")
                    for _ in range(args.check_interval):
                        if not running:
                            break
                        time.sleep(1)
        
        if HAS_RICH and console:
            console.print(f"\n\n[yellow]Shutdown complete. Total cycles: {cycle_count}[/yellow]")
        else:
            print(f"\n\nShutdown complete. Total cycles: {cycle_count}")
        
        market_id = market.get("ollama_market", {}).get("id", "unknown")
        frame_id = market.get("frame_id", "unknown")
        market_address = market.get("api_response", {}).get("market", "")
        
        if HAS_RICH and console:
            console.print(f"[green]✓ Market loaded[/green]")
            console.print(f"  [dim]Market ID:[/dim] {market_id}")
            console.print(f"  [dim]Market Address:[/dim] {market_address}")
            console.print(f"  [dim]Created from frame_id:[/dim] {frame_id}")
            console.print(f"  [dim]Created at:[/dim] {market.get('timestamp', 'unknown')}\n")
        else:
            print(f"Market ID: {market_id}")
            print(f"Market Address: {market_address}")
            print(f"Created from frame_id: {frame_id}")
            print(f"Created at: {market.get('timestamp', 'unknown')}")
        
        if not market_address:
            raise ValueError("Market address not found in market data. Market may not have been created via API.")
        
        # Wait until market expires (unless --skip-wait)
        if not args.skip_wait:
            wait_until_market_expires(market, console=console)
        else:
            if HAS_RICH and console:
                console.print("[yellow]Skipping wait (--skip-wait flag set)[/yellow]\n")
            else:
                print("Skipping wait (--skip-wait flag set)")
        
        # Load game context
        if HAS_RICH and console:
            console.print(f"[cyan]Loading game context for {args.username}...[/cyan]")
        else:
            print(f"\nLoading game context for {args.username}...")
        
        context = load_game_context(args.username)
        
        # Get baseline frame (when market was created)
        if HAS_RICH and console:
            console.print(f"[cyan]Loading baseline frame (frame_id: {frame_id})...[/cyan]")
        else:
            print(f"Loading baseline frame (frame_id: {frame_id})...")
        
        baseline_frame = get_frame_by_id(context, frame_id)
        
        # Get latest frame (current state)
        if HAS_RICH and console:
            console.print(f"[cyan]Loading latest frame...[/cyan]")
        else:
            print("Loading latest frame...")
        
        current_frame = get_latest_frame(context)
        current_frame_id = current_frame.get("frame_number", "unknown")
        
        if HAS_RICH and console:
            console.print(f"[green]✓ Current frame_id:[/green] {current_frame_id}\n")
        else:
            print(f"Current frame_id: {current_frame_id}")
        
        # Prepare market data for decision (combine ollama_market with frame_id)
        ollama_market_data = market.get("ollama_market", {})
        market_for_decision = {
            **ollama_market_data,
            "frame_id": frame_id  # Add frame_id for the decision function
        }
        
        # Decide market using Ollama
        if HAS_RICH and console:
            with console.status("[yellow]Deciding market with Ollama...[/yellow]", spinner="dots"):
                decision = decide_market_with_ollama(
                    market_for_decision,
                    baseline_frame,
                    current_frame,
                    args.model
                )
        else:
            print("\nDeciding market with Ollama...")
            decision = decide_market_with_ollama(
                market_for_decision,
                baseline_frame,
                current_frame,
                args.model
            )
        
        winning_option = decision.get("winning_option", "")
        is_resolved = decision.get("is_resolved", False)
        
        if HAS_RICH and console:
            console.print(f"\n[bold green]Decision:[/bold green]")
            console.print(f"  [cyan]Winning Option:[/cyan] {winning_option}")
            console.print(f"  [cyan]Reason:[/cyan] {decision.get('reason', 'N/A')}")
            console.print(f"  [cyan]Is Resolved:[/cyan] {is_resolved}\n")
        else:
            print(f"\nDecision:")
            print(f"  Winning Option: {winning_option}")
            print(f"  Reason: {decision.get('reason', 'N/A')}")
            print(f"  Is Resolved: {is_resolved}")
        
        if not is_resolved:
            if HAS_RICH and console:
                console.print("[yellow]⚠ Warning: Market could not be definitively resolved. Proceeding anyway...[/yellow]\n")
            else:
                print("\n⚠ Warning: Market could not be definitively resolved. Proceeding anyway...")
        
        # Determine YES winner
        yes_winner = determine_yes_winner(market, winning_option)
        
        if HAS_RICH and console:
            console.print(f"[cyan]YES Winner:[/cyan] {yes_winner} [dim](Option A = YES, Option B = NO)[/dim]\n")
        else:
            print(f"\nYES Winner: {yes_winner} (Option A = YES, Option B = NO)")
        
        # Settle market via API
        if HAS_RICH and console:
            with console.status("[yellow]Settling market via API...[/yellow]", spinner="dots"):
                settle_result = settle_market_via_api(market_address, yes_winner, args.api_url)
        else:
            print("\nSettling market via API...")
            settle_result = settle_market_via_api(market_address, yes_winner, args.api_url)
        
        # Combine output
        output = {
            "market_id": market_id,
            "market_address": market_address,
            "market_question": market.get("ollama_market", {}).get("question", ""),
            "market_options": market.get("ollama_market", {}).get("options", []),
            "baseline_frame_id": frame_id,
            "current_frame_id": current_frame_id,
            "decision": decision,
            "yes_winner": yes_winner,
            "settle_result": settle_result,
            "timestamp": datetime.now().isoformat()
        }
        
        # Determine output file path
        if args.output:
            output_path = Path(args.output)
        else:
            # Default: decider/{username}/decision_{timestamp}.json
            output_dir = Path(__file__).parent / args.username
            output_dir.mkdir(parents=True, exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_path = output_dir / f"decision_{timestamp}.json"
        
        # Ensure output directory exists
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Save to file
        with open(output_path, 'w') as f:
            json.dump(output, f, indent=2)
        
        if HAS_RICH and console:
            console.print(f"[green]✓ Decision saved to:[/green] {output_path}\n")
        else:
            print(f"\n✓ Decision saved to: {output_path}")
        
        # Print summary
        if HAS_RICH and console:
            console.print("[bold cyan]" + "="*60 + "[/bold cyan]")
            console.print("[bold cyan]MARKET DECISION SUMMARY[/bold cyan]")
            console.print("[bold cyan]" + "="*60 + "[/bold cyan]\n")
            console.print(f"[cyan]Market:[/cyan] {market_address}")
            console.print(f"[cyan]Question:[/cyan] {output['market_question']}")
            console.print(f"[cyan]Winning Option:[/cyan] {winning_option}")
            console.print(f"[cyan]YES Winner:[/cyan] {yes_winner}")
            console.print(f"[cyan]Settled:[/cyan] {settle_result.get('success', False)}")
            if settle_result.get('success'):
                console.print(f"[green]Winner:[/green] {settle_result.get('winner', 'N/A')}")
                console.print(f"[green]Transaction:[/green] {settle_result.get('signature', 'N/A')}")
                if settle_result.get('explorerUrl'):
                    console.print(f"[blue]Explorer:[/blue] {settle_result.get('explorerUrl')}")
        else:
            print("\n" + "="*60)
            print("MARKET DECISION SUMMARY:")
            print("="*60)
            print(f"Market: {market_address}")
            print(f"Question: {output['market_question']}")
            print(f"Winning Option: {winning_option}")
            print(f"YES Winner: {yes_winner}")
            print(f"Settled: {settle_result.get('success', False)}")
            if settle_result.get('success'):
                print(f"Winner: {settle_result.get('winner', 'N/A')}")
                print(f"Transaction: {settle_result.get('signature', 'N/A')}")
        
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
