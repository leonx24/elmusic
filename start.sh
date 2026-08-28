#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Load .env file if present
if [ -f .env ]; then
  set -a
  source .env 2>/dev/null || true
  set +a
fi

echo "Starting DisTube Music Bot..."
npm start
