# AutoLlama v2.3.4 - Pure Local Mode Deployment Guide

**Complete Air-Gapped Deployment for Enterprise Environments**

This guide provides step-by-step instructions for deploying AutoLlama in pure local mode with zero external dependencies (except optional OpenAI API). Perfect for enterprise environments, air-gapped networks, and privacy-sensitive deployments.

## Table of Contents

- [Quick Start](#quick-start)
- [Hardware Requirements](#hardware-requirements)
- [System Prerequisites](#system-prerequisites)
- [Air-Gapped Installation](#air-gapped-installation)
- [Network Isolation Verification](#network-isolation-verification)
- [Performance Tuning](#performance-tuning)
- [Security Configuration](#security-configuration)
- [Troubleshooting](#troubleshooting)
- [Backup & Recovery](#backup--recovery)

## Quick Start

**5-Minute Local Deployment:**

```bash
# 1. Clone repository
git clone https://github.com/autollama/autollama.git
cd autollama

# 2. Set up local environment
cp .env.local.example .env.local
# Edit .env.local and set your OpenAI API key (only external dependency)

# 3. Create data directories
mkdir -p data/{postgres-local,qdrant-local,bm25-local,redis-local}

# 4. Start complete local stack
docker-compose -f docker-compose.local.yml up -d

# 5. Access your air-gapped AutoLlama
open http://localhost:8080
```

**That's it!** Your completely local, air-gapped AutoLlama instance is running.

## Hardware Requirements

### Minimum Requirements
- **CPU**: 4 cores, 2.4GHz
- **RAM**: 16GB
- **Storage**: 100GB SSD
- **Network**: Isolated/air-gapped network

### Recommended Enterprise Configuration
- **CPU**: 2x Intel Xeon (8+ cores each)
- **RAM**: 64GB DDR3/DDR4
- **Storage**: 500GB NVMe SSD
- **GPU**: 2x NVIDIA RTX 3060 (12GB VRAM each) *optional for enhanced performance*
- **Network**: Isolated enterprise network

### Resource Allocation (64GB System)
```yaml
# Optimized for 64GB RAM enterprise setup
PostgreSQL: 16GB (shared_buffers: 4GB, effective_cache: 12GB)
Qdrant: 16GB (8GB reserved, 8GB limit)
Redis: 5GB (4GB max memory)
API Services: 8GB
Frontend: 1GB
System Reserve: 18GB
```

## System Prerequisites

### Operating System
- **Linux**: Ubuntu 20.04+, RHEL 8+, CentOS 8+
- **Docker**: Version 20.10+
- **Docker Compose**: Version 2.0+

### Enterprise Linux Setup
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y docker.io docker-compose-v2 git curl

# RHEL/CentOS
sudo dnf install -y docker docker-compose git curl
sudo systemctl enable --now docker

# Add user to docker group
sudo usermod -aG docker $USER
# Log out and back in for group changes to take effect
```

### Firewall Configuration (Air-Gapped)
```bash
# Allow only local network communication
sudo ufw reset
sudo ufw default deny incoming
sudo ufw default deny outgoing

# Allow local services
sudo ufw allow from 172.30.0.0/24  # AutoLlama network
sudo ufw allow out 53              # DNS (if needed)

# Allow OpenAI API (optional, for AI features)
sudo ufw allow out 443 to api.openai.com

sudo ufw enable
```

## Air-Gapped Installation

### Step 1: Environment Configuration

Create your local environment file:

```bash
cp .env.local.example .env.local
```

**Critical Settings for Air-Gapped Mode:**

```bash
# .env.local - Air-Gapped Configuration
VECTOR_DB_MODE=local
VECTOR_DB_MODE_LOCKED=true  # Prevent accidental mode changes

# Local Services (NO external URLs)
DATABASE_URL=postgresql://autollama:autollama_secure_password@localhost:5432/autollama
QDRANT_LOCAL_URL=http://localhost:6333
REDIS_URL=redis://localhost:6379

# Security Settings
TELEMETRY_DISABLED=true
ANALYTICS_DISABLED=true
DEBUG_MODE=false

# Optional: OpenAI API (only external dependency)
OPENAI_API_KEY=your_openai_api_key_here
```

### Step 2: Data Directory Setup

```bash
# Create persistent data directories
mkdir -p data/{postgres-local,qdrant-local,bm25-local,redis-local}
mkdir -p logs/{api,postgres,qdrant,redis,bm25}
mkdir -p config/{postgres,qdrant}

# Set proper permissions
sudo chown -R $USER:docker data logs config
chmod -R 755 data logs config
```

### Step 3: Service Deployment

```bash
# Deploy complete local stack
docker-compose -f docker-compose.local.yml up -d

# Verify all services are running
docker-compose -f docker-compose.local.yml ps

# Check service health
docker-compose -f docker-compose.local.yml logs -f autollama-api
```

### Step 4: Initial Configuration

```bash
# Wait for services to initialize (2-3 minutes)
sleep 180

# Verify API health
curl -f http://localhost:3001/api/health

# Verify Qdrant connectivity
curl -f http://localhost:6333/health

# Access web interface
echo "AutoLlama is ready: http://localhost:8080"
```

## Network Isolation Verification

### Verify Zero External Connections

**1. Network Traffic Monitoring:**
```bash
# Monitor outbound connections
sudo netstat -tupln | grep ESTABLISHED
sudo ss -tuln | grep :80\|:443

# Should only show local connections (127.0.0.1, 172.30.0.0/24)
```

**2. Container Network Inspection:**
```bash
# Verify isolated network
docker network inspect autollama_autollama-local

# Check DNS resolution (should be local only)
docker exec autollama-autollama-api-1 nslookup qdrant-local
```

**3. Air-Gap Validation Script:**
```bash
#!/bin/bash
# air-gap-check.sh
echo "🔍 AutoLlama Air-Gap Validation"

# Check for external DNS queries
if sudo netstat -tupln | grep :53 | grep -v 127.0.0.1; then
    echo "❌ External DNS detected"
else
    echo "✅ No external DNS queries"
fi

# Check for HTTPS connections
if sudo netstat -tupln | grep :443 | grep -v 127.0.0.1; then
    echo "⚠️  HTTPS connections detected (may be OpenAI API)"
else
    echo "✅ No external HTTPS connections"
fi

# Verify service isolation
docker network ls | grep autollama
echo "✅ Air-gap validation complete"
```

### Disable External Communication (Optional)

For maximum security, block all external traffic:

```bash
# Create air-gap enforcement script
cat > air-gap-enforce.sh << 'EOF'
#!/bin/bash
# Block all external traffic except essential
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# Allow loopback
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Allow established connections
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow local network (adjust subnet as needed)
iptables -A INPUT -s 192.168.0.0/16 -j ACCEPT
iptables -A OUTPUT -d 192.168.0.0/16 -j ACCEPT
iptables -A INPUT -s 10.0.0.0/8 -j ACCEPT
iptables -A OUTPUT -d 10.0.0.0/8 -j ACCEPT

# Allow Docker networks
iptables -A INPUT -s 172.16.0.0/12 -j ACCEPT
iptables -A OUTPUT -d 172.16.0.0/12 -j ACCEPT

echo "🔒 Air-gap enforcement enabled"
EOF

chmod +x air-gap-enforce.sh
# sudo ./air-gap-enforce.sh  # Uncomment to enforce
```

## Performance Tuning

### Enterprise Hardware Optimization (64GB RAM)

**1. PostgreSQL Tuning:**
```bash
# config/postgres/postgresql.conf
shared_buffers = 4GB
effective_cache_size = 12GB
maintenance_work_mem = 1GB
work_mem = 64MB
max_connections = 200
checkpoint_completion_target = 0.9
wal_buffers = 32MB
random_page_cost = 1.1
effective_io_concurrency = 200
```

**2. Qdrant Optimization:**
```bash
# Add to .env.local
QDRANT_MEMORY_THRESHOLD=8GB
QDRANT_MAX_SEARCH_THREADS=8
QDRANT_MAX_OPTIMIZATION_THREADS=4
```

**3. System-Level Tuning:**
```bash
# /etc/sysctl.d/99-autollama.conf
vm.swappiness=10
vm.dirty_ratio=15
vm.dirty_background_ratio=5
net.core.somaxconn=1024
net.ipv4.tcp_keepalive_time=600
net.ipv4.tcp_keepalive_probes=3
net.ipv4.tcp_keepalive_intvl=90

# Apply settings
sudo sysctl --system
```

### Monitoring Performance

```bash
# Resource monitoring script
cat > monitor.sh << 'EOF'
#!/bin/bash
echo "📊 AutoLlama Performance Monitor"
echo "==============================="

# Docker stats
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

# System resources
echo -e "\n🖥️  System Resources:"
free -h
df -h /var/lib/docker

# Service health
echo -e "\n🏥 Service Health:"
curl -sf http://localhost:3001/api/health && echo "API: ✅" || echo "API: ❌"
curl -sf http://localhost:6333/health && echo "Qdrant: ✅" || echo "Qdrant: ❌"
docker exec autollama-redis-local-1 redis-cli ping &>/dev/null && echo "Redis: ✅" || echo "Redis: ❌"
EOF

chmod +x monitor.sh
```

## Security Configuration

### Enterprise Security Hardening

**1. Container Security:**
```bash
# Create non-root user for containers
cat > config/security/user.conf << 'EOF'
# Run all services as non-root
user: 999:999
read_only: true
no_new_privileges: true
security_opt:
  - no-new-privileges:true
  - seccomp:unconfined
EOF
```

**2. Secrets Management:**
```bash
# Create secrets directory
mkdir -p /opt/autollama/secrets
chmod 700 /opt/autollama/secrets

# Generate secure passwords
openssl rand -base64 32 > /opt/autollama/secrets/db-password
openssl rand -base64 32 > /opt/autollama/secrets/api-secret
chmod 600 /opt/autollama/secrets/*
```

**3. Audit Logging:**
```bash
# Enable audit logging in .env.local
AUDIT_LOGGING_ENABLED=true
AUDIT_LOG_RETENTION_DAYS=90
COMPLIANCE_MODE=enterprise
GDPR_COMPLIANCE=true
SOC2_COMPLIANCE=true
```

### Access Control

**1. Network Segmentation:**
```bash
# Create isolated network with custom subnet
docker network create \
  --driver bridge \
  --subnet=172.30.0.0/24 \
  --gateway=172.30.0.1 \
  --opt com.docker.network.bridge.name=autollama-secure \
  autollama-local
```

**2. Service Hardening:**
```bash
# Disable unnecessary services
sudo systemctl disable cups bluetooth
sudo systemctl stop cups bluetooth

# Enable fail2ban for SSH protection
sudo apt install fail2ban
sudo systemctl enable fail2ban
```

## Troubleshooting

### Common Issues and Solutions

**1. Services Won't Start:**
```bash
# Check Docker daemon
sudo systemctl status docker

# Check resource limits
free -h
df -h

# View service logs
docker-compose -f docker-compose.local.yml logs autollama-api
```

**2. Qdrant Connection Issues:**
```bash
# Verify Qdrant is running
docker exec autollama-qdrant-local-1 curl -f http://localhost:6333/health

# Check collection status
curl -f http://localhost:6333/collections

# Reset Qdrant data (if needed)
docker-compose -f docker-compose.local.yml down
sudo rm -rf data/qdrant-local/*
docker-compose -f docker-compose.local.yml up -d
```

**3. PostgreSQL Performance Issues:**
```bash
# Check PostgreSQL logs
docker-compose -f docker-compose.local.yml logs postgres-local

# Monitor queries
docker exec autollama-postgres-local-1 psql -U autollama -c "
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY total_time DESC LIMIT 10;"
```

**4. Memory Issues:**
```bash
# Monitor memory usage
docker stats --no-stream

# Restart services if needed
docker-compose -f docker-compose.local.yml restart
```

### Debug Mode

Enable debug mode for troubleshooting:

```bash
# In .env.local
DEBUG_MODE=true
LOG_LEVEL=debug

# Restart services
docker-compose -f docker-compose.local.yml restart autollama-api

# View debug logs
docker-compose -f docker-compose.local.yml logs -f autollama-api | grep DEBUG
```

## Backup & Recovery

### Automated Backup Setup

**1. Create Backup Script:**
```bash
#!/bin/bash
# backup.sh - AutoLlama Local Backup
BACKUP_DIR="/opt/autollama/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

echo "🔄 Starting AutoLlama backup: $DATE"

# Stop services gracefully
docker-compose -f docker-compose.local.yml stop

# Backup data directories
tar -czf "$BACKUP_DIR/autollama_data_$DATE.tar.gz" data/
tar -czf "$BACKUP_DIR/autollama_config_$DATE.tar.gz" config/ .env.local

# Backup PostgreSQL
docker run --rm \
  -v autollama_postgres-local-data:/source \
  -v "$BACKUP_DIR":/backup \
  ubuntu tar -czf "/backup/postgres_$DATE.tar.gz" -C /source .

# Backup Qdrant
docker run --rm \
  -v autollama_qdrant-local-data:/source \
  -v "$BACKUP_DIR":/backup \
  ubuntu tar -czf "/backup/qdrant_$DATE.tar.gz" -C /source .

# Restart services
docker-compose -f docker-compose.local.yml start

# Cleanup old backups (keep 30 days)
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete

echo "✅ Backup completed: $BACKUP_DIR"
```

**2. Schedule Automated Backups:**
```bash
# Add to crontab
crontab -e

# Daily backup at 2 AM
0 2 * * * /path/to/autollama/backup.sh >> /var/log/autollama-backup.log 2>&1
```

### Recovery Process

**1. Complete System Recovery:**
```bash
#!/bin/bash
# restore.sh - AutoLlama Recovery
BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup_file.tar.gz>"
    exit 1
fi

echo "🔄 Starting AutoLlama recovery from: $BACKUP_FILE"

# Stop all services
docker-compose -f docker-compose.local.yml down

# Clear existing data
sudo rm -rf data/*

# Restore data
tar -xzf "$BACKUP_FILE" -C ./

# Restart services
docker-compose -f docker-compose.local.yml up -d

echo "✅ Recovery completed"
```

**2. Selective Recovery:**
```bash
# Restore only PostgreSQL
docker-compose -f docker-compose.local.yml stop postgres-local
docker run --rm -v "$PWD/backup:/backup" -v autollama_postgres-local-data:/target ubuntu \
  tar -xzf "/backup/postgres_backup.tar.gz" -C /target
docker-compose -f docker-compose.local.yml start postgres-local
```

## Enterprise Integration

### LDAP/Active Directory Integration

Configure enterprise authentication:

```bash
# Add to .env.local
LDAP_ENABLED=true
LDAP_URL=ldap://your-domain-controller
LDAP_BIND_DN=cn=admin,dc=company,dc=com
LDAP_SEARCH_BASE=ou=users,dc=company,dc=com
```

### Compliance Configuration

```bash
# Enterprise compliance settings
COMPLIANCE_MODE=enterprise
AUDIT_LOGGING_ENABLED=true
DATA_CLASSIFICATION=CONFIDENTIAL
ENCRYPTION_AT_REST=true
ENCRYPTION_IN_TRANSIT=true
GDPR_COMPLIANCE=true
HIPAA_COMPLIANCE=false  # Enable if needed
SOC2_COMPLIANCE=true
```

### Monitoring Integration

```bash
# Prometheus metrics (local only)
PROMETHEUS_ENABLED=true
PROMETHEUS_PORT=9090

# Health check endpoints
HEALTH_CHECK_INTERVAL=30
HEALTH_CHECK_TIMEOUT=10
```

## Next Steps

After successful deployment:

1. **Upload Documents**: Start processing your enterprise documents
2. **Configure RAG**: Optimize chunk sizes and context settings
3. **Train Models**: Fine-tune for your specific document types
4. **Monitor Performance**: Set up alerting and monitoring
5. **Scale Resources**: Adjust based on usage patterns

## Support

For enterprise support and consulting:
- **Documentation**: [Enterprise Guide](ENTERPRISE.md)
- **GitHub Issues**: [Report Issues](https://github.com/autollama/autollama/issues)
- **Security Reports**: security@autollama.io

---

**AutoLlama v2.3.4 - Your Knowledge, Locally Secured** 🏠🔒