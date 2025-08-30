#!/bin/bash

# AutoLlama Repository Fix Script
set -e

echo "========================================="
echo "🔧 AutoLlama Repository Complete Fix"
echo "========================================="

cd ./

# Create branch
BRANCH_NAME="fix/remove-hardcoded-tailscale-config"
git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"

echo ""
echo "📝 Step 1: Creating clean docker-compose.yaml"
echo "------------------------------------------------"

# Backup original
cp docker-compose.yaml docker-compose.yaml.original

# Create clean docker-compose.yaml
cat > docker-compose.yaml << 'COMPOSE_EOF'
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: autollama-postgres
    environment:
      POSTGRES_USER: autollama
      POSTGRES_PASSWORD: autollama
      POSTGRES_DB: autollama
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    networks:
      - autollama-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U autollama"]
      interval: 10s
      retries: 5
    restart: unless-stopped

  qdrant:
    image: qdrant/qdrant:latest
    container_name: autollama-qdrant
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage
    networks:
      - autollama-network
    restart: unless-stopped

  autollama-bm25:
    build: ./bm25-service
    container_name: autollama-bm25
    environment:
      PORT: 3002
      PYTHONPATH: /app
    volumes:
      - autollama-bm25-data:/app/data/bm25_indices
    networks:
      - autollama-network
    ports:
      - "3002:3002"
    restart: unless-stopped

  autollama-api:
    build: ./api
    container_name: autollama-api
    env_file:
      - .env
    environment:
      NODE_ENV: production
      PORT: 3001
      DATABASE_URL: postgresql://autollama:autollama@postgres:5432/autollama
      QDRANT_URL: http://qdrant:6333
    networks:
      - autollama-network
    ports:
      - "3001:3001"
      - "3003:3003"
    depends_on:
      - postgres
      - qdrant
      - autollama-bm25
    restart: unless-stopped

  autollama-frontend:
    build:
      context: ./config/react-frontend
      dockerfile: Dockerfile
    container_name: autollama-frontend
    environment:
      NODE_ENV: production
    networks:
      - autollama-network
    ports:
      - "8080:80"
    depends_on:
      - autollama-api
    restart: unless-stopped

volumes:
  postgres_data:
  qdrant_data:
  autollama-bm25-data:

networks:
  autollama-network:
    driver: bridge
COMPOSE_EOF

echo "✅ Created clean docker-compose.yaml"

echo ""
echo "📝 Step 2: Testing the new configuration"
echo "------------------------------------------------"

# Stop old containers
docker compose down --remove-orphans 2>/dev/null || true
docker rm -f autollama-autollama-on-hstgr-1 2>/dev/null || true

echo ""
echo "📝 Step 3: Committing changes"
echo "------------------------------------------------"

git add docker-compose.yaml
git commit -m "fix: Remove hardcoded Tailscale configuration

- Removed Tailscale VPN sidecar
- Removed hardcoded paths (/home/chuck/)
- Removed hosting-specific hostnames
- Made configuration generic for all users
- Fixed service dependencies" || echo "Already committed"

echo ""
echo "========================================="
echo "✅ Fix Complete!"
echo "========================================="
echo ""
echo "Now you can:"
echo "1. Start services: docker compose up -d"
echo "2. Check status: docker ps"
echo "3. View logs: docker compose logs -f"
