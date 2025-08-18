<div align="center">
  <img src="assets/images/autollama-logo.png" alt="AutoLlama Logo" width="200"/>
  
  <h1>The Context-Aware RAG Framework</h1>
  <h2><em>Your Documents Have Context. Now Your RAG Does Too.</em></h2>
  
  [![Version](https://img.shields.io/badge/version-2.3.4-blue.svg)](https://github.com/autollama/autollama/releases/latest)
  [![Docker](https://img.shields.io/badge/docker-supported-blue.svg)](https://docker.com)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
</div>

**Context isn't a nice-to-have—it's the difference between information and understanding.**

For too long, RAG has been about finding chunks, not understanding documents. AutoLlama changes that. Built on Anthropic's breakthrough contextual retrieval methodology, it's the first JavaScript-first RAG framework that actually comprehends your documents the way humans do.

**It's like RAG finally learned how to read.**

## Why Context Changes Everything

**Traditional RAG**: "Here are 5 chunks that mention 'machine learning'"
**AutoLlama**: "Here's how machine learning evolves through this research paper, building from foundational concepts in Chapter 2 to advanced applications in Chapter 7"

See the difference? That's context at work.

## 🏠 Pure Local Mode - NEW in v2.3.4

**Complete Air-Gapped Deployment for Enterprise Environments**

AutoLlama now offers **Pure Local Mode** - a completely isolated, air-gapped deployment perfect for:

- 🏢 **Enterprise & Government**: Security-sensitive environments
- 🔒 **Air-Gapped Networks**: Zero external dependencies (except optional OpenAI API)
- 🛡️ **Compliance-Ready**: SOC 2, GDPR, HIPAA, ISO 27001 configurations
- ⚡ **Enterprise Hardware**: Optimized for 2x Xeon, 64GB RAM, 2x RTX 3060

### 5-Minute Local Setup

```bash
# Clone and deploy complete local stack
git clone https://github.com/autollama/autollama.git
cd autollama
cp .env.local.example .env.local
mkdir -p data/{postgres-local,qdrant-local,bm25-local,redis-local}
docker-compose -f docker-compose.local.yml up -d

# Access your air-gapped AutoLlama
open http://localhost:8080
```

**That's it!** Your completely isolated, enterprise-grade RAG system is running.

📚 **[Complete Local Deployment Guide →](docs/LOCAL_DEPLOYMENT.md)**
🏢 **[Enterprise Configuration →](docs/ENTERPRISE.md)**

### ⚙️ One-Click Mode Switching Interface

**Toggle between air-gapped and cloud deployments with visual mode switching:**

<div align="center">
  <img src="marketing-homepage/assets/air-gapped-local-cloud-option.png" alt="AutoLlama v2.3.4 Mode Toggle Interface" width="800"/>
  <p><em>Settings → Connections: Toggle between 🏠 Local Mode (air-gapped) and ☁️ Cloud Mode with real-time UI adaptation</em></p>
</div>

**Key Features:**
- **🔄 Real-Time Switching**: Instantly toggle between deployment modes
- **🛡️ Security Indicators**: Visual air-gapped vs cloud security level display  
- **📝 Dynamic Configuration**: UI adapts field visibility based on selected mode
- **🔒 Production Safety**: Mode locking prevents accidental changes in production
- **⚡ Live Validation**: Real-time connection testing and health monitoring

**Watch the Interface in Action:**

<div align="center">
  <video width="800" controls>
    <source src="marketing-homepage/assets/air-gapped-and-cloud-vector-db.mov" type="video/mp4">
    <img src="marketing-homepage/assets/air-gapped-local-cloud-option.png" alt="Mode switching demonstration" width="800"/>
  </video>
  <p><em>Live demonstration of switching between air-gapped local and cloud vector database configurations</em></p>
</div>

**How It Works:**
1. **Navigate** to Settings → Connections in your AutoLlama interface
2. **See the mode toggle** with 🏠 Local and ☁️ Cloud indicators
3. **Click to switch** between deployment modes with visual feedback
4. **Watch the UI adapt** - fields change from read-only (local) to editable (cloud)
5. **Security indicators update** to show your current data sovereignty level

## What Makes AutoLlama Revolutionary

### 🧠 **Anthropic's Contextual Retrieval**
Stop getting random, disconnected chunks. AutoLlama implements Anthropic's breakthrough methodology that delivers **60% better accuracy** by understanding where each piece of information fits in the larger narrative.

### 🚀 **One-Command Deploy**
No more wrestling with Python environments or complex configurations. Just `docker compose up -d` and you're running enterprise-grade RAG in under 60 seconds.

### ⚡ **JavaScript-First Architecture** 
Built for developers who want power without pain. Full-stack JavaScript means your team can contribute, customize, and extend without learning new languages.

### 🔓 **Open Source Freedom**
Your documents, your infrastructure, your control. No vendor lock-in, no usage limits, no monthly subscriptions. Just pure, customizable technology.

### 📊 **Real-Time Intelligence**
Watch your documents transform from static files into living, searchable knowledge with real-time processing updates and interactive visualizations.

### 🔌 **Native OpenWebUI Integration**
Chat with your documents instantly. Built-in RAG pipeline that OpenWebUI automatically discovers—no complex setup required.

## Prerequisites

AutoLlama v2.3.4 supports two deployment modes:

### 🏠 Local Mode (Air-Gapped) - Recommended for Enterprise

**System Requirements:**
- **CPU**: 4+ cores (8+ recommended for enterprise)
- **Memory**: 16GB RAM minimum (64GB recommended for enterprise)
- **Storage**: 100GB+ SSD (500GB+ for enterprise)
- **Network**: Isolated/air-gapped network (optional OpenAI API access)

**Perfect for:**
- Enterprise environments
- Government/defense deployments  
- Compliance-sensitive organizations
- Privacy-focused installations

### ☁️ Cloud Mode - For Development & Small Teams

**System Requirements:**
- **Memory**: 4GB RAM minimum (8GB+ recommended)
- **Storage**: 10GB+ free space
- **Network**: Internet connection for AI APIs and cloud services

**Perfect for:**
- Development environments
- Small teams and startups
- Quick prototyping
- External service integrations

### Required Software

#### 1. Docker & Docker Compose Installation

**For Ubuntu/Debian:**
```bash
# Update package index
sudo apt update

# Install basic dependencies
sudo apt install curl gnupg apt-transport-https ca-certificates lsb-release

# Add Docker's official GPG key
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Add Docker repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Update package index
sudo apt update

# Install Docker
sudo apt install docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add your user to docker group
sudo usermod -aG docker $USER

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker
```

**For CentOS/RHEL/Fedora:**
```bash
# Install Docker
sudo dnf install docker docker-compose

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker

# Add user to docker group
sudo usermod -aG docker $USER
```

**For macOS:**
Download Docker Desktop from https://www.docker.com/products/docker-desktop/

**After installation:**
```bash
# Log out and back in, then verify installation
docker --version
docker compose version

# Test Docker permissions
docker ps
```

**Troubleshooting Docker Permissions:**
If you encounter "permission denied" errors:
```bash
# Refresh group membership without logging out
newgrp docker

# Or use sudo temporarily
sudo docker compose up -d
```

#### 2. Tailscale Installation (Optional but Recommended)

AutoLlama includes Tailscale integration for secure networking. Install Tailscale before running the containers:

**Get your install script:**
1. Visit https://login.tailscale.com/admin/machines/new-linux
2. Copy your personalized install command
3. Run it (example format):

```bash
curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up --auth-key=tskey-auth-YOUR-KEY-HERE
```

**After Tailscale installation:**
```bash
# Create required config directory
mkdir -p ~/.config

# Create tsauthkey file (required for Docker mount)
touch ~/.config/tsauthkey
chmod 600 ~/.config/tsauthkey

# Verify Tailscale is running
sudo tailscale status
```

## Quick Start

Choose your deployment mode:

### 🏠 Pure Local Mode (Recommended for Enterprise)

**Complete air-gapped deployment - zero external dependencies:**

```bash
# 1. Clone repository
git clone https://github.com/autollama/autollama.git
cd autollama

# 2. Set up local environment  
cp .env.local.example .env.local
# Edit .env.local and add your OpenAI API key (optional)

# 3. Create data directories
mkdir -p data/{postgres-local,qdrant-local,bm25-local,redis-local}

# 4. Deploy complete local stack
docker-compose -f docker-compose.local.yml up -d

# 5. Access your air-gapped AutoLlama
open http://localhost:8080
```

**Perfect for:** Enterprise, government, compliance-sensitive environments

📚 **[Complete Local Deployment Guide →](docs/LOCAL_DEPLOYMENT.md)**

### ☁️ Cloud Mode (Development & Small Teams)

**Traditional cloud-first deployment:**

**Required API Keys:**
- **OpenAI API key** from https://platform.openai.com/api-keys  
- **Qdrant Cloud account** from https://cloud.qdrant.io
- **PostgreSQL database** (cloud providers or local setup)

```bash
# 1. Clone repository
git clone https://github.com/autollama/autollama.git
cd autollama

# 2. Configure environment
cp example.env .env
# Edit .env with your API keys and service URLs

# 3. Deploy cloud services
docker compose up -d

# 4. Access your cloud-connected AutoLlama
open http://localhost:8080
```

**Perfect for:** Development environments, small teams, and external service integrations

🔗 **[API Keys Setup Guide →](/docs/cloud-setup.md)**

### Verification & Testing

Both deployment modes provide the same powerful interface:

- **Web Interface**: http://localhost:8080
- **API Documentation**: http://localhost:8080/docs  
- **Health Check**: http://localhost:8080/health

**That's it.** No virtual environments, no dependency hell, no hours of configuration. Just intelligent, context-aware RAG running in production-ready containers.

## Configuration

### Environment Variables

Key configuration options in `.env`:

```bash
# AI Services
OPENAI_API_KEY=your_openai_api_key_here

# Database Configuration
DATABASE_URL=postgresql://user:password@host:5432/autollama
QDRANT_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=your_qdrant_api_key

# Contextual Embeddings (Enhanced Processing)
ENABLE_CONTEXTUAL_EMBEDDINGS=true
CONTEXTUAL_EMBEDDING_MODEL=gpt-4o-mini

# Service Configuration
SERVICE_NAME=autollama
DOMAIN=autollama.io
```

### Web-Based Settings

Configure advanced options through the settings interface:

- **Connections Tab**: AI provider API keys and database connections
- **Processing Tab**: Chunking parameters, AI models, and performance settings  
- **OpenWebUI Tab**: RAG pipeline configuration and API keys
- **System Tab**: UI preferences, themes, and debug options

## Architecture

```
┌─────────────────┐    ┌──────────────┐    ┌───────────────┐
│   Web Interface │    │  API Server  │    │   Databases   │
│   (React/Nginx) │◄──►│ (Node.js)    │◄──►│ PostgreSQL +  │
│   Port 8080     │    │  Port 3001   │    │ Qdrant Vector │
└─────────────────┘    └──────────────┘    └───────────────┘
         │                       │                    │
         │              ┌────────▼────────┐           │
         │              │  Processing     │           │
         │              │  Pipeline       │           │
         │              │                 │           │
         └──────────────┤ • Content Fetch │───────────┘
                        │ • AI Analysis   │
                        │ • Chunking      │
                        │ • Embedding     │
                        │ • Storage       │
                        └─────────────────┘
```

### Core Services

- **Frontend**: React application with Tailwind CSS
- **API Server**: Node.js/Express with comprehensive middleware
- **Database**: PostgreSQL for structured metadata storage
- **Vector Database**: Qdrant for semantic search and embeddings
- **BM25 Service**: Fast lexical search for hybrid retrieval
- **Background Queue**: Async processing with progress tracking

## Experience the Difference

### Transform Any Document Into Intelligent Knowledge

**Web Interface** (Recommended for first-time users):
1. Visit http://localhost:8080 and drop in a PDF or paste a URL
2. Watch the real-time Flow View as AutoLlama processes your document
3. See contextual analysis, sentiment mapping, and entity extraction in action
4. Search your content with natural language and get meaningful, connected results

**API Integration** (For developers):
```bash
# Process any URL with contextual awareness
curl -X POST http://localhost:8080/api/process-url-stream \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/research-paper.pdf"}' -N

# Upload and intelligently process files
curl -X POST http://localhost:8080/api/process-file-stream \
  -F "file=@technical-documentation.pdf" -N
```

### Search That Actually Understands

**Contextual Search:**
```bash
curl "http://localhost:8080/api/search?q=how+does+the+methodology+evolve+throughout+the+paper"
```
*Returns: Connected insights showing how research methods build and evolve across chapters*

**Hybrid Intelligence (Vector + BM25):**
```bash
curl "http://localhost:8080/api/search/grouped?q=machine+learning+performance+metrics"
```
*Returns: Grouped results showing performance discussions in context of experimental design*

### Chat With Your Documents

**OpenWebUI Integration** - Because your documents deserve a conversation:

1. **One-Click Setup**: AutoLlama's pipeline auto-discovers in OpenWebUI
2. **Intelligent Responses**: Ask "What are the key findings?" and get document-aware answers
3. **Contextual Memory**: Follow-up questions understand document structure and narrative flow

```bash
# Your OpenWebUI configuration:
Pipeline URL: http://autollama-on-hstgr:3001/api/openwebui
API Key: 0p3n-w3bu!
```

**Try asking**: "How do the conclusions in Chapter 5 relate to the hypotheses presented in Chapter 1?"

## Screenshots - See AutoLlama in Action

Real screenshots from the AutoLlama platform—experience the interface that makes contextual RAG effortless.

### 📊 Main Dashboard
![Main Dashboard](https://autollama.io/assets/screenshots/dashboard-main.webp)

Comprehensive document management with interactive processed documents, real-time processing queue, and intuitive search interface.

### 🧠 Document Intelligence Dashboard  
![Document Intelligence Dashboard](https://autollama.io/assets/screenshots/document-analysis.webp)

Get comprehensive AI-powered insights into your documents with topic extraction, entity mapping, and RAG readiness scoring.

### 🧩 Chunks Grid View
![Chunks Grid View](https://autollama.io/assets/screenshots/chunks-grid.webp)

Visual representation of processed chunks with completion status and easy navigation to individual chunk details.

### ⚡ Real-Time Processing
![Real-Time Processing](https://autollama.io/assets/screenshots/processing-queue.webp)

Processing queue showing Llama actively processing items with real-time status updates.

### 🔍 AI Analysis Panel
![AI Analysis Panel](https://autollama.io/assets/screenshots/ai-analysis-panel.webp)

Deep AI insights with topic extraction, entity recognition, sentiment analysis, and processing quality metrics.

### 🚀 Ultra-Fast Contextual Search
![Ultra-Fast Contextual Search](https://autollama.io/assets/screenshots/search-results-enhanced.webp)

Lightning-fast BM25 search across contextually enhanced content, tags, entities, sentiment, and AI-generated metadata - find exactly what you need instantly.

### 🔗 OpenWebUI Integration

#### One-Click Setup
![OpenWebUI Settings](https://autollama.io/assets/screenshots/openwebui/autollama-openwebui-settings.png)

Configure your pipeline with just a URL and API key. AutoLlama handles the rest.

#### Native Integration
![OpenWebUI Model Selection](https://autollama.io/assets/screenshots/openwebui/autollama-openwebui-model-select.png)

AutoLlama appears as 'autollama-rag' in your model dropdown. Switch seamlessly between AI models.

#### Intelligent Responses
![OpenWebUI Query Response](https://autollama.io/assets/screenshots/openwebui/autollama-openwebui-query-response.png)

Get precise answers from your documents with contextual understanding and follow-up suggestions.

### 🎯 What You're Seeing

- **✓ Real-Time Processing**: Watch documents transform into intelligent chunks
- **✓ Visual Analytics**: Comprehensive insights and quality metrics  
- **✓ Contextual Intelligence**: Every chunk remembers its place in the story
- **✓ Enterprise Ready**: Production interface built for scale

## API Documentation

### Key Endpoints

- `GET /api/health` - System health check
- `POST /api/process-url-stream` - Process URL with real-time updates
- `POST /api/process-file-stream` - Process file upload with progress
- `GET /api/search` - Semantic search across processed content
- `GET /api/documents` - List processed documents
- `GET /api/settings` - Retrieve system configuration
- `POST /api/settings` - Update system settings

### Interactive Documentation

Visit `/docs` for complete API documentation with interactive examples.

## Development

### Local Development

```bash
# Frontend development (hot reload)
cd config/react-frontend
npm run dev

# API development (with nodemon)
cd api
npm run dev

# Build and restart specific services
docker compose build autollama-api --no-cache
docker compose up -d autollama-api
```

### Testing

```bash
# Run API tests
cd api
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:performance
```

### Performance Monitoring

**Health Endpoints:**
- `/health` - Basic service health
- `/api/health/comprehensive` - Detailed system status
- `/api/knowledge-base/stats` - Database statistics

## The Science Behind Context

**This isn't just another RAG implementation.** AutoLlama is built on cutting-edge research from Anthropic that solves the fundamental problem plaguing traditional RAG systems.

### The Problem with Traditional RAG
Most RAG systems treat documents like a bag of disconnected chunks. They find text that matches your query but lose the narrative thread that makes information meaningful.

### AutoLlama's Contextual Breakthrough
- **Document-Aware Processing**: Every chunk knows its place in the larger story
- **Semantic Boundary Detection**: Respects natural content flow instead of arbitrary splits  
- **Hierarchical Understanding**: Maintains document structure and relationships
- **60% Accuracy Improvement**: Proven performance gains over traditional chunking

### Real-World Impact
Instead of getting fragments like "machine learning accuracy improved," you get the full picture: "The research team's machine learning model achieved 94% accuracy in Chapter 4's clinical trials, building on the 87% baseline established in Chapter 2's preliminary testing."

**That's the power of context.**

## Why Developers Choose AutoLlama

### vs. LangChain/LlamaIndex
**Them**: Complex Python ecosystems with endless configuration
**AutoLlama**: JavaScript-first simplicity with enterprise power

### vs. Pinecone/Weaviate
**Them**: Vendor lock-in with usage-based pricing
**AutoLlama**: Your infrastructure, your control, zero ongoing costs

### vs. Traditional RAG
**Them**: "Here are chunks that match your keywords"
**AutoLlama**: "Here's how these concepts connect across your entire document"

### vs. Anthropic Claude (API only)
**Them**: Pay per request with limited document context
**AutoLlama**: Process unlimited documents with full contextual understanding

**The result?** Developers ship faster, costs stay predictable, and results actually make sense.

## Deployment

### Production Deployment

1. **Environment Setup**
```bash
cp docker-compose.yaml docker-compose.prod.yaml
# Edit production configuration
```

2. **SSL Configuration**
```bash
# Configure nginx for HTTPS
# Update domain settings in .env
```

3. **Database Setup**
```bash
# Run migrations
docker exec autollama-api npm run migrate
```

4. **Monitoring**
```bash
# Check service health
curl http://your-domain/health
curl http://your-domain/api/health/comprehensive
```

### Scaling Considerations

- **Database**: PostgreSQL read replicas for scaling search queries
- **Vector Storage**: Qdrant horizontal scaling for large document collections  
- **Processing**: Increase batch sizes and concurrent processing limits
- **Caching**: Redis integration for frequently accessed embeddings

## Troubleshooting

### Installation Issues

**Docker not found:**
```bash
# Verify Docker installation
which docker
docker --version

# If not installed, follow installation steps above
```

**Docker permission denied:**
```bash
# Refresh group membership
newgrp docker

# Or add user to docker group and re-login
sudo usermod -aG docker $USER
# Log out and back in
```

**Missing tsauthkey file:**
```bash
# Create required file
mkdir -p ~/.config
touch ~/.config/tsauthkey
chmod 600 ~/.config/tsauthkey

# Restart containers
docker compose down && docker compose up -d
```

**Package installation errors (Debian/Ubuntu):**
```bash
# Install missing dependencies
sudo apt install curl gnupg apt-transport-https ca-certificates

# Update package lists
sudo apt update
```

### Runtime Issues

**Services not starting:**
```bash
# Check logs
docker compose logs -f autollama-api
docker compose logs -f autollama

# Verify configuration
docker compose config
```

**Processing failures:**
```bash
# Check API connectivity
curl http://localhost:8080/api/health

# Monitor processing logs
docker compose logs -f autollama-api | grep "processing"
```

**Database connectivity:**
```bash
# Test database connection
docker exec autollama-api node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT NOW()').then(r => console.log('✓ Database connected:', r.rows[0]));
"
```

### Performance Issues

- **Slow processing**: Adjust `CONTEXT_GENERATION_BATCH_SIZE` in settings
- **High memory usage**: Monitor chunk size and concurrent processing limits
- **API timeouts**: Increase timeout values in nginx configuration

### Common Error Messages

**"bind source path does not exist"**: Missing tsauthkey file - create it as shown above
**"unable to get image"**: Docker permission issue - run `newgrp docker` or use sudo
**"Package not found"**: Update package lists with `sudo apt update`

## Contributing

We welcome contributions! Please see our [contributing guidelines](.github/CONTRIBUTING.md) for details.

### Development Setup

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Submit a pull request

### Code Standards

- Follow existing code style and conventions
- Add tests for new functionality  
- Update documentation for API changes
- Use conventional commits for clear history

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- **Documentation**: Visit `/docs` for comprehensive API documentation
- **Issues**: Report bugs and request features via GitHub Issues
- **Discussions**: Join the community discussion for questions and support

---

<div align="center">

**🦙 AutoLlama v2.3.4**

*Your Documents Have Context. Now Your RAG Does Too.*

**[Live Demo](https://autollama.io)** • **[Documentation](/docs)** • **[GitHub Issues](https://github.com/autollama/autollama/issues)** • **[Releases](https://github.com/snedea/autollama/releases)**

*Built by developers, for developers who believe context changes everything.*

</div>
