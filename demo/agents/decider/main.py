#!/usr/bin/env python3
"""
Script to decide the winning option for a prediction market.
Reads market data and latest game context frame, then uses Ollama to determine the winner.
"""

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

import ollama

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


def find_latest_market(username: str) -> Path:
    """Find the latest market file for the given username."""
    market_dir = Path(__file__).parent.parent / "creator" / username
    
    if not market_dir.exists():
        raise FileNotFoundError(f"Market directory not found: {market_dir}")
    
    # Find all market JSON files
    market_files = list(market_dir.glob("market_*.json"))
    
    if not market_files:
        raise FileNotFoundError(f"No market files found in {market_dir}")
    
    # Sort by modification time (newest first)
    market_files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    
    return market_files[0]


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


def main():
    parser = argparse.ArgumentParser(
        description="Decide the winning option for a prediction market using Ollama"
    )
    parser.add_argument(
        "username",
        help="Username/streamer name (e.g., 'zeus')"
    )
    parser.add_argument(
        "--market",
        "-m",
        type=str,
        help="Path to market JSON file (default: latest market file for username)"
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"Ollama model to use (default: {DEFAULT_MODEL})"
    )
    parser.add_argument(
        "--output",
        "-o",
        type=str,
        help="Output file path (default: decider/{username}/decision_{timestamp}.json)"
    )
    
    args = parser.parse_args()
    
    try:
        # Load market
        if args.market:
            print(f"Loading market from {args.market}...")
            market_path = Path(args.market)
            market = load_market(str(market_path))
        else:
            print(f"Finding latest market for {args.username}...")
            market_path = find_latest_market(args.username)
            print(f"Using market file: {market_path}")
            market = load_market(str(market_path))
        
        market_id = market.get("id", "unknown")
        frame_id = market.get("frame_id", "unknown")
        print(f"Market ID: {market_id}, Created from frame_id: {frame_id}")
        
        # Load game context
        print(f"Loading game context for {args.username}...")
        context = load_game_context(args.username)
        
        # Get baseline frame (when market was created)
        print(f"Loading baseline frame (frame_id: {frame_id})...")
        baseline_frame = get_frame_by_id(context, frame_id)
        
        # Get latest frame (current state)
        print("Loading latest frame...")
        current_frame = get_latest_frame(context)
        current_frame_id = current_frame.get("frame_number", "unknown")
        print(f"Current frame_id: {current_frame_id}")
        
        # Decide market
        decision = decide_market_with_ollama(market, baseline_frame, current_frame, args.model)
        
        # Combine output
        output = {
            "market_id": market_id,
            "market_question": market.get("question"),
            "market_options": market.get("options"),
            "baseline_frame_id": frame_id,
            "current_frame_id": current_frame_id,
            "decision": decision
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
        
        print(f"\n✓ Decision saved to: {output_path}")
        
        # Print output as JSON
        print("\n" + "="*60)
        print("MARKET DECISION:")
        print("="*60)
        print(json.dumps(output, indent=2))
        
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
