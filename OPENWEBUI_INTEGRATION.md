# OpenWebUI Integration Guide

## Overview
AutoLlama now includes a built-in OpenWebUI pipeline that provides seamless RAG (Retrieval-Augmented Generation) integration. The pipeline runs automatically with the standard AutoLlama services - no additional setup required.

## Quick Setup

### 1. Start AutoLlama
```bash
cd autollama
docker compose up -d
```
The OpenWebUI pipeline is automatically available at port 9099.

### 2. Configure OpenWebUI
1. Go to **Admin Panel → Settings → Connections** in OpenWebUI
2. Click **"Add OpenAI API Connection"**
3. Use these **CORRECT** settings:
   - **Base URL**: `http://100.64.199.110:3001/api/openwebui` 
   - **API Key**: `0p3n-w3bu!`
4. Save and start chatting with your knowledge base!

**Important**: Use the direct Tailscale IP and port 3001 (API), NOT port 9099 (proxy)

## Professional Domain Setup (Recommended)

### Configure Tailscale MagicDNS for autollama.io

1. **Enable MagicDNS in Tailscale Admin Console**
   - Go to [Tailscale Admin Console](https://login.tailscale.com/admin/dns)
   - Navigate to DNS settings
   - Enable MagicDNS

2. **Add Custom Domain Records**
   - Add DNS record: `autollama.io` → `autollama-on-hstgr` (your Tailscale hostname)
   - Add DNS record: `api.autollama.io` → `autollama-on-hstgr`

3. **Verify Domain Resolution**
   ```bash
   # From any machine on your Tailscale network:
   ping autollama.io
   curl https://autollama.io:9099/pipelines
   ```

### Benefits of Professional Domain Setup
- ✅ Clean, professional URLs (`https://autollama.io:9099`)
- ✅ Easy to share and document
- ✅ Works across all Tailscale devices
- ✅ No cryptic IP addresses or hostnames

## Alternative URLs

If MagicDNS is not configured, these alternatives will work:

1. **Direct Tailscale hostname**: `http://autollama-on-hstgr:9099`
2. **Tailscale IP**: `http://100.x.y.z:9099` (check current IP)
3. **Local development**: `http://localhost:9099`

## Pipeline Features

### Built-in RAG Capabilities
- Automatic access to all processed documents in AutoLlama
- Semantic search using existing Qdrant vector database  
- Contextual responses with source citations
- Real-time access to new documents as they're processed

### Configuration Options
- **Collection Name**: `autollama-content`
- **Max Results**: 5 (configurable)
- **Similarity Threshold**: 0.3 (configurable)
- **Debug Mode**: Available for troubleshooting

## API Endpoints

The OpenWebUI pipeline exposes these endpoints:

- `GET /pipelines` - Pipeline discovery (OpenWebUI compatibility)
- `POST /pipeline/autollama-rag/execute` - RAG query execution
- `GET /pipeline/autollama-rag/config` - Pipeline configuration
- `GET /health` - Pipeline health status

## Troubleshooting

### Pipeline Not Detected in OpenWebUI
1. Try alternative URLs from the list above
2. Verify AutoLlama is running: `docker compose ps`
3. Check pipeline health: `curl http://autollama-on-hstgr:9099/health`

### No Responses from Pipeline
1. Ensure documents are processed in AutoLlama
2. Check debug logs: `docker compose logs -f autollama-api`
3. Verify Qdrant connection in AutoLlama settings

### Domain Issues
1. If `autollama.io` doesn't resolve, MagicDNS needs configuration
2. Use direct Tailscale hostname as fallback
3. Check Tailscale DNS settings in admin console

### API Key Issues
1. Ensure API key is exactly: `0p3n-w3bu!`
2. No spaces or extra characters
3. Copy from AutoLlama settings panel for accuracy

## Architecture

### Service Integration
- Pipeline runs within existing `autollama-api` service
- Uses existing Qdrant vector database
- Leverages existing OpenAI client for embeddings
- No additional containers or services required

### Security
- API key authentication required
- CORS configured for cross-origin requests
- Professional domain support via Tailscale MagicDNS
- Standard Tailscale security model applies

## Updating from Previous Versions

If you previously used a separate `autollama-pipelines` service:

1. **Remove old references**:
   ```bash
   docker compose down autollama-pipelines  # If it exists
   docker volume rm autollama_autollama-pipelines-data  # If it exists
   ```

2. **Update your setup**:
   - No need to run `docker compose up -d autollama-pipelines`
   - Pipeline is now built-in to the main AutoLlama service
   - Use the new URLs and configuration

3. **Update OpenWebUI settings** with the new URLs from this guide

## Troubleshooting

### "Pipelines Not Detected" Error

**Problem**: OpenWebUI shows "Pipelines Not Detected" in Admin Panel → Pipelines

**Solution**:
1. **Use correct URL**: `http://100.64.199.110:3001/api/openwebui` (NOT port 9099)
2. **Check current Tailscale IP**: 
   ```bash
   docker exec autollama-autollama-on-hstgr-1 tailscale status | head -1
   ```
3. **Test pipeline endpoint**:
   ```bash
   curl -s "http://100.64.199.110:3001/api/openwebui/pipelines"
   ```

### RAG Model Returns Errors

**Problem**: Chat completions return "Sorry, I encountered an error..."

**Solution**: 
1. **Rebuild API container**:
   ```bash
   cd autollama
   docker compose build autollama-api --no-cache
   docker compose up -d autollama-api
   ```

2. **Verify API health**:
   ```bash
   docker compose ps autollama-api
   docker compose logs autollama-api --tail=10
   ```

### Wrong IP Address

**Problem**: Hardcoded IP addresses become outdated when containers restart

**Solution**: Update docker-compose.yaml with current Tailscale IP in `extra_hosts` sections

### Connection Settings Wrong in AutoLlama UI

**Problem**: AutoLlama Settings → OpenWebUI tab shows wrong URLs

**Solution**: URLs have been updated in the frontend. Rebuild and restart:
```bash
docker compose build autollama --no-cache
docker compose up -d autollama
```

## Support

For issues with the OpenWebUI integration:

1. Check AutoLlama settings → OpenWebUI tab for real-time diagnostics
2. Test pipeline connection using the built-in test button  
3. Review logs: `docker compose logs -f autollama-api`
4. Verify all AutoLlama services are healthy

The integration is designed to work seamlessly with your existing AutoLlama setup while providing professional-grade URLs and reliable connectivity.