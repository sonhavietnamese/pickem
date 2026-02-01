#!/usr/bin/env python3
"""
Script to generate prediction markets from CS2/CS:GO game context using Ollama.
Reads game_context.json and generates markets based on the frame analysis data.
Runs continuously in a loop every 3 minutes and creates markets via API.
"""

import argparse
import json
import re
import signal
import sys
import time
from datetime import datetime
from pathlib import Path

import ollama
import requests

# Import rich for visual indicators
try:
    from rich.console import Console
    from rich.panel import Panel
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

# System prompt for prediction market generation
SYSTEM_PROMPT = """Act as a CS2/CS:GO Live Prediction Market Generator. Your task is to analyze the provided game state data (extracted from gameplay), and generate one short-term prediction market.

### DATA PROVIDED:
The game state data includes:
- Current Round Score (team1 vs team2)
- Round Timer
- Number of players alive on each side
- Player Economy/Money
- Player Loadouts/Weapons
- Recent Kills
- Team compositions
- Individual player stats (health, money, weapons)

### MARKET REQUIREMENTS:
- Duration: Must be short-term (5 minutes).
- Binary: Only two mutually exclusive outcomes (Yes/No or Option A/Option B).
- AVOID generic "who will win" or "team A vs team B" questions - these are too common and boring.
- PRIORITIZE diverse, specific, and interesting predictions based on:
  * Individual player actions (e.g., "Will [Player Name] get a kill in the next round?", "Will [Player Name] survive the round?")
  * Economy changes (e.g., "Will any player's money exceed $5000?", "Will the team's total economy increase?")
  * Weapon usage (e.g., "Will [Player Name] use an AWP?", "Will a player buy a specific weapon?")
  * Kill-related events (e.g., "Will there be a headshot kill?", "Will [Player Name] get 2+ kills?")
  * Objective events (e.g., "Will the bomb be planted?", "Will the round end by defuse?")
  * Score changes (e.g., "Will Team 1 score reach X?", "Will the score difference change?")
- Be creative and specific - focus on measurable, quantifiable events that can be verified from the game state.
- Use actual player names from the data when available.

### OUTPUT FORMAT:
Return ONLY a JSON object. Do not include conversational text or markdown blocks outside the JSON.

{
  "id": "number",
  "question": "string",
  "duration_minutes": integer,
  "options": ["Option A", "Option B"],
  "baseline_value": "The current value at the time of the data to measure against",
  "prediction_type": "Kills | Score | Economy | Objective | Weapon | Player"
}
"""

# Default Ollama model
DEFAULT_MODEL = "gemini-3-flash-preview"

# Loop interval in seconds (3 minutes)
LOOP_INTERVAL_SECONDS = 180

# Default initial liquidity (10 USDC with 6 decimals = 10000000)
DEFAULT_INITIAL_LIQUIDITY = 10000000

# Global flag for graceful shutdown
running = True

# Retry interval for waiting for game context (seconds)
GAME_CONTEXT_RETRY_INTERVAL = 5


def wait_for_game_context(context_path: Path, console=None, retry_interval: int = GAME_CONTEXT_RETRY_INTERVAL) -> None:
    """
    Wait for game context file to exist, retrying every retry_interval seconds.
    
    Args:
        context_path: Path to the game_context.json file
        console: Rich Console instance (optional)
        retry_interval: Seconds to wait between retries (default: 5)
    """
    while not context_path.exists() and running:
        if HAS_RICH and console:
            console.print(f"[yellow]Waiting for game context file: {context_path}[/yellow]")
            console.print(f"[dim]Retrying in {retry_interval} seconds...[/dim]")
        else:
            print(f"Waiting for game context file: {context_path}")
            print(f"Retrying in {retry_interval} seconds...")
        
        # Wait for retry_interval seconds, but check running flag periodically
        for _ in range(retry_interval):
            if not running:
                return
            time.sleep(1)
    
    if not running:
        return
    
    if HAS_RICH and console:
        console.print(f"[green]✓ Game context file found![/green]")
    else:
        print(f"Game context file found!")


def load_game_context(username: str, wait_if_missing: bool = True, console=None) -> dict:
    """
    Load game context JSON file for the given username.
    
    Args:
        username: Username/streamer name
        wait_if_missing: If True, wait for file to exist (default: True)
        console: Rich Console instance (optional)
    
    Returns:
        Game context dictionary
    
    Raises:
        FileNotFoundError: If file doesn't exist and wait_if_missing is False
    """
    # Path relative to agents directory
    context_path = Path(__file__).parent.parent / "watcher" / username / "game_context.json"
    
    # Wait for file if it doesn't exist
    if wait_if_missing and not context_path.exists():
        wait_for_game_context(context_path, console=console)
    
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


def get_frame_by_number(context: dict, frame_number: int) -> dict:
    """Get a specific frame by frame number."""
    frames = context.get("session", {}).get("frames", [])
    
    for frame in frames:
        if frame.get("frame_number") == frame_number:
            return frame
    
    raise ValueError(f"Frame number {frame_number} not found")


def create_market_via_api(market_data: dict, api_url: str = MARKET_API_URL, console: Console = None, verbose: bool = True) -> dict:
    """
    Create a prediction market via the API.
    
    Args:
        market_data: Market data in API format with keys: question, initialLiquidity, endTime
        api_url: Base URL for the API (default: MARKET_API_URL)
        console: Rich Console instance (optional)
        verbose: Whether to print detailed output (default: True)
    
    Returns:
        API response dictionary
    """
    endpoint = f"{api_url}/market/create"
    
    try:
        if verbose:
            if HAS_RICH and console:
                console.print(f"[dim]Calling API: {endpoint}[/dim]")
            else:
                print(f"Calling API: {endpoint}")
                print(f"Market data: {json.dumps(market_data, indent=2)}")
        
        response = requests.post(endpoint, json=market_data, timeout=30)
        response.raise_for_status()
        
        result = response.json()
        
        if result.get("success"):
            if HAS_RICH and console:
                console.print(f"[green]✓ Market created successfully![/green]")
                console.print(f"  [dim]Market address:[/dim] {result.get('market', 'N/A')}")
                console.print(f"  [dim]Transaction:[/dim] {result.get('signature', 'N/A')}")
                if result.get('explorerUrl'):
                    console.print(f"  [blue]Explorer:[/blue] {result.get('explorerUrl')}")
            else:
                print(f"✓ Market created successfully!")
                print(f"  Market address: {result.get('market', 'N/A')}")
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
            console.print(f"[red]✗ Error calling API: {e}[/red]")
        else:
            print(f"✗ Error calling API: {e}", file=sys.stderr)
        raise
    except Exception as e:
        if HAS_RICH and console:
            console.print(f"[red]✗ Unexpected error calling API: {e}[/red]")
        else:
            print(f"✗ Unexpected error calling API: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        raise


def map_ollama_market_to_api(ollama_market: dict, initial_liquidity: int = DEFAULT_INITIAL_LIQUIDITY) -> dict:
    """
    Map Ollama-generated market data to API format.
    
    Args:
        ollama_market: Market data from Ollama with keys: question, duration_minutes, options, etc.
        initial_liquidity: Initial liquidity in smallest units (default: 10 USDC)
    
    Returns:
        API-formatted market data
    """
    question = ollama_market.get("question", "")
    duration_minutes = ollama_market.get("duration_minutes", 5)
    
    # Convert duration from minutes to seconds
    end_time_seconds = duration_minutes * 60
    
    # Build the API request
    api_data = {
        "question": question,
        "initialLiquidity": initial_liquidity,
        "endTime": end_time_seconds,
        "yesOddsBps": 5000,  # Default 50% odds
    }
    
    return api_data


def generate_market_with_ollama(frame_analysis: dict, model: str = DEFAULT_MODEL) -> dict:
    """Generate a prediction market using Ollama based on frame analysis data."""
    # Format the frame analysis data as JSON string for the prompt
    analysis_json = json.dumps(frame_analysis, indent=2)
    
    user_prompt = f"""Analyze the following CS2/CS:GO game state data and generate one prediction market based on the current match state.

Game State Data:
{analysis_json}

Generate one prediction market that is short-term, binary, quantifiable, and verifiable."""
    
    print(f"Sending game state data to Ollama ({model}) for market generation...")
    
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
        print(f"Error generating market with Ollama: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        raise


def signal_handler(sig, frame):
    """Handle Ctrl+C gracefully."""
    global running
    # Note: console is not available in signal handler context
    print("\n\nShutting down gracefully...")
    running = False


def process_market_creation(username: str, model: str, api_url: str, initial_liquidity: int, console: Console = None):
    """
    Process one market creation cycle: load context, generate market, create via API.
    
    Args:
        username: Username/streamer name
        model: Ollama model name
        api_url: API base URL
        initial_liquidity: Initial liquidity amount
        console: Rich Console instance (optional)
    
    Returns:
        True if successful, False otherwise
    """
    try:
        timestamp_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # Load game context (will wait if file doesn't exist)
        if HAS_RICH and console:
            with console.status(f"[cyan]Loading game context for {username}...[/cyan]", spinner="dots"):
                context = load_game_context(username, wait_if_missing=True, console=console)
        else:
            print(f"\n[{timestamp_str}] Loading game context for {username}...")
            context = load_game_context(username, wait_if_missing=True)
        
        # Get latest frame
        if HAS_RICH and console:
            with console.status("[cyan]Getting latest frame...[/cyan]", spinner="dots"):
                frame = get_latest_frame(context)
        else:
            print("Using latest frame...")
            frame = get_latest_frame(context)
        
        frame_id = frame.get("frame_number", "unknown")
        
        if HAS_RICH and console:
            console.print(f"[green]✓ Frame #{frame_id} selected[/green]")
        else:
            print(f"Frame #{frame_id} selected")
        
        # Get frame analysis data
        frame_analysis = frame.get("analysis")
        if not frame_analysis:
            if HAS_RICH and console:
                console.print("[yellow]⚠ Warning: Frame analysis data not found, skipping this cycle[/yellow]")
            else:
                print("Warning: Frame analysis data not found, skipping this cycle")
            return False
        
        if HAS_RICH and console:
            console.print("[green]✓ Frame analysis data loaded[/green]")
        else:
            print("Frame analysis data loaded")
        
        # Generate market with Ollama
        if HAS_RICH and console:
            with console.status(f"[yellow]Generating market with Ollama ({model})...[/yellow]", spinner="dots"):
                ollama_market = generate_market_with_ollama(frame_analysis, model)
        else:
            print("Generating market with Ollama...")
            ollama_market = generate_market_with_ollama(frame_analysis, model)
        
        # Display generated market
        if HAS_RICH and console:
            console.print("\n[bold green]Generated Market:[/bold green]")
            market_table = Table(show_header=False, box=None, padding=(0, 2))
            market_table.add_column(style="cyan")
            market_table.add_column(style="yellow")
            market_table.add_row("Question:", ollama_market.get("question", "N/A"))
            market_table.add_row("Duration:", f"{ollama_market.get('duration_minutes', 0)} minutes")
            market_table.add_row("Options:", " | ".join(ollama_market.get("options", [])))
            market_table.add_row("Type:", ollama_market.get("prediction_type", "N/A"))
            market_table.add_row("Baseline:", ollama_market.get("baseline_value", "N/A"))
            console.print(market_table)
        else:
            print(f"\nGenerated market:")
            print(json.dumps(ollama_market, indent=2))
        
        # Map to API format
        api_market_data = map_ollama_market_to_api(ollama_market, initial_liquidity)
        
        # Create market via API
        if HAS_RICH and console:
            with console.status("[yellow]Creating market via API...[/yellow]", spinner="dots"):
                api_result = create_market_via_api(api_market_data, api_url, console=console, verbose=False)
            # Show result after spinner
            if api_result.get("success"):
                console.print(f"[green]✓ Market created successfully![/green]")
                console.print(f"  [dim]Market address:[/dim] {api_result.get('market', 'N/A')}")
                console.print(f"  [dim]Transaction:[/dim] {api_result.get('signature', 'N/A')}")
                if api_result.get('explorerUrl'):
                    console.print(f"  [blue]Explorer:[/blue] {api_result.get('explorerUrl')}")
        else:
            print("\nCreating market via API...")
            api_result = create_market_via_api(api_market_data, api_url)
        
        # Save to file for reference
        output_dir = Path(__file__).parent / username
        output_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = output_dir / f"market_{timestamp}.json"
        
        output = {
            "frame_id": frame_id,
            "timestamp": datetime.now().isoformat(),
            "ollama_market": ollama_market,
            "api_request": api_market_data,
            "api_response": api_result
        }
        
        # Save individual market file
        with open(output_path, 'w') as f:
            json.dump(output, f, indent=2)
        
        if HAS_RICH and console:
            console.print(f"[green]✓ Market data saved to:[/green] {output_path}")
        else:
            print(f"\n✓ Market data saved to: {output_path}")
        
        # Also save to markets.json array
        markets_json_path = output_dir / "markets.json"
        markets = []
        
        # Load existing markets if file exists
        if markets_json_path.exists():
            try:
                with open(markets_json_path, 'r') as f:
                    markets = json.load(f)
            except (json.JSONDecodeError, IOError):
                if HAS_RICH and console:
                    console.print("[yellow]Warning: Could not load existing markets.json, starting fresh[/yellow]")
                else:
                    print("Warning: Could not load existing markets.json, starting fresh")
                markets = []
        
        # Add new market to array
        markets.append(output)
        
        # Save updated markets array
        with open(markets_json_path, 'w') as f:
            json.dump(markets, f, indent=2)
        
        if HAS_RICH and console:
            console.print(f"[green]✓ Market added to:[/green] {markets_json_path} [dim](Total markets: {len(markets)})[/dim]\n")
        else:
            print(f"✓ Market added to: {markets_json_path} (Total markets: {len(markets)})")
        return True
        
    except FileNotFoundError as e:
        if HAS_RICH and console:
            console.print(f"[red]✗ Error: {e}[/red]")
        else:
            print(f"Error: {e}", file=sys.stderr)
        return False
    except ValueError as e:
        if HAS_RICH and console:
            console.print(f"[red]✗ Error: {e}[/red]")
        else:
            print(f"Error: {e}", file=sys.stderr)
        return False
    except Exception as e:
        if HAS_RICH and console:
            console.print(f"[red]✗ Unexpected error: {e}[/red]")
        else:
            print(f"Unexpected error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return False


def main():
    global running
    
    parser = argparse.ArgumentParser(
        description="Generate prediction markets from CS2/CS:GO game context using Ollama. Runs continuously every 3 minutes."
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
        "--interval",
        type=int,
        default=LOOP_INTERVAL_SECONDS,
        help=f"Loop interval in seconds (default: {LOOP_INTERVAL_SECONDS})"
    )
    parser.add_argument(
        "--initial-liquidity",
        type=int,
        default=DEFAULT_INITIAL_LIQUIDITY,
        help=f"Initial liquidity in smallest units (default: {DEFAULT_INITIAL_LIQUIDITY} = 10 USDC)"
    )
    
    args = parser.parse_args()
    
    # Initialize console
    console = Console() if HAS_RICH else None
    
    # Set up signal handler for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    
    # Header
    if HAS_RICH and console:
        console.print("\n[bold cyan]PREDICTION MARKET CREATOR[/bold cyan]")
        console.print("=" * 60 + "\n")
        info_table = Table(show_header=False, box=None, padding=(0, 2))
        info_table.add_column(style="cyan")
        info_table.add_column(style="yellow")
        info_table.add_row("Username:", args.username)
        info_table.add_row("Ollama Model:", args.model)
        info_table.add_row("API URL:", args.api_url)
        info_table.add_row("Loop Interval:", f"{args.interval} seconds ({args.interval // 60} minutes)")
        info_table.add_row("Initial Liquidity:", f"{args.initial_liquidity} ({args.initial_liquidity / 1000000:.2f} USDC)")
        console.print(info_table)
        console.print("\n[yellow]Press Ctrl+C to stop[/yellow]\n")
    else:
        print("="*60)
        print("PREDICTION MARKET CREATOR")
        print("="*60)
        print(f"Username: {args.username}")
        print(f"Ollama Model: {args.model}")
        print(f"API URL: {args.api_url}")
        print(f"Loop Interval: {args.interval} seconds ({args.interval // 60} minutes)")
        print(f"Initial Liquidity: {args.initial_liquidity} ({args.initial_liquidity / 1000000:.2f} USDC)")
        print("Press Ctrl+C to stop")
        print("="*60)
    
    cycle_count = 0
    
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
        
        success = process_market_creation(
            args.username,
            args.model,
            args.api_url,
            args.initial_liquidity,
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
        
        # Wait for next interval (only if still running)
        if running:
            if HAS_RICH and console:
                console.print(f"[yellow]Waiting {args.interval} seconds until next cycle...[/yellow]\n")
                # Show countdown with progress
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
                        "[yellow]Waiting for next cycle...[/yellow]",
                        total=args.interval,
                        time_remaining=""
                    )
                    
                    for i in range(args.interval):
                        if not running:
                            break
                        remaining = args.interval - i
                        remaining_minutes = remaining // 60
                        remaining_seconds_display = remaining % 60
                        progress.update(
                            task,
                            advance=1,
                            time_remaining=f"{remaining_minutes:02d}:{remaining_seconds_display:02d} remaining"
                        )
                        time.sleep(1)
            else:
                print(f"\nWaiting {args.interval} seconds until next cycle...")
                # Sleep in small increments to check running flag
                for _ in range(args.interval):
                    if not running:
                        break
                    time.sleep(1)
    
    if HAS_RICH and console:
        console.print(f"\n\n[yellow]Shutdown complete. Total cycles: {cycle_count}[/yellow]")
    else:
        print(f"\n\nShutdown complete. Total cycles: {cycle_count}")


if __name__ == "__main__":
    main()
