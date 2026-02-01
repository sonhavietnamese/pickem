#!/usr/bin/env python3
"""
FastAPI service for deciding prediction markets.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .main import (
    DEFAULT_MODEL,
    decide_market_with_ollama,
    get_frame_by_id,
    get_latest_frame,
    load_game_context,
)

app = FastAPI(title="Prediction Market Decider API", version="1.0.0")


class DecisionResponse(BaseModel):
    """Response model for market decision."""
    winning_option: str
    reason: str
    full_reason: str
    baseline_comparison: str
    is_resolved: bool


class MarketDecisionResponse(BaseModel):
    """Full response model including market metadata."""
    market_id: int
    market_question: str
    market_options: list[str]
    baseline_frame_id: int
    current_frame_id: int
    decision: DecisionResponse


class MarketRequest(BaseModel):
    """Request model for market data."""
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
    return {"message": "Prediction Market Decider API", "version": "1.0.0"}


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.post(
    "/decision/{username}",
    response_model=MarketDecisionResponse,
    responses={404: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def decide_market(
    username: str,
    market: MarketRequest,
    model: str = DEFAULT_MODEL,
    save: bool = True,
):
    """
    Decide the winning option for a prediction market.
    
    Args:
        username: Streamer/username name (e.g., 'zeus')
        market: Market data in request body
        model: Ollama model to use (default: gemini-3-flash-preview)
        save: Whether to save the decision to a file (default: True)
    
    Returns:
        MarketDecisionResponse: The market decision with winning option
    """
    try:
        # Convert market request to dict
        market_data = market.model_dump()
        market_id = market_data.get("id")
        frame_id = market_data.get("frame_id")
        
        if market_id is None:
            raise HTTPException(
                status_code=400, detail="Market ID not found"
            )
        
        if frame_id is None:
            raise HTTPException(
                status_code=400, detail="Market frame_id not found"
            )
        
        # Load game context
        context = load_game_context(username)
        
        # Get baseline frame (when market was created)
        baseline_frame = get_frame_by_id(context, frame_id)
        
        # Get latest frame (current state)
        current_frame = get_latest_frame(context)
        current_frame_id = current_frame.get("frame_number")
        
        if current_frame_id is None:
            raise HTTPException(
                status_code=400, detail="Current frame_id not found"
            )
        
        # Decide market
        decision = decide_market_with_ollama(
            market_data, baseline_frame, current_frame, model
        )
        
        # Combine output
        output = {
            "market_id": market_id,
            "market_question": market_data.get("question"),
            "market_options": market_data.get("options"),
            "baseline_frame_id": frame_id,
            "current_frame_id": current_frame_id,
            "decision": decision
        }
        
        # Save to file if requested
        if save:
            output_dir = Path(__file__).parent / username
            output_dir.mkdir(parents=True, exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_path = output_dir / f"decision_{timestamp}.json"
            
            with open(output_path, 'w') as f:
                json.dump(output, f, indent=2)
        
        return MarketDecisionResponse(**output)
        
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=1338)
