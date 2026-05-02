#!/bin/bash
set -e

# Install dependencies if needed
pip install -r requirements.txt -q

# Start server
uvicorn app.main:app --host 0.0.0.0 --port 8000
