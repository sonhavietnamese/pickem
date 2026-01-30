import streamlink
import cv2
import sys
import json
import tempfile
import os
from typing import Optional, Dict
from datetime import datetime
import ollama


streamer = 'otplol_'

SYSTEM_PROMPT = "You are an expert esports analyst and prediction market creator.  You will be given an in-game screenshot from a League of Legends match.   **TASK:** Using only the information visible in the image, create a **single binary prediction market question (Yes/No)** that is: - **Quantifiable** (can be clearly verified after the fact) - **Time-bound** (references the in-game clock) - **Based directly on game state** (kills, objectives, gold, team composition, etc.)  **FORMAT:** Output your prediction market in exactly this structure:  **PREDICTION MARKET:** [Question] **YES:** [Outcome if Yes] **NO:** [Outcome if No] **TIMEFRAME:** [Next X:XX in-game minutes] **RATIONALE:** [Brief explanation based on visible game data]  ---  **EXAMPLE:** PREDICTION MARKET: Will Blue Team take Baron Nashor in the next 8 minutes? YES: Baron is secured by Blue team before 42:00. NO: Baron is not secured by Blue team by 42:00. TIMEFRAME: Next 8:00 (from 34:05 → 42:05) RATIONALE: Blue team leads 44–31 in kills, has a fed Malphite and INKBrunner (15/4/12), and dragon is spawning in 2 seconds, which could lead to Baron setup.  ---  **Now analyze the provided image and create your prediction market.**"


def get_twitch_stream_url(username: str) -> Optional[str]:
    """
    Step 1 & 2: Capture the twitch livestream from username and use streamlink to get the video URL.
    
    Args:
        username: Twitch username to get stream from
        
    Returns:
        The video stream URL, or None if stream is not available
    """
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
    """
    Step 3: Capture the current frame from the video stream.
    
    Args:
        stream_url: URL of the video stream
        
    Returns:
        Tuple of (frame image as numpy array, success boolean), or None if failed
    """
    try:
        # Open the video stream
        cap = cv2.VideoCapture(stream_url)
        
        if not cap.isOpened():
            print("Error: Could not open video stream")
            return None
        
        # Read the current frame
        ret, frame = cap.read()
        
        if not ret:
            print("Error: Could not read frame from stream")
            cap.release()
            return None
        
        # Release the capture
        cap.release()
        
        print(f"Frame captured successfully. Shape: {frame.shape}")
        
        # Debug: Save the frame as an image file
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        debug_filename = f"debug_frame_{timestamp}.jpg"
        cv2.imwrite(debug_filename, frame)
        print(f"Debug: Frame saved to {debug_filename}")
        
        return frame
        
    except Exception as e:
        print(f"Error capturing frame: {e}")
        return None


def analyze_frame_with_ollama(frame, system_prompt: str) -> Optional[Dict]:
    """
    Step 4: Send the image to Ollama for analysis.
    
    Args:
        frame: OpenCV frame (numpy array) to analyze
        system_prompt: System prompt to use for the analysis
        
    Returns:
        Dictionary with 'question' and 'options' keys, or None if failed
    """
    try:
        # Save frame to temporary file for Ollama
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp_file:
            temp_filename = tmp_file.name
            cv2.imwrite(temp_filename, frame)
        
        try:
            # Send image to Ollama with system prompt
            print("Sending image to Ollama for analysis...")
            response = ollama.chat(
                model='gemma3',  # Using llava vision model
                messages=[
                    {
                        'role': 'system',
                        'content': system_prompt
                    },
                    {
                        'role': 'user',
                        'content': 'Analyze this League of Legends in-game screenshot and create a prediction market.',
                        'images': [temp_filename]
                    }
                ]
            )
            
            # Extract the response content
            content = response['message']['content']
            print(f"Ollama response received: {content[:200]}...")
            
            # Parse the response to extract JSON format
            # Try to extract JSON from the response
            json_data = parse_ollama_response(content)
            
            return json_data
            
        finally:
            # Clean up temporary file
            if os.path.exists(temp_filename):
                os.unlink(temp_filename)
                
    except Exception as e:
        print(f"Error analyzing frame with Ollama: {e}")
        import traceback
        traceback.print_exc()
        return None


def parse_ollama_response(content: str) -> Dict:
    """
    Parse Ollama response to extract JSON format with question and options.
    
    Args:
        content: Raw response content from Ollama
        
    Returns:
        Dictionary with 'question' and 'options' keys
    """
    try:
        # Try to find JSON in the response
        # Look for JSON-like structures
        import re
        
        # Try to extract JSON object
        json_match = re.search(r'\{[^{}]*"question"[^{}]*\}', content, re.DOTALL)
        if json_match:
            json_str = json_match.group(0)
            return json.loads(json_str)
        
        # If no JSON found, try to extract question and options from text
        # Look for question pattern
        question_match = re.search(r'(?:question|Question|QUESTION)[:\s]+(.+?)(?:\n|$)', content, re.IGNORECASE)
        question = question_match.group(1).strip() if question_match else ""
        
        # Look for options (could be YES/NO or numbered options)
        options = []
        options_match = re.findall(r'(?:option|Option|OPTION|YES|NO)[:\s]+(.+?)(?:\n|$)', content, re.IGNORECASE)
        if options_match:
            options = [opt.strip() for opt in options_match]
        
        # If we found a question but no options, try to extract YES/NO from the response
        if question and not options:
            yes_match = re.search(r'YES[:\s]+(.+?)(?:\n|NO|$)', content, re.IGNORECASE)
            no_match = re.search(r'NO[:\s]+(.+?)(?:\n|$)', content, re.IGNORECASE)
            if yes_match:
                options.append(f"YES: {yes_match.group(1).strip()}")
            if no_match:
                options.append(f"NO: {no_match.group(1).strip()}")
        
        # If still no question found, use the first sentence or a portion of content
        if not question:
            # Try to extract the prediction market question
            pm_match = re.search(r'PREDICTION MARKET[:\s]+(.+?)(?:\n|YES|NO|$)', content, re.IGNORECASE)
            if pm_match:
                question = pm_match.group(1).strip()
            else:
                # Fallback: use first meaningful sentence
                sentences = re.split(r'[.!?]\s+', content)
                question = sentences[0].strip() if sentences else content[:100]
        
        return {
            "question": question,
            "options": options if options else ["YES", "NO"]  # Default binary options
        }
        
    except Exception as e:
        print(f"Error parsing Ollama response: {e}")
        # Return a fallback structure
        return {
            "question": content[:200] if content else "Unable to parse question",
            "options": ["YES", "NO"]
        }


def main():
    print(f"Processing stream for: {streamer}")
    
    # Step 1 & 2: Get the stream URL
    stream_url = get_twitch_stream_url(streamer)
    if not stream_url:
        print("Failed to get stream URL. Exiting.")
        sys.exit(1)

    # stream_url = 'https://aps11.playlist.ttvnw.net/v1/playlist/Cu0Ew9zxTHbC0Qk8SkK2h7eSE5IqCKNhvFC4If9WgtQE1wb1XWhGKUTTq7b1vbUC7WhK6aMxfwRjHepeOw1IqWE1YImDwzevNtFcVmRx2Rjnr1ZxohlVlTsDFSvvBEP_fFR2hWo-mGmz8LIGHlmC3xdoWh-aj0jJWxPGzUQjthwwM3AQ_1jc98GcG0-TzDKyv4i3YlaYqfhj1tDik60j6_UqUhVkVne3BDUiVYXlXuGOGo4JjUejM4k8XBmaGUwsnO2rS9Kgck66QzlnYODm0FWCsgAoBzhpn5MqeUmAWJmi3SrjyFvihTbDEdelJV_A-58VYFDaecU8-Zmw73k6_VgVZ6cyfdGNJpQqduMta7bZpEPq4sclNFw4ovN4FF7EIsJOOvTP_8BBe2pXSEgmjzOkPMlEqZyEEFHpoZzRxT0aAwJwBQlPFV47Q_W_vov5xrj53uUmXnG-5jAWcgl7YuzorO6t0ILm47wu7GwXsh69FQsBPgFEw1aI1sRMX_LiorsXPs_QqosSEHeI_ibQX2eMaGAT6klyKUdB9PmZEBkHxqD4h0cUv67AH445Voc1wpMLdwsLTbD4p1Xb6MoBT6mfQuilq-Q6eOXRs6Hfc8V2crdFoJnj5A6SJ48CcKkY1UaNPBTFjS3DOSu3PKf7ewSyaQ3VYIT7dqUyfZ7ozSF7SQfmxV7686Ms8u3Jgk2Tkx6lPVAOYjgzDNC13Qk5F5GaJa74ibyV8kEigM1xxewu-3JcRY6EVqDhDpl-xq85CsJ6o9Gra5nFk803OIZ7fnjiyi5jlDRujNo1B2NvpLMOd49Tpeat5MyzJqkdErEnGgzRJfgvDHwrybFbgRQgASoJdXMtd2VzdC0yMKcO.m3u8'
    
    # Step 3: Capture current frame
    frame = capture_current_frame(stream_url)
    if frame is None:
        print("Failed to capture frame. Exiting.")
        sys.exit(1)
    
    print("Successfully completed steps 1, 2, and 3!")
    
    # Step 4: Send the image to Ollama for analysis
    result = analyze_frame_with_ollama(frame, SYSTEM_PROMPT)
    if result:
        print("\n" + "="*50)
        print("ANALYSIS RESULT:")
        print("="*50)
        print(json.dumps(result, indent=2))
        print("="*50)
    else:
        print("Failed to analyze frame with Ollama.")


if __name__ == "__main__":
    main()
