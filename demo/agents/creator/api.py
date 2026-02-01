#!/usr/bin/env python3
"""
FastAPI service for generating prediction markets.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from main import (DEFAULT_MODEL, generate_market_with_ollama,
                   get_frame_by_number, get_latest_frame, load_game_context)

app = FastAPI(title="Prediction Market Creator API", version="1.0.0")


class MarketResponse(BaseModel):
    """Response model for market creation."""
    frame_id: int
    id: int
    question: str
    duration_minutes: int
    options: list[str]
    baseline_value: str
    prediction_type: str


class ErrorResponse(BaseModel):
    """Error response model."""
    error: str
    detail: Optional[str] = None


@app.get("/")
async def root():
    """Root endpoint."""
    return {"message": "Prediction Market Creator API", "version": "1.0.0"}


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get(
    "/market/{username}",
    response_model=MarketResponse,
    responses={404: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def create_market(
    username: str,
    frame: Optional[int] = None,
    model: str = DEFAULT_MODEL,
    save: bool = True,
):
    """
    Create a prediction market for a given username.
    
    Args:
        username: Streamer/username name (e.g., 'zeus')
        frame: Optional specific frame number to use (default: latest frame)
        model: Ollama model to use (default: gemini-3-flash-preview)
        save: Whether to save the market to a file (default: True)
    
    Returns:
        MarketResponse: The generated prediction market
    """
    try:
        # Load game context
        context = load_game_context(username)
        
        # Get frame
        if frame:
            frame_data = get_frame_by_number(context, frame)
        else:
            frame_data = get_latest_frame(context)
        
        frame_id = frame_data.get("frame_number", "unknown")
        
        # Get frame analysis data
        frame_analysis = frame_data.get("analysis")
        if not frame_analysis:
            raise HTTPException(
                status_code=404, detail="Frame analysis data not found"
            )
        
        # Generate market
        market = generate_market_with_ollama(frame_analysis, model)
        
        # Add frame_id to output
        output = {
            "frame_id": frame_id,
            **market
        }
        
        # Save to file if requested
        if save:
            output_dir = Path(__file__).parent / username
            output_dir.mkdir(parents=True, exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_path = output_dir / f"market_{timestamp}.json"
            
            with open(output_path, 'w') as f:
                json.dump(output, f, indent=2)
        
        return MarketResponse(**output)
        
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


if __name__ == "__main__":
   
    uvicorn.run(app, host="0.0.0.0", port=1337)
