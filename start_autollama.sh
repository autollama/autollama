#!/bin/bash
# AutoLlama Start Script

echo "🚀 Starting AutoLlama services..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    if [ -f example.env ]; then
        echo -e "${BLUE}📝 Creating .env from example.env...${NC}"
        cp example.env .env
        echo -e "${YELLOW}⚠️ Please edit .env and add your OpenAI API key before continuing${NC}"
        echo "Edit the line: OPENAI_API_KEY=your_openai_api_key_here"
        exit 1
    else
        echo "Please create .env file with your configuration"
        exit 1
    fi
fi

# Check if API key is configured
if grep -q "your_openai_api_key_here" .env; then
    echo -e "${YELLOW}⚠️ OpenAI API key not configured in .env file${NC}"
    echo ""
    echo -e "${BLUE}To fix this:${NC}"
    echo "1. Edit .env file: nano .env"
    echo "2. Replace 'your_openai_api_key_here' with your actual OpenAI API key"
    echo "3. Save and restart this script"
    echo ""
    echo -e "${RED}Note: Document processing won't work without a valid API key${NC}"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Start services
echo -e "${BLUE}🐳 Starting Docker containers...${NC}"
docker compose up -d

# Wait for services to start
echo -e "${YELLOW}⏳ Waiting for services to start...${NC}"
sleep 8

# Check if schema fix is needed
echo -e "${BLUE}🔍 Checking database schema...${NC}"
if docker exec autollama-postgres psql -U autollama -d autollama -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'processed_content' AND column_name = 'updated_at'" 2>/dev/null | grep -q "updated_at"; then
    echo -e "${GREEN}✅ Database schema is up to date${NC}"
else
    echo -e "${YELLOW}⚠️ Database schema needs updating${NC}"
    echo -e "${BLUE}💡 Run './fix-schema.sh' to fix schema issues${NC}"
fi

# Check service health
echo -e "${BLUE}🏥 Checking service health...${NC}"
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/health 2>/dev/null)
WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080 2>/dev/null)

if [ "$API_STATUS" = "200" ]; then
    echo -e "${GREEN}✅ API service is running${NC}"
else
    echo -e "${YELLOW}⏳ API service starting up...${NC}"
fi

if [ "$WEB_STATUS" = "200" ]; then
    echo -e "${GREEN}✅ Web interface is running${NC}"
else
    echo -e "${YELLOW}⏳ Web interface starting up...${NC}"
fi

echo ""
echo -e "${GREEN}🎉 AutoLlama is starting up!${NC}"
echo ""
echo -e "${BLUE}📱 Access Points:${NC}"
echo "- Web Interface: http://localhost:8080"
echo "- API Health: http://localhost:3001/health"
echo "- Qdrant: http://localhost:6333"
echo ""
echo -e "${BLUE}🛠️ Management:${NC}"
echo "- View logs: docker compose logs -f"
echo "- Stop services: docker compose down"
echo "- Fix schema: ./fix-schema.sh"
echo ""
if grep -q "your_openai_api_key_here" .env; then
    echo -e "${YELLOW}⚠️ Remember to set your OpenAI API key in .env for document processing!${NC}"
fi
