#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Start Lavalink in the background
echo "Starting Lavalink Server..."
cd lavalink
java -jar Lavalink.jar &
LAVALINK_PID=$!
cd ..

# Function to stop Lavalink on exit
cleanup() {
  echo "Stopping Lavalink Server..."
  kill $LAVALINK_PID || true
}
trap cleanup EXIT

# Wait for Lavalink to start up
echo "Waiting for Lavalink to be ready on port 2333..."
for i in {1..30}; do
  if curl -s http://localhost:2333 > /dev/null; then
    echo "Lavalink is ready!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "Error: Lavalink failed to start within 30 seconds."
    exit 1
  fi
  sleep 1
done

# Start the Discord Bot in the foreground
echo "Starting Discord Bot..."
npm start
