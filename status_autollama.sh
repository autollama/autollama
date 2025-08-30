#!/bin/bash
# AutoLlama Status Script

echo "AutoLlama Service Status:"
echo "========================="
docker compose ps

echo ""
echo "Service Health Checks:"
echo "====================="
echo -n "Web Interface (8080): "
curl -s http://localhost:8080/health &>/dev/null && echo "✓ Healthy" || echo "✗ Not responding"

echo -n "API Server (3001): "
curl -s http://localhost:3001/health &>/dev/null && echo "✓ Healthy" || echo "✗ Not responding"

echo ""
echo "Container Logs (last 10 lines):"
echo "==============================="
docker compose logs --tail=10
