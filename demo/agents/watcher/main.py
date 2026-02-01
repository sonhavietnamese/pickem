import json
import os
import re
import signal
import sys
import time
from datetime import datetime
from typing import Dict, Optional

import cv2
import streamlink
from google import genai
from google.genai import types

streamer = 'qrushcsgo'
INTERVAL_SECONDS = 10
OUTPUT_FILE = 'qrushcsgo/game_context.json'

# Get API key from environment variable
api_key = os.getenv('GEMINI_API_KEY')
client = genai.Client(api_key=api_key)

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


def capture_current_frame(stream_url: str) -> Optional[tuple]:
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
        debug_filename = f"debug_frame_{timestamp}.jpg"
        cv2.imwrite(debug_filename, frame)
        print(f"Debug: Frame saved to {debug_filename}")
        
        return frame, debug_filename
        
    except Exception as e:
        print(f"Error capturing frame: {e}")
        return None, None


def analyze_frame_with_gemini(frame, system_prompt: str) -> Optional[Dict]:
    try:
        # Encode frame as JPEG bytes
        _, buffer = cv2.imencode('.jpg', frame)
        image_bytes = buffer.tobytes()
        
        # Prepare the content with image
        image_part = types.Part.from_bytes(
            data=image_bytes,
            mime_type='image/jpeg'
        )
        
        # Send image to Gemini with system prompt
        print("Sending image to Gemini for analysis...")
        response = client.models.generate_content(
            model='gemini-2.0-flash-lite',
            contents=[image_part],
            config=types.GenerateContentConfig(
                system_instruction=system_prompt
            )
        )
        
        # Parse the response as JSON
        try:
            result = json.loads(response.text)
            return result
        except json.JSONDecodeError:
            # If response is not valid JSON, try to extract JSON from markdown code blocks
            json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response.text, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(1))
            # Try to find JSON object directly
            json_match = re.search(r'(\{.*\})', response.text, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(1))
            # If still not found, return the raw text wrapped in a dict
            print(f"Warning: Could not parse JSON. Raw response: {response.text[:200]}...")
            return {"raw_response": response.text, "error": "Failed to parse as JSON"}
                
    except Exception as e:
        print(f"Error analyzing frame with Gemini: {e}")
        import traceback
        traceback.print_exc()
        return None


def load_game_context() -> Dict:
    """Load existing game context from JSON file or create new structure."""
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, 'r') as f:
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


def save_game_context(context: Dict):
    """Save game context to JSON file."""
    try:
        with open(OUTPUT_FILE, 'w') as f:
            json.dump(context, f, indent=2)
        print(f"Game context saved to {OUTPUT_FILE}")
    except IOError as e:
        print(f"Error saving game context: {e}")


def signal_handler(sig, frame):
    """Handle Ctrl+C gracefully."""
    global running
    print("\n\nShutting down gracefully...")
    running = False




def main():
    global running
    
    # Set up signal handler for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    
    print(f"Starting continuous monitoring for streamer: {streamer}")
    print(f"Interval: {INTERVAL_SECONDS} seconds")
    print(f"Output file: {OUTPUT_FILE}")
    print("Press Ctrl+C to stop\n")
    
    # Load or create game context
    game_context = load_game_context()
    
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
        frame, frame_filename = capture_current_frame(stream_url)
        if frame is None:
            print("Failed to capture frame. Waiting for next interval...")
            time.sleep(INTERVAL_SECONDS)
            continue
        
        # Step 4: Feed to Gemini and wait for result (sequential execution)
        print("Processing with Gemini...")
        start_time = time.time()
        result = analyze_frame_with_gemini(frame, SYSTEM_PROMPT)
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
            save_game_context(game_context)
            
            # Print summary
            print(f"\n✓ Analysis completed in {processing_time:.4f} seconds")
            print(f"✓ Context saved ({len(game_context['session']['frames'])} frames total)")
            
            # Print current analysis (optional - can be removed for less verbose output)
            if "state" in result:
                state = result.get("state", {})
                score = state.get("score", {})
                print(f"  Current Score: {score.get('team1', '?')} - {score.get('team2', '?')}")
        else:
            print("✗ Failed to analyze frame with Gemini.")
        
        # Wait for next interval (only if still running)
        if running:
            print(f"\nWaiting {INTERVAL_SECONDS} seconds until next capture...")
            time.sleep(INTERVAL_SECONDS)
    
    # Final save on shutdown
    print(f"\nFinal save: {len(game_context['session']['frames'])} frames captured")
    save_game_context(game_context)
    print("Shutdown complete.")


if __name__ == "__main__":
    main()
