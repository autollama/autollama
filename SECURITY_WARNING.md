# 🚨 SECURITY WARNING

## Detected Files with Hardcoded Secrets

The following files contain hardcoded API keys and cannot be cleaned due to permission restrictions:

### Root-Owned Files (Require Manual Cleanup):
- `pipelines/autollama_rag_pipeline/valves.json` - Contains QDRANT_API_KEY and OPENAI_API_KEY

### Manual Cleanup Required:
```bash
# As root user or with sudo:
sudo rm -f pipelines/autollama_rag_pipeline/valves.json
cp valves.example.json pipelines/autollama_rag_pipeline/valves.json
```

### Safe Template Created:
- `valves.example.json` - Clean template with environment variables

## ✅ Files Already Cleaned:
- All API server files
- Docker compose configuration 
- Archive backup files
- N8N workflow files
- Documentation files

**IMPORTANT**: These files must be cleaned before pushing to GitHub to avoid security violations.