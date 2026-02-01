#!/usr/bin/env python3
"""
Script to generate prediction markets from CS2/CS:GO game context using Ollama.
Reads game_context.json and generates markets based on the frame analysis data.
"""

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

import ollama

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

### MARKET REQUIREMENTS:
- Duration: Must be short-term (3, 5, or 10 minutes).
- Binary: Only two mutually exclusive outcomes (Yes/No or Team A/Team B).
- Quantifiable: Must be based on objective HUD data (Kills, Score, Plant/Defuse, or Money).
- Verifiable: A user watching the stream must be able to confirm the result via the scoreboard.

### OUTPUT FORMAT:
Return ONLY a JSON object. Do not include conversational text or markdown blocks outside the JSON.

{
  "id": "number",
  "question": "string",
  "duration_minutes": integer,
  "options": ["Option A", "Option B"],
  "baseline_value": "The current value at the time of the data to measure against",
  "prediction_type": "Kills | Score | Economy | Objective"
}
"""

# Default Ollama model
DEFAULT_MODEL = "gemini-3-flash-preview"


def load_game_context(username: str) -> dict:
    """Load game context JSON file for the given username."""
    # Path relative to agents directory
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


def get_frame_by_number(context: dict, frame_number: int) -> dict:
    """Get a specific frame by frame number."""
    frames = context.get("session", {}).get("frames", [])
    
    for frame in frames:
        if frame.get("frame_number") == frame_number:
            return frame
    
    raise ValueError(f"Frame number {frame_number} not found")


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


def main():
    parser = argparse.ArgumentParser(
        description="Generate prediction markets from CS2/CS:GO game context using Ollama"
    )
    parser.add_argument(
        "username",
        help="Username/streamer name (e.g., 'zeus')"
    )
    parser.add_argument(
        "--frame",
        type=int,
        help="Specific frame number to use (default: latest frame)"
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
        help="Output file path (default: creator/{username}/market_{timestamp}.json)"
    )
    
    args = parser.parse_args()
    
    try:
        # Load game context
        print(f"Loading game context for {args.username}...")
        context = load_game_context(args.username)
        
        # Get frame
        if args.frame:
            print(f"Using frame number {args.frame}...")
            frame = get_frame_by_number(context, args.frame)
        else:
            print("Using latest frame...")
            frame = get_latest_frame(context)
        
        frame_id = frame.get("frame_number", "unknown")
        print(f"Frame #{frame_id} selected")
        
        # Get frame analysis data
        frame_analysis = frame.get("analysis")
        if not frame_analysis:
            raise ValueError("Frame analysis data not found")
        
        print(f"Frame analysis data loaded")
        
        # Generate market
        market = generate_market_with_ollama(frame_analysis, args.model)
        
        # Add frame_id to output
        output = {
            "frame_id": frame_id,
            **market
        }
        
        # Determine output file path
        if args.output:
            output_path = Path(args.output)
        else:
            # Default: creator/{username}/market_{timestamp}.json
            output_dir = Path(__file__).parent / args.username
            output_dir.mkdir(parents=True, exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_path = output_dir / f"market_{timestamp}.json"
        
        # Ensure output directory exists
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Save to file
        with open(output_path, 'w') as f:
            json.dump(output, f, indent=2)
        
        print(f"\n✓ Market saved to: {output_path}")
        
        # Print output as JSON
        print("\n" + "="*60)
        print("PREDICTION MARKET:")
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
