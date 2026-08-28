#!/usr/bin/env bash
#
# refresh-potoken.sh
#
# Regenerates a YouTube poToken + visitorData pair and pushes it to a running
# Lavalink node via the youtube-source plugin's REST API (no restart needed).
#
# Requires: node/npx (for the generator), curl, jq
#
# Usage:
#   ./refresh-potoken.sh
#
# Recommended cron entry (every 4 hours):
#   0 */4 * * * /path/to/refresh-potoken.sh >> /var/log/potoken-refresh.log 2>&1

set -euo pipefail

# ---- Config: set these as environment variables (e.g. Railway service variables) ----
LAVALINK_URL="${LAVALINK_URL:-http://localhost:2333}"
LAVALINK_PASSWORD="${LAVALINK_PASSWORD:-youshallnotpass}"
# ------------------------------------------------------------------------

log() {
  echo "[$(date -Iseconds)] $*"
}

log "Generating new poToken + visitorData..."

# Generate poToken and visitorData using npx youtube-po-token-generator
RAW_OUTPUT=$(NODE_OPTIONS="--max-old-space-size=4096" npx --yes youtube-po-token-generator 2>/dev/null | tail -n 1 || true)

if [ -z "$RAW_OUTPUT" ] || ! echo "$RAW_OUTPUT" | grep -q "poToken"; then
  # Fallback to local bgutil generator if available
  if [ -f "$(dirname "$0")/scratch/bgutil/server/build/generate_once.js" ]; then
    log "Using local bgutil generator..."
    RAW_OUTPUT=$(node "$(dirname "$0")/scratch/bgutil/server/build/generate_once.js" 2>/dev/null | tail -n 1)
  fi
fi

if [ -z "$RAW_OUTPUT" ]; then
  log "ERROR: generator produced no output. Aborting."
  exit 1
fi

PO_TOKEN=$(echo "$RAW_OUTPUT" | jq -r '.poToken // empty' 2>/dev/null || true)
VISITOR_DATA=$(echo "$RAW_OUTPUT" | jq -r '.visitorData // .contentBinding // empty' 2>/dev/null || true)

if [ -z "$PO_TOKEN" ] || [ -z "$VISITOR_DATA" ]; then
  log "ERROR: could not parse poToken/visitorData from generator output:"
  log "$RAW_OUTPUT"
  exit 1
fi

log "Got poToken (${#PO_TOKEN} chars) and visitorData (${#VISITOR_DATA} chars). Pushing to Lavalink at ${LAVALINK_URL}..."

HTTP_STATUS=$(curl -s -o /tmp/potoken-response.json -w "%{http_code}" \
  -X POST "${LAVALINK_URL}/youtube" \
  -H "Authorization: ${LAVALINK_PASSWORD}" \
  -H "Content-Type: application/json" \
  -d "{\"poToken\": \"${PO_TOKEN}\", \"visitorData\": \"${VISITOR_DATA}\"}")

if [ "$HTTP_STATUS" = "204" ] || [ "$HTTP_STATUS" = "200" ]; then
  log "Success: Lavalink accepted the new poToken/visitorData (HTTP ${HTTP_STATUS})."
else
  log "ERROR: Lavalink responded with HTTP ${HTTP_STATUS}. Response body:"
  cat /tmp/potoken-response.json >&2 || true
  exit 1
fi
