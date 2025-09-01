# AutoLlama v3.0 Installation Guide

🦙 **Three ways to get started with the modern JavaScript-first RAG framework**

## Method 1: NPX Installation (Recommended)

**Perfect for**: Quick start, learning, prototyping, JavaScript developers

### Prerequisites
- Node.js 16+ and npm
- 5 minutes of your time

### Installation Steps

```bash
# 1. Create your project
npx create-autollama my-rag-app

# 2. Follow the interactive wizard
# 🦙 Choose template (Basic/Advanced/Custom)
# 🧠 Select AI provider (OpenAI/Anthropic)
# 🎨 Pick llama personality
# 📚 Add sample data (optional)

# 3. Start development
cd my-rag-app
npm run dev

# 🌐 Your app: http://localhost:8080
```

### What You Get
- **Template Selection**: Basic (SQLite), Advanced (PostgreSQL), or Custom wizard
- **Auto-Configuration**: Environment detection and smart defaults
- **Llama Personality**: Professional, Friendly, or Party mode
- **Instant Setup**: Database initialization and sample data
- **CLI Commands**: `autollama dev|migrate|test|deploy|status`

---

## Method 2: Docker Installation (Production)

**Perfect for**: Production deployment, team development, enterprise use

### Prerequisites
- Docker and Docker Compose
- 2GB RAM, 10GB disk space

### Installation Steps

```bash
# 1. Clone repository
git clone https://github.com/autollama/autollama.git
cd autollama

# 2. Configure environment
cp example.env .env
# Edit .env with your API keys and database credentials

# 3. Launch services
docker compose up -d

# 4. Verify deployment
curl http://localhost:8080/api/health
```

### What You Get
- **Full Production Stack**: PostgreSQL, Qdrant, React frontend
- **Microservices Architecture**: API, BM25, SSE streaming
- **Scalable Deployment**: Load balancing and container orchestration
- **Enterprise Features**: Session tracking, performance monitoring

---

## Method 3: Native Installation (Advanced)

**Perfect for**: Contributing, custom deployments, maximum control

### Prerequisites
- Node.js 16+, PostgreSQL, Git
- Development environment setup

### Installation Steps

```bash
# 1. Clone and setup
git clone https://github.com/autollama/autollama.git
cd autollama
npm install

# 2. Configure environment
cp example.env .env
# Edit with your configuration

# 3. Setup database
npm run migrate

# 4. Start development
npm run dev
```

### What You Get
- **Full Source Control**: Complete codebase access
- **Development Tools**: Hot reload, debugging, testing suite
- **Custom Configuration**: Fine-tune every aspect
- **Contribution Ready**: Set up for development and PRs

---

## Template Comparison

| Feature | Basic | Advanced | Custom |
|---------|-------|----------|--------|
| **Database** | SQLite | PostgreSQL | User Choice |
| **Setup Time** | 2 minutes | 5 minutes | 5-10 minutes |
| **Vector DB** | Embedded Qdrant | External Qdrant | Configurable |
| **Features** | Core RAG | Full Enterprise | Wizard-selected |
| **Best For** | Learning | Production | Specific needs |

---

## Post-Installation Commands

### CLI Commands Available
```bash
autollama dev         # Start development server
autollama migrate     # Run database migrations
autollama test        # Run test suite
autollama deploy      # Deploy to production
autollama status      # Show service status
autollama doctor      # Diagnose and fix issues
autollama config      # Manage configuration
autollama clean       # Clean up data and caches
```

### Development Workflow
```bash
# Start development
npm run dev                    # or: autollama dev

# Run tests
npm run test                   # Full test suite
npm run test:modernization     # v3.0 features only
npm run test:installation      # Installation validation

# Database operations
autollama migrate              # Apply migrations
autollama status               # Check database status

# Production deployment
autollama deploy --env=prod    # Deploy to production
```

---

## Troubleshooting

### Common Issues

**NPX Installation Fails**
```bash
# Clear npm cache
npm cache clean --force

# Try with specific Node version
nvm use 18
npx create-autollama my-app
```

**Database Connection Issues**
```bash
# Check database status
autollama doctor

# Reset database
autollama migrate --reset
```

**Service Won't Start**
```bash
# Check service status
autollama status

# View detailed logs
autollama logs api
```

### Getting Help

- **Documentation**: https://github.com/autollama/autollama/docs
- **Issues**: https://github.com/autollama/autollama/issues
- **Discussions**: https://github.com/autollama/autollama/discussions

---

## Migration from v2.x

### Upgrade Path
```bash
# 1. Backup your data
autollama backup

# 2. Update codebase
git pull origin main

# 3. Run migration
npm run migrate

# 4. Update configuration
autollama config migrate-v3
```

### Breaking Changes
- **CLI**: New command structure (old scripts still work)
- **Configuration**: Environment variables reorganized
- **Templates**: New template system (old configs auto-migrated)

The v3.0 upgrade preserves all your data and configurations while adding the new JavaScript-first capabilities!