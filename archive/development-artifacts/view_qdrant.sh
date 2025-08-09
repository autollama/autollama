#!/bin/bash

# Qdrant viewer script
API_KEY="${QDRANT_API_KEY}"
BASE_URL="https://c4c8ee46-d9dd-4c0f-a00e-9215675351da.us-west-1-0.aws.cloud.qdrant.io"
COLLECTION="autollama-content"

echo "=== Qdrant Database Viewer ==="
echo

# Get collection info
echo "Collection Info:"
curl -s -X GET "$BASE_URL/collections/$COLLECTION" \
  -H "api-key: $API_KEY" | python3 -m json.tool

echo
echo "=== Points in Database ==="

# Get all points
curl -s -X POST "$BASE_URL/collections/$COLLECTION/points/scroll" \
  -H "api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 100, "with_payload": true, "with_vector": false}' | python3 -m json.tool

# Count points
POINTS=$(curl -s -X POST "$BASE_URL/collections/$COLLECTION/points/count" \
  -H "api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}')

echo
echo "Total points in database: $(echo $POINTS | python3 -c "import sys, json; print(json.load(sys.stdin)['result']['count'])")"