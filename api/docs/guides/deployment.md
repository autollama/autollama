# Production Deployment Guide

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Infrastructure Setup](#infrastructure-setup)
4. [Environment Configuration](#environment-configuration)
5. [Docker Production Configuration](#docker-production-configuration)
6. [Security Hardening](#security-hardening)
7. [SSL/TLS Configuration](#ssltls-configuration)
8. [Database Setup & Migration](#database-setup--migration)
9. [Monitoring & Logging](#monitoring--logging)
10. [Backup & Recovery](#backup--recovery)
11. [Performance Optimization](#performance-optimization)
12. [Scaling Strategies](#scaling-strategies)
13. [Deployment Automation](#deployment-automation)
14. [Troubleshooting](#troubleshooting)

## Overview

This guide covers deploying AutoLlama v2.1 "Context Llama" in a production environment with high availability, security, and performance optimizations.

### Production Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Production Environment                        │
├─────────────────────────────────────────────────────────────────┤
│  Load Balancer (Cloudflare/AWS ALB)                            │
│  ├── SSL Termination                                           │
│  ├── DDoS Protection                                           │
│  └── Geographic Distribution                                   │
├─────────────────────────────────────────────────────────────────┤
│  Application Layer (Docker Swarm/Kubernetes)                   │
│  ├── AutoLlama Frontend (3 replicas)                          │
│  ├── AutoLlama API (3 replicas)                               │
│  ├── BM25 Search Service (2 replicas)                         │
│  └── Nginx Reverse Proxy (2 replicas)                        │
├─────────────────────────────────────────────────────────────────┤
│  Data Layer                                                     │
│  ├── PostgreSQL Cluster (Primary + 2 Replicas)               │
│  ├── Redis Cluster (3 nodes)                                  │
│  ├── Qdrant Cloud (Managed)                                   │
│  └── Persistent Storage (EBS/GCP Persistent Disk)             │
├─────────────────────────────────────────────────────────────────┤
│  Infrastructure                                                │
│  ├── Tailscale VPN (Secure inter-service communication)       │
│  ├── Prometheus + Grafana (Monitoring)                        │
│  ├── ELK Stack (Centralized logging)                          │
│  └── Backup Storage (S3/GCS)                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

### Server Requirements

#### Minimum Production Specs
```yaml
CPU: 4 cores (8 threads)
RAM: 16GB 
Storage: 100GB SSD
Network: 1Gbps
OS: Ubuntu 22.04 LTS or RHEL 8+
```

#### Recommended Production Specs
```yaml
CPU: 8 cores (16 threads)
RAM: 32GB
Storage: 500GB NVMe SSD
Network: 10Gbps
OS: Ubuntu 22.04 LTS
```

#### High-Availability Setup (3+ Nodes)
```yaml
Load Balancer: 2 nodes (2 cores, 4GB RAM each)
Application Nodes: 3 nodes (8 cores, 16GB RAM, 200GB SSD each)
Database Nodes: 3 nodes (4 cores, 16GB RAM, 500GB SSD each)
```

### Required Software

```bash
# Core requirements
Docker Engine 24.0+
Docker Compose 2.20+
Git 2.30+

# Optional but recommended
Docker Swarm or Kubernetes
Prometheus & Grafana
ELK Stack (Elasticsearch, Logstash, Kibana)
```

### External Services

```yaml
Required:
  - OpenAI API (GPT-4o-mini, text-embedding-3-small)
  - Qdrant Cloud (Vector database)
  - PostgreSQL 15+ (Can be self-hosted)

Optional:
  - Claude API (Anthropic)
  - Google Gemini API
  - Redis (Caching)
  - Cloudflare (CDN/DDoS protection)
  - AWS/GCP/Azure (Cloud hosting)
```

## Infrastructure Setup

### 1. Server Preparation

#### Ubuntu 22.04 LTS Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essential packages
sudo apt install -y \
    curl \
    wget \
    git \
    htop \
    nginx \
    ufw \
    fail2ban \
    unattended-upgrades \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release

# Install Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Configure Docker for production
sudo usermod -aG docker $USER
sudo systemctl enable docker
sudo systemctl start docker

# Configure Docker daemon for production
sudo tee /etc/docker/daemon.json > /dev/null <<EOF
{
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "10m",
        "max-file": "3"
    },
    "storage-driver": "overlay2",
    "live-restore": true,
    "userland-proxy": false,
    "experimental": false,
    "metrics-addr": "0.0.0.0:9323",
    "default-ulimits": {
        "nofile": {
            "Hard": 64000,
            "Name": "nofile",
            "Soft": 64000
        }
    }
}
EOF

sudo systemctl restart docker
```

#### RHEL 8+ Setup
```bash
# Update system
sudo dnf update -y

# Install Docker
sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Enable and start Docker
sudo systemctl enable --now docker
sudo usermod -aG docker $USER

# Install additional tools
sudo dnf install -y git htop nginx firewalld
```

### 2. Firewall Configuration

```bash
# UFW (Ubuntu) configuration
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing

# SSH (change port if needed)
sudo ufw allow 22/tcp

# HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# AutoLlama services
sudo ufw allow 8080/tcp  # Frontend
sudo ufw allow 3001/tcp  # API (internal only - remove in production)
sudo ufw allow 3002/tcp  # BM25 (internal only - remove in production)

# Docker Swarm (if using)
sudo ufw allow 2376/tcp
sudo ufw allow 2377/tcp
sudo ufw allow 7946/tcp
sudo ufw allow 7946/udp
sudo ufw allow 4789/udp

# Enable firewall
sudo ufw --force enable

# Firewalld (RHEL) configuration
sudo systemctl enable --now firewalld
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --reload
```

### 3. System Optimization

```bash
# System limits for high-load applications
sudo tee -a /etc/security/limits.conf > /dev/null <<EOF
*               soft    nofile          65536
*               hard    nofile          65536
*               soft    nproc           32768
*               hard    nproc           32768
EOF

# Kernel parameters for performance
sudo tee -a /etc/sysctl.conf > /dev/null <<EOF
# Network optimizations
net.core.somaxconn = 65536
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_max_syn_backlog = 65536
net.ipv4.tcp_fin_timeout = 30
net.ipv4.tcp_keepalive_time = 1200

# Memory management
vm.swappiness = 10
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5

# File system
fs.file-max = 2097152
fs.inotify.max_user_watches = 524288
EOF

sudo sysctl -p
```

## Environment Configuration

### 1. Production Environment Variables

Create a secure `.env.prod` file:

```bash
# AI Configuration (Required)
OPENAI_API_KEY=sk-proj-your-production-key-here
CLAUDE_API_KEY=sk-ant-your-claude-key-here
GEMINI_API_KEY=your-gemini-key-here

# Database Configuration
DATABASE_URL=postgresql://autollama_user:SECURE_PASSWORD_HERE@postgres-primary:5432/autollama_prod
DATABASE_POOL_SIZE=20
DATABASE_MAX_CONNECTIONS=100

# Vector Database
QDRANT_URL=https://your-production-cluster.qdrant.io
QDRANT_API_KEY=your-production-qdrant-key

# Redis Cache
REDIS_URL=redis://redis-cluster:6379
REDIS_CLUSTER_ENABLED=true

# Service Configuration
NODE_ENV=production
LOG_LEVEL=info
PORT=3001
WS_PORT=3003

# Security
SESSION_SECRET=GENERATE_RANDOM_SECRET_HERE
JWT_SECRET=GENERATE_RANDOM_JWT_SECRET_HERE
ENCRYPTION_KEY=GENERATE_32_CHAR_ENCRYPTION_KEY

# Performance
ENABLE_CONTEXTUAL_EMBEDDINGS=true
CONTEXTUAL_EMBEDDING_MODEL=gpt-4o-mini
CONTEXT_GENERATION_BATCH_SIZE=10
MAX_CONCURRENT_PROCESSING=5

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090
SENTRY_DSN=your-sentry-dsn-here

# File uploads
MAX_FILE_SIZE=104857600  # 100MB
UPLOAD_TIMEOUT=1800      # 30 minutes

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=200

# Tailscale
TS_EXTRA_ARGS=--auth-key file:/run/secrets/tsauthkey --hostname autollama-prod
```

### 2. Secret Management

```bash
# Create secure secrets directory
sudo mkdir -p /opt/autollama/secrets
sudo chmod 700 /opt/autollama/secrets

# Create Tailscale auth key
echo "your-tailscale-auth-key" | sudo tee /opt/autollama/secrets/tsauthkey
sudo chmod 600 /opt/autollama/secrets/tsauthkey

# Create database password
echo "your-secure-db-password" | sudo tee /opt/autollama/secrets/db-password
sudo chmod 600 /opt/autollama/secrets/db-password

# Generate secure session secret
openssl rand -base64 32 | sudo tee /opt/autollama/secrets/session-secret
sudo chmod 600 /opt/autollama/secrets/session-secret

# Generate JWT secret
openssl rand -base64 32 | sudo tee /opt/autollama/secrets/jwt-secret
sudo chmod 600 /opt/autollama/secrets/jwt-secret
```

## Docker Production Configuration

### 1. Production Docker Compose

Create `docker-compose.prod.yaml`:

```yaml
version: '3.8'

services:
  # Nginx Load Balancer
  nginx-lb:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./config/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./config/nginx/ssl:/etc/nginx/ssl:ro
      - ./logs/nginx:/var/log/nginx
    depends_on:
      - autollama-frontend-1
      - autollama-frontend-2
    restart: unless-stopped
    networks:
      - autollama-frontend
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
        reservations:
          memory: 256M
          cpus: '0.25'

  # React Frontend (Multiple replicas)
  autollama-frontend-1:
    build: 
      context: ./config/react-frontend
      dockerfile: Dockerfile.prod
    environment:
      - NODE_ENV=production
    volumes:
      - ./logs/frontend:/var/log/nginx
    restart: unless-stopped
    networks:
      - autollama-frontend
      - autollama-backend
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1.0'
        reservations:
          memory: 512M
          cpus: '0.5'
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:80/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  autollama-frontend-2:
    build: 
      context: ./config/react-frontend
      dockerfile: Dockerfile.prod
    environment:
      - NODE_ENV=production
    volumes:
      - ./logs/frontend:/var/log/nginx
    restart: unless-stopped
    networks:
      - autollama-frontend
      - autollama-backend
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1.0'
        reservations:
          memory: 512M
          cpus: '0.5'
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:80/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # API Services (Multiple replicas)
  autollama-api-1:
    build: 
      context: ./api
      dockerfile: Dockerfile.prod
    environment:
      - NODE_ENV=production
      - PORT=3001
      - WS_PORT=3003
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    env_file:
      - .env.prod
    volumes:
      - ./logs/api:/app/logs
      - /opt/autollama/secrets:/run/secrets:ro
    restart: unless-stopped
    networks:
      - autollama-backend
      - autollama-data
    depends_on:
      - postgres-primary
      - redis-primary
    deploy:
      resources:
        limits:
          memory: 4G
          cpus: '2.0'
        reservations:
          memory: 2G
          cpus: '1.0'
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s

  autollama-api-2:
    build: 
      context: ./api
      dockerfile: Dockerfile.prod
    environment:
      - NODE_ENV=production
      - PORT=3001
      - WS_PORT=3003
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    env_file:
      - .env.prod
    volumes:
      - ./logs/api:/app/logs
      - /opt/autollama/secrets:/run/secrets:ro
    restart: unless-stopped
    networks:
      - autollama-backend
      - autollama-data
    depends_on:
      - postgres-primary
      - redis-primary
    deploy:
      resources:
        limits:
          memory: 4G
          cpus: '2.0'
        reservations:
          memory: 2G
          cpus: '1.0'
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s

  # BM25 Search Services
  autollama-bm25-1:
    build: ./bm25-service
    environment:
      - PORT=3002
      - PYTHONPATH=/app
      - REDIS_URL=${REDIS_URL}
    volumes:
      - autollama-bm25-data:/app/data/bm25_indices
      - ./logs/bm25:/app/logs
    restart: unless-stopped
    networks:
      - autollama-backend
      - autollama-data
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '1.0'
        reservations:
          memory: 1G
          cpus: '0.5'
    healthcheck:
      test: ["CMD", "python", "-c", "import requests; requests.get('http://localhost:3002/health')"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

  # PostgreSQL Primary
  postgres-primary:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=autollama_prod
      - POSTGRES_USER=autollama_user
      - POSTGRES_PASSWORD_FILE=/run/secrets/db-password
      - POSTGRES_INITDB_ARGS=--auth-host=md5
    volumes:
      - postgres-primary-data:/var/lib/postgresql/data
      - ./database/init:/docker-entrypoint-initdb.d:ro
      - ./logs/postgres:/var/log/postgresql
      - /opt/autollama/secrets/db-password:/run/secrets/db-password:ro
    restart: unless-stopped
    networks:
      - autollama-data
    deploy:
      resources:
        limits:
          memory: 8G
          cpus: '4.0'
        reservations:
          memory: 4G
          cpus: '2.0'
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U autollama_user -d autollama_prod"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    command: >
      postgres
      -c shared_preload_libraries=pg_stat_statements
      -c pg_stat_statements.track=all
      -c max_connections=200
      -c shared_buffers=2GB
      -c effective_cache_size=6GB
      -c maintenance_work_mem=512MB
      -c checkpoint_completion_target=0.9
      -c wal_buffers=16MB
      -c default_statistics_target=100
      -c random_page_cost=1.1
      -c effective_io_concurrency=200
      -c work_mem=32MB
      -c min_wal_size=2GB
      -c max_wal_size=8GB
      -c log_min_duration_statement=1000
      -c log_line_prefix='%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '

  # PostgreSQL Read Replica
  postgres-replica:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=autollama_prod
      - POSTGRES_USER=autollama_user
      - POSTGRES_PASSWORD_FILE=/run/secrets/db-password
      - PGUSER=postgres
    volumes:
      - postgres-replica-data:/var/lib/postgresql/data
      - /opt/autollama/secrets/db-password:/run/secrets/db-password:ro
    restart: unless-stopped
    networks:
      - autollama-data
    depends_on:
      - postgres-primary
    deploy:
      resources:
        limits:
          memory: 6G
          cpus: '2.0'
        reservations:
          memory: 3G
          cpus: '1.0'

  # Redis Primary
  redis-primary:
    image: redis:7-alpine
    command: >
      redis-server
      --appendonly yes
      --maxmemory 2gb
      --maxmemory-policy allkeys-lru
      --tcp-keepalive 60
      --save 900 1
      --save 300 10
      --save 60 10000
    volumes:
      - redis-primary-data:/data
      - ./logs/redis:/var/log/redis
    restart: unless-stopped
    networks:
      - autollama-data
    deploy:
      resources:
        limits:
          memory: 3G
          cpus: '1.0'
        reservations:
          memory: 2G
          cpus: '0.5'
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 5

  # Tailscale VPN
  autollama-tailscale:
    image: tailscale/tailscale:latest
    hostname: autollama-prod
    environment:
      - TS_EXTRA_ARGS=--auth-key file:/run/secrets/tsauthkey --hostname autollama-prod
      - TS_STATE_DIR=/var/lib/tailscale
      - TS_USERSPACE=false
    volumes:
      - tailscale-state:/var/lib/tailscale
      - /opt/autollama/secrets/tsauthkey:/run/secrets/tsauthkey:ro
    devices:
      - /dev/net/tun:/dev/net/tun
    cap_add:
      - net_admin
    restart: unless-stopped
    networks:
      - autollama-vpn

  # Monitoring - Prometheus
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./config/prometheus:/etc/prometheus:ro
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/usr/share/prometheus/console_libraries'
      - '--web.console.templates=/usr/share/prometheus/consoles'
      - '--storage.tsdb.retention.time=30d'
      - '--web.enable-lifecycle'
      - '--web.enable-admin-api'
    restart: unless-stopped
    networks:
      - autollama-monitoring

  # Monitoring - Grafana
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=your-secure-grafana-password
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - grafana-data:/var/lib/grafana
      - ./config/grafana:/etc/grafana/provisioning:ro
    restart: unless-stopped
    networks:
      - autollama-monitoring
    depends_on:
      - prometheus

volumes:
  postgres-primary-data:
    driver: local
  postgres-replica-data:
    driver: local
  redis-primary-data:
    driver: local
  autollama-bm25-data:
    driver: local
  tailscale-state:
    driver: local
  prometheus-data:
    driver: local
  grafana-data:
    driver: local

networks:
  autollama-frontend:
    driver: bridge
  autollama-backend:
    driver: bridge
  autollama-data:
    driver: bridge
    internal: true
  autollama-vpn:
    driver: bridge
  autollama-monitoring:
    driver: bridge
```

### 2. Production Dockerfile

Create `api/Dockerfile.prod`:

```dockerfile
# Multi-stage build for production
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Build application (if applicable)
RUN npm run build 2>/dev/null || echo "No build script found"

# Production stage
FROM node:18-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S autollama -u 1001

# Install production dependencies only
WORKDIR /app

# Copy built application
COPY --from=builder --chown=autollama:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=autollama:nodejs /app/ ./

# Create necessary directories
RUN mkdir -p /app/logs && \
    chown -R autollama:nodejs /app/logs && \
    chmod 755 /app/logs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# Security hardening
RUN apk add --no-cache tini && \
    apk del --purge wget curl && \
    rm -rf /var/cache/apk/*

# Switch to non-root user
USER autollama

# Expose port
EXPOSE 3001 3003

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Start application
CMD ["node", "server.js"]
```

### 3. Frontend Production Dockerfile

Create `config/react-frontend/Dockerfile.prod`:

```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --silent

# Copy source code
COPY . .

# Build for production
RUN npm run build

# Production stage
FROM nginx:alpine AS production

# Install security updates
RUN apk update && apk upgrade && \
    apk add --no-cache \
    tini \
    curl && \
    rm -rf /var/cache/apk/*

# Copy built app
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.prod.conf /etc/nginx/conf.d/default.conf

# Create nginx user and set permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

# Switch to non-root user
USER nginx

# Expose port
EXPOSE 80

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
```

## Security Hardening

### 1. Application Security

```bash
# Create security configuration file
sudo tee /opt/autollama/security.conf > /dev/null <<EOF
# Application security settings
SECURE_HEADERS=true
CONTENT_SECURITY_POLICY=true
HSTS_ENABLED=true
RATE_LIMITING=true
INPUT_VALIDATION=strict
FILE_UPLOAD_SCANNING=true
EOF
```

### 2. Network Security

```bash
# Configure fail2ban for AutoLlama
sudo tee /etc/fail2ban/jail.d/autollama.conf > /dev/null <<EOF
[autollama-api]
enabled = true
port = 8080,3001
filter = autollama-api
logpath = /opt/autollama/logs/api/*.log
maxretry = 5
bantime = 3600
findtime = 600

[autollama-frontend]
enabled = true
port = 80,443
filter = nginx-http-auth
logpath = /opt/autollama/logs/nginx/access.log
maxretry = 10
bantime = 1800
findtime = 600
EOF

# Create custom filter
sudo tee /etc/fail2ban/filter.d/autollama-api.conf > /dev/null <<EOF
[Definition]
failregex = ^.*ERROR.*failed login attempt.*from <HOST>.*$
            ^.*WARN.*suspicious activity.*from <HOST>.*$
            ^.*ERROR.*rate limit exceeded.*from <HOST>.*$
ignoreregex =
EOF

sudo systemctl restart fail2ban
```

### 3. SSL/TLS Configuration

```bash
# Generate SSL certificates (Let's Encrypt)
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificates
sudo certbot certonly --nginx -d autollama.yourdomain.com

# Create strong DH parameters
sudo openssl dhparam -out /etc/ssl/certs/dhparam.pem 2048

# Configure automatic renewal
sudo crontab -l | { cat; echo "0 12 * * * /usr/bin/certbot renew --quiet"; } | sudo crontab -
```

### 4. Nginx Security Configuration

Create `config/nginx/nginx.conf`:

```nginx
# Production Nginx Configuration
user nginx;
worker_processes auto;
pid /run/nginx.pid;

# Security headers
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' wss: https:;" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

# Rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=login:10m rate=1r/s;
limit_conn_zone $binary_remote_addr zone=conn_limit_per_ip:10m;

# Upstream backends
upstream autollama_frontend {
    least_conn;
    server autollama-frontend-1:80 max_fails=3 fail_timeout=30s weight=1;
    server autollama-frontend-2:80 max_fails=3 fail_timeout=30s weight=1;
    keepalive 32;
}

upstream autollama_api {
    least_conn;
    server autollama-api-1:3001 max_fails=3 fail_timeout=30s weight=1;
    server autollama-api-2:3001 max_fails=3 fail_timeout=30s weight=1;
    keepalive 32;
}

# Main server block
server {
    listen 80;
    server_name autollama.yourdomain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name autollama.yourdomain.com;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/autollama.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/autollama.yourdomain.com/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/autollama.yourdomain.com/chain.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_dhparam /etc/ssl/certs/dhparam.pem;
    
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_stapling on;
    ssl_stapling_verify on;
    
    # Security
    client_max_body_size 100M;
    client_body_timeout 60s;
    client_header_timeout 60s;
    
    # Logging
    access_log /var/log/nginx/autollama-access.log combined;
    error_log /var/log/nginx/autollama-error.log warn;
    
    # Rate limiting
    limit_req zone=api burst=20 nodelay;
    limit_conn conn_limit_per_ip 20;
    
    # API proxy with rate limiting
    location /api/ {
        limit_req zone=api burst=10 nodelay;
        
        proxy_pass http://autollama_api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_read_timeout 1800s;
        proxy_connect_timeout 30s;
        proxy_send_timeout 1800s;
        
        # Security
        proxy_hide_header X-Powered-By;
        proxy_set_header X-Content-Type-Options nosniff;
        proxy_set_header X-Frame-Options DENY;
    }
    
    # Frontend
    location / {
        proxy_pass http://autollama_frontend/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Caching for static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            proxy_pass http://autollama_frontend;
            proxy_cache_valid 200 1h;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
    
    # Block common attacks
    location ~* \.(aspx|php|jsp|cgi)$ {
        return 444;
    }
    
    # Block access to sensitive files
    location ~* \.(env|git|svn|htaccess|htpasswd)$ {
        deny all;
        return 444;
    }
}
```

## Database Setup & Migration

### 1. PostgreSQL Production Setup

```sql
-- Create production database
CREATE DATABASE autollama_prod;
CREATE USER autollama_user WITH PASSWORD 'secure_password_here';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE autollama_prod TO autollama_user;
ALTER USER autollama_user CREATEDB;

-- Connect to database
\c autollama_prod;

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_processed_content_status_created 
ON processed_content(status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chunks_document_contextual 
ON chunks(document_id, uses_contextual_embedding);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_upload_sessions_status_heartbeat 
ON upload_sessions(status, last_heartbeat) 
WHERE status IN ('processing', 'pending');

-- Partitioning for large tables (if needed)
-- Example: Partition processed_content by month
SELECT partman.create_parent(
    p_parent_table => 'public.processed_content',
    p_control => 'created_at',
    p_type => 'range',
    p_interval => 'monthly'
);
```

### 2. Database Migration Script

Create `database/migrate-to-production.sql`:

```sql
-- Production migration script
BEGIN;

-- Backup existing data (if migrating from development)
CREATE TABLE IF NOT EXISTS processed_content_backup AS 
SELECT * FROM processed_content;

-- Add production-specific columns
ALTER TABLE processed_content 
ADD COLUMN IF NOT EXISTS last_accessed TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS processing_node VARCHAR(50),
ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

-- Add production indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_hash 
ON processed_content(content_hash);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_last_accessed 
ON processed_content(last_accessed DESC);

-- Update statistics
ANALYZE processed_content;
ANALYZE chunks;
ANALYZE upload_sessions;

COMMIT;
```

### 3. Database Backup Strategy

```bash
#!/bin/bash
# /opt/autollama/scripts/backup-database.sh

set -e

BACKUP_DIR="/opt/autollama/backups/database"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="autollama_prod"
DB_USER="autollama_user"

# Create backup directory
mkdir -p $BACKUP_DIR

# Full database backup
pg_dump -h postgres-primary -U $DB_USER -d $DB_NAME \
    --format=custom --compress=9 \
    --file="$BACKUP_DIR/autollama_full_$DATE.dump"

# Schema-only backup
pg_dump -h postgres-primary -U $DB_USER -d $DB_NAME \
    --schema-only --format=plain \
    --file="$BACKUP_DIR/autollama_schema_$DATE.sql"

# Cleanup old backups (keep last 30 days)
find $BACKUP_DIR -name "*.dump" -mtime +30 -delete
find $BACKUP_DIR -name "*.sql" -mtime +30 -delete

# Upload to cloud storage (optional)
if [ -n "$S3_BUCKET" ]; then
    aws s3 cp "$BACKUP_DIR/autollama_full_$DATE.dump" \
        "s3://$S3_BUCKET/database-backups/"
fi

echo "Database backup completed: autollama_full_$DATE.dump"
```

## Monitoring & Logging

### 1. Prometheus Configuration

Create `config/prometheus/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "autollama_rules.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets: ["alertmanager:9093"]

scrape_configs:
  # AutoLlama API metrics
  - job_name: 'autollama-api'
    static_configs:
      - targets: ['autollama-api-1:9090', 'autollama-api-2:9090']
    metrics_path: /metrics
    scrape_interval: 15s

  # Node exporter (system metrics)
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

  # PostgreSQL metrics
  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']

  # Redis metrics
  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']

  # Nginx metrics
  - job_name: 'nginx'
    static_configs:
      - targets: ['nginx-exporter:9113']

  # Docker metrics
  - job_name: 'docker'
    static_configs:
      - targets: ['localhost:9323']
```

### 2. Alert Rules

Create `config/prometheus/autollama_rules.yml`:

```yaml
groups:
  - name: autollama.rules
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: rate(autollama_http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} errors per second"

      # API response time
      - alert: HighResponseTime
        expr: histogram_quantile(0.95, rate(autollama_http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High API response time"
          description: "95th percentile response time is {{ $value }} seconds"

      # Database connection issues
      - alert: DatabaseConnectionHigh
        expr: autollama_database_connections_active / autollama_database_connections_max > 0.8
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High database connection usage"
          description: "Database connection usage is {{ $value }}%"

      # Memory usage
      - alert: HighMemoryUsage
        expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes > 0.9
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High memory usage"
          description: "Memory usage is {{ $value }}%"

      # Disk space
      - alert: LowDiskSpace
        expr: (node_filesystem_size_bytes - node_filesystem_free_bytes) / node_filesystem_size_bytes > 0.85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Low disk space"
          description: "Disk usage is {{ $value }}%"

      # Service down
      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service is down"
          description: "{{ $labels.job }} service is down"
```

### 3. Centralized Logging

Create `config/logging/filebeat.yml`:

```yaml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /opt/autollama/logs/api/*.log
    fields:
      service: autollama-api
      environment: production
    multiline.pattern: '^\d{4}-\d{2}-\d{2}'
    multiline.negate: true
    multiline.match: after

  - type: log
    enabled: true
    paths:
      - /opt/autollama/logs/nginx/*.log
    fields:
      service: nginx
      environment: production

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
  index: "autollama-logs-%{+yyyy.MM.dd}"

processors:
  - add_host_metadata:
      when.not.contains.tags: forwarded
  - add_docker_metadata: ~
  - add_kubernetes_metadata: ~

logging.level: info
logging.to_files: true
logging.files:
  path: /var/log/filebeat
  name: filebeat
  keepfiles: 7
  permissions: 0644
```

## Backup & Recovery

### 1. Automated Backup Strategy

Create `/opt/autollama/scripts/backup-system.sh`:

```bash
#!/bin/bash
# Complete system backup script

set -e

BACKUP_DIR="/opt/autollama/backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

echo "Starting AutoLlama backup process..."

# Create backup directories
mkdir -p $BACKUP_DIR/{database,files,config,logs}

# 1. Database backup
echo "Backing up PostgreSQL database..."
docker exec autollama-postgres-primary-1 pg_dump \
    -U autollama_user -d autollama_prod \
    --format=custom --compress=9 \
    > "$BACKUP_DIR/database/autollama_db_$DATE.dump"

# 2. Configuration backup
echo "Backing up configuration files..."
tar -czf "$BACKUP_DIR/config/config_$DATE.tar.gz" \
    -C /opt/autollama \
    docker-compose.prod.yaml \
    .env.prod \
    config/ \
    scripts/

# 3. Application data backup
echo "Backing up application data..."
docker run --rm \
    -v autollama_postgres-primary-data:/source:ro \
    -v $BACKUP_DIR/files:/backup \
    alpine:latest \
    tar -czf /backup/postgres_data_$DATE.tar.gz -C /source .

# 4. Vector data backup (if using local Qdrant)
if [ -d "/opt/autollama/data/qdrant" ]; then
    echo "Backing up vector database..."
    tar -czf "$BACKUP_DIR/files/qdrant_data_$DATE.tar.gz" \
        -C /opt/autollama/data qdrant/
fi

# 5. Upload to cloud storage
if [ -n "$AWS_S3_BUCKET" ]; then
    echo "Uploading backups to S3..."
    aws s3 sync $BACKUP_DIR s3://$AWS_S3_BUCKET/autollama-backups/
fi

# 6. Cleanup old backups
echo "Cleaning up old backups..."
find $BACKUP_DIR -type f -mtime +$RETENTION_DAYS -delete

# 7. Generate backup report
BACKUP_SIZE=$(du -sh $BACKUP_DIR | cut -f1)
echo "Backup completed successfully!"
echo "Backup location: $BACKUP_DIR"
echo "Total backup size: $BACKUP_SIZE"
echo "Backup date: $DATE"

# Send notification (optional)
if [ -n "$SLACK_WEBHOOK" ]; then
    curl -X POST -H 'Content-type: application/json' \
        --data "{\"text\":\"AutoLlama backup completed successfully. Size: $BACKUP_SIZE\"}" \
        $SLACK_WEBHOOK
fi
```

### 2. Disaster Recovery Plan

Create `/opt/autollama/scripts/restore-system.sh`:

```bash
#!/bin/bash
# Disaster recovery script

set -e

BACKUP_DATE=$1
BACKUP_DIR="/opt/autollama/backups"

if [ -z "$BACKUP_DATE" ]; then
    echo "Usage: $0 <backup_date>"
    echo "Available backups:"
    ls -la $BACKUP_DIR/database/ | grep ".dump"
    exit 1
fi

echo "Starting AutoLlama disaster recovery..."
echo "Restoring from backup: $BACKUP_DATE"

# 1. Stop all services
echo "Stopping services..."
docker-compose -f docker-compose.prod.yaml down

# 2. Restore database
echo "Restoring database..."
docker-compose -f docker-compose.prod.yaml up -d postgres-primary

# Wait for database to start
sleep 30

# Drop and recreate database
docker exec autollama-postgres-primary-1 psql -U postgres -c "DROP DATABASE IF EXISTS autollama_prod;"
docker exec autollama-postgres-primary-1 psql -U postgres -c "CREATE DATABASE autollama_prod;"

# Restore from backup
docker exec -i autollama-postgres-primary-1 pg_restore \
    -U autollama_user -d autollama_prod \
    < "$BACKUP_DIR/database/autollama_db_$BACKUP_DATE.dump"

# 3. Restore configuration
echo "Restoring configuration..."
tar -xzf "$BACKUP_DIR/config/config_$BACKUP_DATE.tar.gz" -C /opt/autollama/

# 4. Restore application data
echo "Restoring application data..."
docker volume rm autollama_postgres-primary-data || true
docker volume create autollama_postgres-primary-data

docker run --rm \
    -v autollama_postgres-primary-data:/target \
    -v $BACKUP_DIR/files:/backup:ro \
    alpine:latest \
    tar -xzf /backup/postgres_data_$BACKUP_DATE.tar.gz -C /target

# 5. Start all services
echo "Starting all services..."
docker-compose -f docker-compose.prod.yaml up -d

# 6. Verify restoration
echo "Verifying restoration..."
sleep 60

# Health checks
if curl -f http://localhost:8080/api/health > /dev/null 2>&1; then
    echo "✅ API health check passed"
else
    echo "❌ API health check failed"
    exit 1
fi

if curl -f http://localhost:8080/ > /dev/null 2>&1; then
    echo "✅ Frontend health check passed"
else
    echo "❌ Frontend health check failed"
    exit 1
fi

echo "Disaster recovery completed successfully!"
echo "Please verify all functionality manually"
```

## Performance Optimization

### 1. Application Performance

```javascript
// Production performance configuration
// api/config/performance.js

module.exports = {
    // Database connection pool
    database: {
        pool: {
            min: 10,
            max: 30,
            idle: 10000,
            acquire: 60000,
            evict: 1000
        }
    },
    
    // Redis configuration
    redis: {
        host: 'redis-primary',
        port: 6379,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        maxmemoryPolicy: 'allkeys-lru',
        keyPrefix: 'autollama:',
        db: 0
    },
    
    // Processing optimization
    processing: {
        maxConcurrentJobs: 5,
        chunkBatchSize: 10,
        embeddingBatchSize: 5,
        contextGenerationTimeout: 30000,
        maxRetries: 3,
        retryDelay: 1000
    },
    
    // Rate limiting
    rateLimiting: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 200, // requests per window
        standardHeaders: true,
        legacyHeaders: false
    }
};
```

### 2. Database Optimization

```sql
-- Production PostgreSQL configuration
-- Add to postgresql.conf

# Memory settings
shared_buffers = 4GB                    # 25% of total RAM
effective_cache_size = 12GB             # 75% of total RAM
work_mem = 64MB                         # For complex queries
maintenance_work_mem = 1GB              # For maintenance operations

# Checkpoint settings
checkpoint_completion_target = 0.9
wal_buffers = 16MB
min_wal_size = 2GB
max_wal_size = 8GB

# Connection settings
max_connections = 200
shared_preload_libraries = 'pg_stat_statements'

# Query optimization
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200

# Logging for monitoring
log_min_duration_statement = 1000
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on
```

### 3. Nginx Optimization

```nginx
# Production Nginx optimization
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    # Optimize file serving
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    keepalive_requests 1000;
    
    # Buffer optimization
    client_body_buffer_size 128k;
    client_max_body_size 100m;
    client_header_buffer_size 3m;
    large_client_header_buffers 4 256k;
    
    # Proxy optimization
    proxy_buffering on;
    proxy_buffer_size 128k;
    proxy_buffers 4 256k;
    proxy_busy_buffers_size 256k;
    
    # Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;
    
    # Caching
    open_file_cache max=200000 inactive=20s;
    open_file_cache_valid 30s;
    open_file_cache_min_uses 2;
    open_file_cache_errors on;
}
```

## Scaling Strategies

### 1. Horizontal Scaling with Docker Swarm

```bash
# Initialize Docker Swarm
docker swarm init --advertise-addr $(hostname -I | awk '{print $1}')

# Create overlay networks
docker network create --driver overlay autollama-frontend
docker network create --driver overlay autollama-backend
docker network create --driver overlay autollama-data

# Deploy production stack
docker stack deploy -c docker-compose.prod.yaml autollama

# Scale services
docker service scale autollama_autollama-api=5
docker service scale autollama_autollama-frontend=3
docker service scale autollama_autollama-bm25=2

# Rolling updates
docker service update --image autollama/api:v2.1.1 autollama_autollama-api
```

### 2. Auto-scaling Configuration

Create `config/autoscaling/docker-compose.autoscale.yaml`:

```yaml
version: '3.8'

services:
  autollama-api:
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s
      resources:
        limits:
          memory: 4G
          cpus: '2.0'
        reservations:
          memory: 2G
          cpus: '1.0'
      placement:
        constraints:
          - node.role == worker
        preferences:
          - spread: node.labels.zone

  # Auto-scaling based on CPU usage
  autoscaler:
    image: docker/compose:1.29.2
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./scripts:/scripts
    environment:
      - SERVICE_NAME=autollama_autollama-api
      - MIN_REPLICAS=2
      - MAX_REPLICAS=10
      - CPU_THRESHOLD=70
      - MEMORY_THRESHOLD=80
    command: /scripts/autoscaler.sh
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager
```

### 3. Load Testing

Create `scripts/load-test.js`:

```javascript
// Load testing with Artillery
const artillery = require('artillery');

const config = {
    target: 'https://autollama.yourdomain.com',
    phases: [
        { duration: 60, arrivalRate: 10 }, // Ramp up
        { duration: 300, arrivalRate: 50 }, // Sustained load
        { duration: 60, arrivalRate: 100 } // Peak load
    ],
    scenarios: [
        {
            name: 'API Health Check',
            weight: 20,
            flow: [
                { get: { url: '/api/health' } }
            ]
        },
        {
            name: 'Document Processing',
            weight: 30,
            flow: [
                {
                    post: {
                        url: '/api/process-url',
                        json: {
                            url: 'https://en.wikipedia.org/wiki/Machine_learning'
                        }
                    }
                }
            ]
        },
        {
            name: 'Search Functionality',
            weight: 50,
            flow: [
                { get: { url: '/api/search?q=machine learning&limit=20' } }
            ]
        }
    ]
};

// Run load test
artillery.run(config).then((result) => {
    console.log('Load test completed:', result);
});
```

## Deployment Automation

### 1. CI/CD Pipeline

Create `.github/workflows/deploy-production.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
    tags: ['v*']

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: api/package-lock.json
      
      - name: Install dependencies
        run: cd api && npm ci
      
      - name: Run tests
        run: cd api && npm test
      
      - name: Run security audit
        run: cd api && npm audit --audit-level high

  build:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Log in to Container Registry
        uses: docker/login-action@v2
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v4
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
      
      - name: Build and push API image
        uses: docker/build-push-action@v4
        with:
          context: ./api
          file: ./api/Dockerfile.prod
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
      
      - name: Build and push Frontend image
        uses: docker/build-push-action@v4
        with:
          context: ./config/react-frontend
          file: ./config/react-frontend/Dockerfile.prod
          push: true
          tags: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}-frontend:${{ steps.meta.outputs.version }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to production
        uses: appleboy/ssh-action@v0.1.5
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            cd /opt/autollama
            git pull origin main
            docker-compose -f docker-compose.prod.yaml pull
            docker-compose -f docker-compose.prod.yaml up -d --remove-orphans
            
            # Health check
            sleep 60
            curl -f http://localhost:8080/api/health || exit 1
            
            # Cleanup old images
            docker image prune -f
```

### 2. Zero-Downtime Deployment

Create `scripts/zero-downtime-deploy.sh`:

```bash
#!/bin/bash
# Zero-downtime deployment script

set -e

NEW_VERSION=$1
if [ -z "$NEW_VERSION" ]; then
    echo "Usage: $0 <version>"
    exit 1
fi

echo "Starting zero-downtime deployment to version $NEW_VERSION"

# 1. Pull new images
echo "Pulling new images..."
docker-compose -f docker-compose.prod.yaml pull

# 2. Start new instances alongside existing ones
echo "Starting new API instances..."
docker-compose -f docker-compose.prod.yaml up -d --scale autollama-api=4 --no-recreate

# 3. Wait for new instances to be healthy
echo "Waiting for new instances to be healthy..."
for i in {1..30}; do
    if curl -f http://localhost:8080/api/health > /dev/null 2>&1; then
        echo "Health check passed"
        break
    fi
    
    if [ $i -eq 30 ]; then
        echo "Health check failed, rolling back"
        docker-compose -f docker-compose.prod.yaml up -d --scale autollama-api=2
        exit 1
    fi
    
    sleep 10
done

# 4. Update load balancer configuration to include new instances
echo "Updating load balancer..."
# This would typically involve updating nginx upstream or external load balancer

# 5. Scale down old instances
echo "Scaling down old instances..."
docker-compose -f docker-compose.prod.yaml up -d --scale autollama-api=2

# 6. Update frontend with zero downtime
echo "Updating frontend..."
docker-compose -f docker-compose.prod.yaml up -d --no-deps autollama-frontend-1
sleep 30
docker-compose -f docker-compose.prod.yaml up -d --no-deps autollama-frontend-2

# 7. Final health check
echo "Performing final health check..."
if curl -f http://localhost:8080/api/health > /dev/null 2>&1; then
    echo "✅ Deployment successful"
    
    # Cleanup old images
    docker image prune -f
    
    # Send notification
    if [ -n "$SLACK_WEBHOOK" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"AutoLlama v$NEW_VERSION deployed successfully\"}" \
            $SLACK_WEBHOOK
    fi
else
    echo "❌ Deployment failed final health check"
    exit 1
fi
```

## Troubleshooting

### 1. Common Production Issues

#### High Memory Usage
```bash
# Monitor memory usage
docker stats --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"

# Check for memory leaks
docker exec autollama-api-1 node -e "
console.log('Memory usage:', process.memoryUsage());
if (global.gc) {
    global.gc();
    console.log('After GC:', process.memoryUsage());
}"

# Restart high-memory containers
docker-compose -f docker-compose.prod.yaml restart autollama-api-1
```

#### Database Connection Issues
```bash
# Check database connections
docker exec postgres-primary psql -U autollama_user -d autollama_prod -c "
SELECT COUNT(*) as active_connections, 
       state, 
       application_name 
FROM pg_stat_activity 
WHERE state = 'active' 
GROUP BY state, application_name;"

# Check for long-running queries
docker exec postgres-primary psql -U autollama_user -d autollama_prod -c "
SELECT pid, 
       now() - pg_stat_activity.query_start AS duration, 
       query 
FROM pg_stat_activity 
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';"
```

#### SSL Certificate Issues
```bash
# Check certificate expiry
openssl x509 -in /etc/letsencrypt/live/autollama.yourdomain.com/cert.pem -text -noout | grep "Not After"

# Test SSL configuration
curl -I https://autollama.yourdomain.com

# Check certificate chain
openssl s_client -connect autollama.yourdomain.com:443 -servername autollama.yourdomain.com
```

### 2. Performance Debugging

#### API Response Time Issues
```bash
# Monitor API response times
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:8080/api/health

# Create curl-format.txt
cat > curl-format.txt << EOF
     time_namelookup:  %{time_namelookup}\n
        time_connect:  %{time_connect}\n
     time_appconnect:  %{time_appconnect}\n
    time_pretransfer:  %{time_pretransfer}\n
       time_redirect:  %{time_redirect}\n
  time_starttransfer:  %{time_starttransfer}\n
                     ----------\n
          time_total:  %{time_total}\n
EOF
```

#### Database Performance Issues
```sql
-- Check slow queries
SELECT query, 
       mean_time, 
       calls, 
       total_time,
       (total_time / calls) as avg_time
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

-- Check index usage
SELECT schemaname,
       tablename,
       indexname,
       idx_scan,
       idx_tup_read,
       idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Check table sizes
SELECT schemaname,
       tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### 3. Recovery Procedures

#### Service Recovery
```bash
# Restart individual services
docker-compose -f docker-compose.prod.yaml restart autollama-api-1

# Full system restart
docker-compose -f docker-compose.prod.yaml down
docker-compose -f docker-compose.prod.yaml up -d

# Check service health
docker-compose -f docker-compose.prod.yaml ps
docker-compose -f docker-compose.prod.yaml logs -f autollama-api-1
```

#### Database Recovery
```bash
# Emergency read-only mode
docker exec postgres-primary psql -U postgres -c "
ALTER SYSTEM SET default_transaction_read_only = on;
SELECT pg_reload_conf();"

# Check database integrity
docker exec postgres-primary psql -U autollama_user -d autollama_prod -c "
SELECT datname, 
       pg_database_size(datname) as size,
       pg_size_pretty(pg_database_size(datname)) as pretty_size
FROM pg_database 
WHERE datname = 'autollama_prod';"
```

This comprehensive production deployment guide covers all aspects of deploying AutoLlama v2.1 in a production environment with high availability, security, and performance optimizations.