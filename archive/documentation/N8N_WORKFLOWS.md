# N8N Workflows for AutoLLama.io

This document provides step-by-step instructions for creating the n8n workflows that power AutoLLama.io's content analysis system.

## Overview

The system uses 3 parallel scraping methods that all feed into a single AI analysis workflow:
1. **HTTP Request** - For static sites
2. **Firecrawl** - For AI-powered content extraction
3. **Browserless** - For JavaScript-heavy sites

## Main Workflow: AutoLLama Content Analyzer

### 1. Webhook Trigger Node
- **Name**: "AutoLLama Webhook"
- **Type**: Webhook
- **Configuration**:
  - HTTP Method: POST
  - Path: `autollama`
  - Response Mode: "Respond Immediately"
  - Response Data: "First Entry JSON"

**Expected Input Format**:
```json
{
  "url": "https://example.com",
  "timestamp": "2025-07-12T10:30:00Z",
  "source": "autollama.io"
}
```

### 2. HTTP Request Scraping Branch

**Node**: HTTP Request
- **Name**: "HTTP Request Scraper"
- **Method**: GET
- **URL**: `{{ $json.url }}`
- **Headers**: 
  - `User-Agent`: `Mozilla/5.0 (compatible; AutoLLama/1.0)`
- **Options**:
  - Follow Redirects: Yes
  - Timeout: 30 seconds

### 3. Firecrawl Scraping Branch

**Node**: HTTP Request  
- **Name**: "Firecrawl Scraper"
- **Method**: POST
- **URL**: `https://api.firecrawl.dev/v1/extract`
- **Headers**:
  - `Authorization`: `Bearer YOUR_FIRECRAWL_API_KEY`
  - `Content-Type`: `application/json`
- **Body**:
```json
{
  "url": "{{ $json.url }}",
  "prompt": "Extract the main content, title, summary, and key insights from this webpage. Focus on actionable information and industry insights suitable for LinkedIn sharing.",
  "schema": {
    "type": "object",
    "properties": {
      "title": {"type": "string"},
      "summary": {"type": "string"},
      "main_content": {"type": "string"},
      "key_insights": {"type": "array", "items": {"type": "string"}},
      "industry_relevance": {"type": "string"}
    },
    "required": ["title", "summary", "main_content"]
  }
}
```

### 4. Browserless Scraping Branch

**Node**: HTTP Request
- **Name**: "Browserless Scraper"  
- **Method**: POST
- **URL**: `https://production-sfo.browserless.io/content`
- **Headers**:
  - `Authorization`: `Bearer YOUR_BROWSERLESS_API_KEY`
  - `Content-Type`: `application/json`
- **Body**:
```json
{
  "url": "{{ $json.url }}",
  "waitFor": 3000,
  "options": {
    "waitUntil": "networkidle0"
  }
}
```

### 5. Data Merge Node

**Node**: Merge
- **Name**: "Combine Scraping Results"
- **Mode**: "Combine All"
- **Settings**: Wait for all inputs before proceeding

### 6. AI Content Analysis

**Node**: OpenAI
- **Name**: "AI Content Analyzer"
- **Resource**: OpenAI (configure with your API key)
- **Model**: gpt-4o-mini
- **Messages**:

**System Message**:
```
You are an expert content analyst for LinkedIn. Your job is to analyze scraped web content and determine if it's suitable for creating engaging LinkedIn posts.

Analyze the content for:
1. Professional relevance and industry insights
2. Actionable information or lessons
3. Trending topics or timely information  
4. Educational or thought-provoking elements
5. Business value and networking potential

Respond with a JSON object containing:
- "is_interesting": boolean (true if suitable for LinkedIn)
- "interest_score": number (1-10 scale)
- "reasoning": string (explanation of decision)
- "key_themes": array of strings
- "target_audience": string
```

**User Message**:
```
Analyze this scraped content from {{ $('AutoLLama Webhook').item.json.url }}:

HTTP Content: {{ $('HTTP Request Scraper').item.json.data || 'Not available' }}

Firecrawl Content: {{ $('Firecrawl Scraper').item.json.data || 'Not available' }}

Browserless Content: {{ $('Browserless Scraper').item.json.data || 'Not available' }}

Please analyze this content and determine if it would make for engaging LinkedIn content.
```

### 7. Conditional Logic

**Node**: IF
- **Name**: "Check If Content Is Interesting"
- **Condition**: `{{ $json.is_interesting === true }}`

### 8. LinkedIn Post Generator (True Branch)

**Node**: OpenAI  
- **Name**: "LinkedIn Post Generator"
- **Resource**: OpenAI
- **Model**: gpt-4o-mini
- **Messages**:

**System Message**:
```
You are a LinkedIn content creator who writes engaging, professional posts. Create posts that:
- Start with a compelling hook
- Share valuable insights or lessons
- Include relevant hashtags (3-5)
- Are conversational yet professional
- Encourage engagement through questions or calls-to-action
- Are 150-300 words optimal length

Format as a ready-to-post LinkedIn update.
```

**User Message**:
```
Based on this content analysis, create an engaging LinkedIn post:

Source URL: {{ $('AutoLLama Webhook').item.json.url }}
Analysis: {{ $('AI Content Analyzer').item.json }}

Key themes: {{ $('AI Content Analyzer').item.json.key_themes }}
Target audience: {{ $('AI Content Analyzer').item.json.target_audience }}

Create a compelling LinkedIn post that would resonate with this audience.
```

### 9. Discord Notification

**Node**: Discord
- **Name**: "Send to Discord"
- **Webhook URL**: `YOUR_DISCORD_WEBHOOK_URL`
- **Message**:

For interesting content:
```
🦙 **AutoLLama Analysis Complete** 

**Original URL**: {{ $('AutoLLama Webhook').item.json.url }}

**Interest Score**: {{ $('AI Content Analyzer').item.json.interest_score }}/10

**Analysis**: {{ $('AI Content Analyzer').item.json.reasoning }}

**Generated LinkedIn Post**:
```
{{ $('LinkedIn Post Generator').item.json.content }}
```

**Key Themes**: {{ $('AI Content Analyzer').item.json.key_themes.join(', ') }}

Ready to review and post! 🚀
```

For non-interesting content:
```
🦙 **AutoLLama Analysis Complete**

**URL**: {{ $('AutoLLama Webhook').item.json.url }}
**Result**: Content not suitable for LinkedIn sharing
**Reason**: {{ $('AI Content Analyzer').item.json.reasoning }}
**Score**: {{ $('AI Content Analyzer').item.json.interest_score }}/10
```

## Setup Instructions

### 1. API Keys Required
- **OpenAI**: Get from https://platform.openai.com/api-keys
- **Firecrawl**: Get from https://firecrawl.dev (sign up for free tier)
- **Browserless**: Get from https://browserless.io (free tier available)
- **Discord**: Create webhook in your Discord server

### 2. N8N Configuration
1. Go to https://n8n.llam.ai
2. Create new workflow
3. Add nodes in the order specified above
4. Configure each node with the settings provided
5. Test each branch individually
6. Activate the workflow

### 3. Environment Variables
Add these to your n8n environment or use the credentials system:
```
OPENAI_API_KEY=your_key_here
FIRECRAWL_API_KEY=your_key_here  
BROWSERLESS_API_KEY=your_key_here
DISCORD_WEBHOOK_URL=your_webhook_here
```

## Testing

### Test Workflow
1. Use the AutoLLama.io frontend to submit a URL
2. Monitor the n8n execution log
3. Check Discord for the analysis results
4. Verify all three scraping methods are working

### Test URLs
- **Static site**: https://example.com
- **Dynamic site**: https://news.ycombinator.com
- **JavaScript heavy**: https://web.dev

## Troubleshooting

### Common Issues
1. **CORS errors**: Ensure n8n webhook accepts POST requests
2. **API rate limits**: Implement delays between requests if needed
3. **Timeout errors**: Increase timeout values for slow sites
4. **Authentication failures**: Verify all API keys are correct

### Monitoring
- Check n8n execution logs for errors
- Monitor Discord for successful/failed analyses
- Track API usage for all services

## Future Enhancements
- Add sentiment analysis
- Include image extraction and analysis
- Support for multiple social platforms
- Automated posting with approval workflow
- Analytics and performance tracking