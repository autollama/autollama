# AutoLlama RAG Pipeline

OpenWebUI integration pipeline for AutoLlama RAG functionality.

## Overview

This directory contains the OpenWebUI pipeline that enables conversational AI access to AutoLlama's document processing and retrieval capabilities.

## Contents

- `autollama_rag_pipeline/` - Main pipeline implementation
  - RAG query processing logic
  - Qdrant vector search integration
  - OpenAI API interaction

## Configuration

Copy `valves.example.json` to `valves.json` and configure:

```json
{
  "QDRANT_URL": "your_qdrant_url",
  "QDRANT_API_KEY": "your_qdrant_key", 
  "OPENAI_API_KEY": "your_openai_key",
  "COLLECTION_NAME": "autollama-content",
  "MAX_RESULTS": 5,
  "SIMILARITY_THRESHOLD": 0.3,
  "ENABLE_METADATA_FILTERING": true,
  "DEBUG_MODE": false
}
```

## Usage

This pipeline is automatically detected by OpenWebUI when properly configured. See the main README for setup instructions.