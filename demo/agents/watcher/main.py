import argparse
import base64
import json
import os
import re
import signal
import sys
import time
from datetime import datetime
from typing import Dict, Optional

import cv2
import ollama
import streamlink

INTERVAL_SECONDS = 10

# Ollama model name
MODEL_NAME = 'gemini-3-flash-preview'

# Global flag for graceful shutdown
running = True

SYSTEM_PROMPT = """
what do you see in this csgo game image? let focusing only csgo related:
- map
- gun
- skins 
- score board
- money
- players

Return your response as a valid JSON object with the following structure:
{
  "map": "string",
  "weapon": [
    {
      "name": "string",
      "type": "string",
      "skin": "string",
      "ammo": "number",
      "is_active": "boolean"
    }
  ],
  "state": {
    "timer": "number",
    "score": {
      "team1": "number",
      "team2": "number"
    },
    "players": {
      "team1": "number",
      "team2": "number"
    }
  },
  "player": {
    "health": "number",
    "money": "number"
  },
  "teams": [
    {
      "name": "string",
      "score": "number",
      "players": [
        {
          "name": "string",
          "health": "number",
          "money": "number"
        }
      ]
    }
  ],
  "kills": [
    {
      "killer": "string",
      "victim": "string",
      "weapon": "string"
    }
  ]
}
"""


def get_twitch_stream_url(username: str) -> Optional[str]:
    try:
        # Use streamlink Python API to get the stream URL
        url = f'https://www.twitch.tv/{username}'
        streams = streamlink.streams(url)
        
        if not streams:
            print(f"No streams available for {username}")
            return None
        
        # Get the best quality stream
        stream = streams.get('best') or streams.get('worst') or list(streams.values())[0]
        
        # Get the URL from the stream object
        stream_url = stream.url
        
        print(f"Stream URL obtained: {stream_url}")
        return stream_url
    except Exception as e:
        print(f"Error getting stream URL: {e}")
        return None


def capture_current_frame(stream_url: str, streamer: str) -> Optional[tuple]:
    try:
        # Open the video stream
        cap = cv2.VideoCapture(stream_url)
        
        if not cap.isOpened():
            print("Error: Could not open video stream")
            return None, None
        
        # Read the current frame
        ret, frame = cap.read()
        
        if not ret:
            print("Error: Could not read frame from stream")
            cap.release()
            return None, None
        
        # Release the capture
        cap.release()
        
        print(f"Frame captured successfully. Shape: {frame.shape}")
        
        # Debug: Save the frame as an image file (JPG)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        debug_dir = os.path.join(streamer, "debug")
        os.makedirs(debug_dir, exist_ok=True)
        debug_filename = os.path.join(debug_dir, f"frame_{timestamp}.jpg")
        cv2.imwrite(debug_filename, frame)
        print(f"Debug: Frame saved to {debug_filename}")
        
        return frame, debug_filename
        
    except Exception as e:
        print(f"Error capturing frame: {e}")
        return None, None


def analyze_frame_with_ollama(frame, frame_filename: str, system_prompt: str) -> Optional[Dict]:
    try:
        # Read the image file as bytes and encode to base64
        with open(frame_filename, 'rb') as f:
            image_bytes = f.read()
        
        # Convert image bytes to base64 for Ollama
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')
        
        # Prepare the prompt with system instruction
        user_prompt = "Analyze this CS:GO game image and return the JSON response according to the specified structure."
        
        # Send image to Ollama with Gemma3
        # Ollama accepts base64-encoded images in the images array
        print(f"Sending image to Ollama ({MODEL_NAME}) for analysis...")
        response = ollama.chat(
            model=MODEL_NAME,
            messages=[
                {
                    'role': 'system',
                    'content': system_prompt
                },
                {
                    'role': 'user',
                    'content': user_prompt,
                    'images': [image_base64]
                }
            ]
        )
        
        # Extract the response text - Ollama returns a response object
        # The structure might be response.message.content or just response['message']['content']
        if hasattr(response, 'message'):
            response_text = response.message.content
        elif isinstance(response, dict):
            response_text = response.get('message', {}).get('content', '')
        else:
            response_text = str(response)
        
        # Parse the response as JSON
        try:
            result = json.loads(response_text)
            return result
        except json.JSONDecodeError:
            # If response is not valid JSON, try to extract JSON from markdown code blocks
            json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response_text, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(1))
            # Try to find JSON object directly
            json_match = re.search(r'(\{.*\})', response_text, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(1))
            # If still not found, return the raw text wrapped in a dict
            print(f"Warning: Could not parse JSON. Raw response: {response_text[:200]}...")
            return {"raw_response": response_text, "error": "Failed to parse as JSON"}
                
    except Exception as e:
        print(f"Error analyzing frame with Ollama: {e}")
        import traceback
        traceback.print_exc()
        return None


def load_game_context(output_file: str, streamer: str) -> Dict:
    """Load existing game context from JSON file or create new structure."""
    if os.path.exists(output_file):
        try:
            with open(output_file, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            print(f"Warning: Could not load existing context file: {e}. Creating new one.")
    
    # Create new structure
    return {
        "session": {
            "streamer": streamer,
            "start_time": datetime.now().isoformat(),
            "frames": []
        }
    }


def save_game_context(context: Dict, output_file: str):
    """Save game context to JSON file."""
    try:
        with open(output_file, 'w') as f:
            json.dump(context, f, indent=2)
        print(f"Game context saved to {output_file}")
    except IOError as e:
        print(f"Error saving game context: {e}")


def signal_handler(sig, frame):
    """Handle Ctrl+C gracefully."""
    global running
    print("\n\nShutting down gracefully...")
    running = False




def main():
    global running
    
    # Parse command line arguments
    parser = argparse.ArgumentParser(
        description="Monitor Twitch stream and analyze CS2/CS:GO gameplay frames using Ollama"
    )
    parser.add_argument(
        "streamer",
        help="Twitch streamer username (e.g., 'zeus')"
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=INTERVAL_SECONDS,
        help=f"Interval between frame captures in seconds (default: {INTERVAL_SECONDS})"
    )
    parser.add_argument(
        "--model",
        default=MODEL_NAME,
        help=f"Ollama model to use (default: {MODEL_NAME})"
    )
    
    args = parser.parse_args()
    
    streamer = args.streamer
    interval_seconds = args.interval
    model_name = args.model
    output_file = os.path.join(streamer, 'game_context.json')
    
    # Set up signal handler for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    
    print(f"Starting continuous monitoring for streamer: {streamer}")
    print(f"Interval: {interval_seconds} seconds")
    print(f"Output file: {output_file}")
    print(f"Using Ollama model: {model_name}")
    print("Press Ctrl+C to stop\n")
    
    # Verify Ollama is available and model exists
    try:
        models = ollama.list()
        model_names = [model['name'] for model in models.get('models', [])]
        if model_name not in model_names:
            print(f"Warning: Model '{model_name}' not found in Ollama.")
            print(f"Available models: {', '.join(model_names)}")
            print(f"Please install it with: ollama pull {model_name}")
            response = input("Continue anyway? (y/n): ")
            if response.lower() != 'y':
                sys.exit(1)
    except Exception as e:
        print(f"Warning: Could not verify Ollama connection: {e}")
        print("Make sure Ollama is running. Continue anyway? (y/n): ", end='')
        response = input()
        if response.lower() != 'y':
            sys.exit(1)
    
    # Load or create game context
    game_context = load_game_context(output_file, streamer)
    
    # Step 1 & 2: Get the stream URL
    stream_url = get_twitch_stream_url(streamer)
    if not stream_url:
        print("Failed to get stream URL. Exiting.")
        sys.exit(1)
    
    frame_count = 0
    
    while running:
        frame_count += 1
        timestamp = datetime.now()
        print(f"\n{'='*60}")
        print(f"Frame #{frame_count} - {timestamp.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*60}")
        
        # Step 3: Capture current frame (saves as JPG for debug)
        frame, frame_filename = capture_current_frame(stream_url, streamer)
        if frame is None:
            print("Failed to capture frame. Waiting for next interval...")
            time.sleep(interval_seconds)
            continue
        
        # Step 4: Feed to Ollama and wait for result (sequential execution)
        print(f"Processing with Ollama ({model_name})...")
        start_time = time.time()
        result = analyze_frame_with_ollama(frame, frame_filename, SYSTEM_PROMPT)
        end_time = time.time()
        processing_time = end_time - start_time
        
        if result:
            # Store frame data in context
            frame_data = {
                "frame_number": frame_count,
                "timestamp": timestamp.isoformat(),
                "frame_filename": frame_filename,
                "analysis": result,
                "processing_time_seconds": round(processing_time, 4)
            }
            
            game_context["session"]["frames"].append(frame_data)
            
            # Update last update time
            game_context["session"]["last_update"] = timestamp.isoformat()
            game_context["session"]["total_frames"] = frame_count
            
            # Save to file after each successful analysis
            save_game_context(game_context, output_file)
            
            # Print summary
            print(f"\n✓ Analysis completed in {processing_time:.4f} seconds")
            print(f"✓ Context saved ({len(game_context['session']['frames'])} frames total)")
            
            # Print current analysis (optional - can be removed for less verbose output)
            if "state" in result:
                state = result.get("state", {})
                score = state.get("score", {})
                print(f"  Current Score: {score.get('team1', '?')} - {score.get('team2', '?')}")
        else:
            print(f"✗ Failed to analyze frame with Ollama ({model_name}).")
        
        # Wait for next interval (only if still running)
        if running:
            print(f"\nWaiting {interval_seconds} seconds until next capture...")
            time.sleep(interval_seconds)
    
    # Final save on shutdown
    print(f"\nFinal save: {len(game_context['session']['frames'])} frames captured")
    save_game_context(game_context, output_file)
    print("Shutdown complete.")


if __name__ == "__main__":
    main()
