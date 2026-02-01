"""Configuration module for agents."""

import os
from pathlib import Path

# API URLs
MARKET_API_URL = os.getenv("MARKET_API_URL", "http://localhost:3000")
CREATOR_API_URL = os.getenv("CREATOR_API_URL", "http://localhost:8000")
DECIDER_API_URL = os.getenv("DECIDER_API_URL", "http://localhost:8001")

# Scheduler intervals
CREATOR_INTERVAL_SECONDS = int(os.getenv("CREATOR_INTERVAL_SECONDS", "120"))  # 2 minutes
DECIDER_DELAY_SECONDS = int(os.getenv("DECIDER_DELAY_SECONDS", "180"))  # 3 minutes

# Script paths
AGENTS_DIR = Path(__file__).parent
WATCHER_SCRIPT = AGENTS_DIR / "watcher" / "main.py"
UI_SCRIPT = AGENTS_DIR / "ui" / "main.py"
CREATOR_SCRIPT = AGENTS_DIR / "creator" / "main.py"
DECIDER_SCRIPT = AGENTS_DIR / "decider" / "main.py"
