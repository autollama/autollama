# AutoLLama.io Implementation Plan

## Project Overview
Create AutoLLama.io - a minimalist web frontend that triggers n8n workflows for intelligent web content analysis. The service follows the homelab's established Docker + Tailscale architecture patterns.

## Current Status
- **Started**: 2025-07-12
- **Frontend Complete**: ✅ Fully implemented and running
- **Backend Ready**: ✅ N8N workflow documentation provided
- **Service Status**: 🟢 Running on port 8080
- **Next Steps**: Set up n8n workflows using N8N_WORKFLOWS.md

## Architecture Overview

### Service Structure
Following homelab patterns with:
- Docker-compose with Tailscale sidecar
- Public accessibility (like n8n) for autollama.io domain
- VPN-secured internal communication
- Nginx serving static frontend

### Content Processing Flow
1. User enters URL in AutoLLama interface → 
2. Frontend sends URL to n8n webhook → 
3. N8N triggers 3 scraping methods simultaneously:
   - HTTP Request (static sites)
   - Firecrawl (AI-powered extraction)  
   - Browserless (JavaScript-heavy sites)
4. AI analyzes content for interest/relevance →
5. If interesting → Generate LinkedIn post → Send to Discord
6. User maintains full control over actual LinkedIn posting

## Implementation Tasks

### ✅ Infrastructure Setup
- [x] Create autollama directory structure
- [x] Set up docker-compose.yaml with nginx and Tailscale sidecar
- [x] Create example.env and basic environment configuration
- [x] Configure nginx with proper headers and caching

### ✅ Frontend Development
- [x] Build minimalist HTML frontend with URL input and magnifying glass
- [x] Create CSS styling inspired by SearXNG's clean design
- [x] Implement JavaScript for URL submission and n8n webhook integration

### 🔄 N8N Workflow Integration
- [ ] Create n8n workflow for HTTP request scraping method
- [ ] Create n8n workflow for Firecrawl scraping method  
- [ ] Create n8n workflow for Browserless scraping method
- [ ] Set up AI content analysis and LinkedIn post generation in n8n
- [ ] Configure Discord integration for post review

### 🔄 Testing & Validation
- [ ] Test the complete workflow end-to-end

## Technical Details

### Frontend Requirements
- **Simple interface**: Single URL input box with "Insert URL..." placeholder
- **Visual elements**: Magnifying glass icon with hover color change
- **Styling**: Clean, minimalist design inspired by SearXNG
- **Functionality**: Submit URL to n8n webhook, optionally show processing status

### N8N Workflow Configuration
- **Webhook endpoint**: To receive URLs from frontend
- **Parallel processing**: Run all 3 scraping methods simultaneously
- **AI analysis**: Determine content interest level using OpenAI/Claude
- **Content generation**: Create LinkedIn post if content is interesting
- **Discord integration**: Send generated posts for manual review

### Docker Configuration
```yaml
# Pattern to follow (similar to other services)
services:
  autollama:
    image: nginx:alpine
    network_mode: service:autollama-on-hstgr
    volumes:
      - ./config:/usr/share/nginx/html
    restart: unless-stopped

  autollama-on-hstgr:
    image: tailscale/tailscale:latest
    hostname: autollama-on-hstgr
    environment:
      - TS_EXTRA_ARGS=--auth-key file:/run/secrets/tsauthkey
      - TS_STATE_DIR=/var/lib/tailscale
      - TS_USERSPACE=false
    volumes:
      - ./tailscale-state:/var/lib/tailscale
    devices:
      - /dev/net/tun:/dev/net/tun
    cap_add:
      - net_admin
    restart: unless-stopped
    secrets:
      - tsauthkey
    ports:
      - "80:80"  # Public access like n8n

secrets:
  tsauthkey:
    file: ~/.config/tsauthkey
```

## File Structure
```
autollama/
├── PLAN.md                    # This file
├── docker-compose.yaml       # Service definition
├── example.env              # Environment template
├── .env                     # Actual config (gitignored)
├── config/                  # Web frontend files
│   ├── index.html          # Main interface
│   ├── style.css           # SearXNG-inspired styling
│   └── script.js           # URL submission logic
└── tailscale-state/        # VPN state persistence
```

## N8N Workflow Design

### Webhook Trigger
- **URL**: `https://n8n.llam.ai/webhook/autollama`
- **Method**: POST
- **Payload**: `{ "url": "https://example.com" }`

### Scraping Methods (Parallel)
1. **HTTP Request Node**: Direct GET request for static sites
2. **Firecrawl Integration**: Use Firecrawl API for AI-powered extraction
3. **Browserless Integration**: Use Browserless API for JavaScript sites

### AI Analysis
- **Input**: Scraped content from all 3 methods
- **Prompt**: "Analyze this content and determine if it's interesting for LinkedIn sharing. Consider: industry relevance, insights, actionable information, trends."
- **Output**: Interest score + reasoning

### Content Generation
- **Trigger**: Only if AI determines content is interesting
- **Prompt**: "Create a professional LinkedIn post based on this content. Include key insights, a hook, and relevant hashtags. Keep it engaging but professional."
- **Output**: Ready-to-post LinkedIn content

### Discord Integration
- **Channel**: Content review channel
- **Message**: Include original URL, AI analysis, and generated LinkedIn post
- **Action**: User manually reviews and decides whether to post

## Next Steps for Implementation
1. Complete Docker setup with nginx and Tailscale
2. Create the frontend interface
3. Set up n8n workflows
4. Test end-to-end functionality
5. Configure autollama.io domain pointing

## Notes for Future Sessions
- Remember to follow homelab security patterns (VPN-first)
- Keep frontend extremely simple - just URL input
- N8N does all the heavy lifting
- User maintains full control over posting decisions
- Test with various website types (static, dynamic, JS-heavy)