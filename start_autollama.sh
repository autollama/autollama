#!/bin/bash
# AutoLlama Start Script

echo "Starting AutoLlama services..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Error: .env file not found. Please create it from example.env"
    exit 1
fi

# Check if API key is configured
if grep -q "your_openai_api_key_here" .env; then
    echo "Warning: OpenAI API key not configured in .env file"
    echo "Please edit .env and add your API key"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Start services
docker compose up -d

# Wait for services to start
echo "Waiting for services to start..."
sleep 5

# Check service health
echo "Checking service health..."
curl -s http://localhost:8080/health || echo "Web interface not ready yet"
curl -s http://localhost:3001/health || echo "API not ready yet"

echo ""
echo "AutoLlama is starting up!"
echo "- Web Interface: http://localhost:8080"
echo "- API Docs: http://localhost:8080/docs"
echo "- Logs: docker compose logs -f"
