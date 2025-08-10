<div align="center">
  <img src="assets/images/autollama-logo.png" alt="AutoLlama Logo" width="200"/>
  <h1>AutoLlama - Intelligent RAG Platform</h1>
  
  [![Version](https://img.shields.io/badge/version-2.3.0-blue.svg)](https://github.com/snedea/autollama)
  [![Docker](https://img.shields.io/badge/docker-supported-blue.svg)](https://docker.com)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
</div>

**AutoLlama** is an advanced Retrieval-Augmented Generation (RAG) platform that enables intelligent document processing and contextual search. Process URLs, PDFs, and various document formats with state-of-the-art AI analysis, semantic search, and real-time processing capabilities.

## Features

- **🚀 Intelligent Document Processing**: Advanced content extraction from URLs, PDFs, and multiple file formats
- **🧠 Contextual Embeddings**: Enhanced retrieval accuracy using document-aware chunk processing
- **📊 Rich Metadata Analysis**: Sentiment analysis, entity recognition, and comprehensive content categorization
- **🔍 Semantic Search**: Vector-based search with BM25 hybrid retrieval for optimal results
- **⚡ Real-time Processing**: Live progress updates with Server-Sent Events
- **🔌 OpenWebUI Integration**: Built-in RAG pipeline for conversational AI interfaces
- **⚙️ Comprehensive Settings**: Web-based configuration for AI providers, processing parameters, and system settings
- **🗄️ Dual Storage**: PostgreSQL for structured data, Qdrant for vector embeddings

## Prerequisites

Before installing AutoLlama, ensure you have the following:

### System Requirements

- **Operating System**: Linux (Ubuntu/Debian/CentOS/RHEL), macOS, or Windows with WSL
- **Memory**: Minimum 4GB RAM (8GB+ recommended)
- **Storage**: At least 10GB free space
- **Network**: Internet connection for downloading dependencies and AI API access

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

### Required Accounts & API Keys

Before starting, obtain the following:

- **OpenAI API key** from https://platform.openai.com/api-keys
- **Qdrant Cloud account** from https://cloud.qdrant.io (or set up local Qdrant)
- **PostgreSQL database** (can use cloud providers or local setup)

## Quick Start

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/snedea/autollama.git
cd autollama
```

2. **Configure environment**
```bash
cp example.env .env
# Edit .env with your API keys and database credentials
```

3. **Start the services**
```bash
docker compose up -d
```

4. **Access the application**
- Web Interface: http://localhost:8080
- API Documentation: http://localhost:8080/docs
- Health Check: http://localhost:8080/health

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

## Usage

### Processing Documents

**Via Web Interface:**
1. Navigate to http://localhost:8080
2. Use URL processor or file uploader
3. Monitor real-time processing progress
4. Browse processed content in the dashboard

**Via API:**
```bash
# Process a URL
curl -X POST http://localhost:8080/api/process-url-stream \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/document.pdf"}' -N

# Upload and process a file
curl -X POST http://localhost:8080/api/process-file-stream \
  -F "file=@document.pdf" -N
```

### Searching Content

**Semantic Search:**
```bash
curl "http://localhost:8080/api/search?q=artificial+intelligence&limit=10"
```

**Hybrid Search (Vector + BM25):**
```bash
curl "http://localhost:8080/api/search/grouped?q=machine+learning&limit=5"
```

### RAG Integration

AutoLlama includes a built-in OpenWebUI pipeline for conversational AI:

1. **Configure OpenWebUI**: Add pipeline URL `http://localhost:9099`
2. **Use API Key**: `0p3n-w3bu!`
3. **Chat with Documents**: Ask questions about processed content

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

## Contextual Embeddings

AutoLlama uses advanced contextual embedding techniques for improved retrieval:

- **Document-Aware Processing**: Each chunk understands its role within the larger document
- **Enhanced Accuracy**: Up to 35% improvement in retrieval performance
- **Semantic Context**: Better understanding of document structure and relationships
- **Cost Optimization**: Efficient processing with prompt caching

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

**AutoLlama v2.3** - Intelligent document processing with contextual understanding and semantic search capabilities.