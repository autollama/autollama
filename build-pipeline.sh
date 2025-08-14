#!/bin/bash

# AutoLlama v2.3.1 - Build Script
# Builds all AutoLlama components for production deployment

set -e  # Exit on any error

echo "🦙 AutoLlama v2.3.1 Build System"
echo "================================="

# Function to check prerequisites
check_prerequisites() {
    echo "🔍 Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        echo "❌ Docker is required but not installed"
        echo "   Install from: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    # Check Docker Compose
    if ! docker compose version &> /dev/null; then
        echo "❌ Docker Compose is required but not available"
        exit 1
    fi
    
    echo "✅ Prerequisites satisfied"
}

# Function to build Docker images
build_images() {
    echo ""
    echo "🏗️ Building Docker images..."
    
    # Build API service
    echo "📦 Building API service..."
    docker compose -f docker-compose.public.yaml build autollama-api --no-cache
    
    # Build frontend
    echo "📦 Building React frontend..."
    docker compose -f docker-compose.public.yaml build autollama --no-cache
    
    # Build BM25 service
    echo "📦 Building BM25 search service..."
    docker compose -f docker-compose.public.yaml build autollama-bm25 --no-cache
    
    echo "✅ All images built successfully"
}

# Function to validate build
validate_build() {
    echo ""
    echo "🧪 Validating build..."
    
    # Check if .env exists
    if [ ! -f ".env" ]; then
        echo "⚠️  No .env file found. Copy .env.public.example to .env and configure it."
        echo "   cp .env.public.example .env"
        return 1
    fi
    
    # Test configuration
    if docker compose -f docker-compose.public.yaml config > /dev/null 2>&1; then
        echo "✅ Docker Compose configuration is valid"
    else
        echo "❌ Docker Compose configuration has errors"
        return 1
    fi
}

# Main execution
main() {
    check_prerequisites
    build_images
    validate_build
    
    echo ""
    echo "🎉 Build completed successfully!"
    echo ""
    echo "🚀 Quick start commands:"
    echo "   ./quick-start.sh              # Interactive setup (recommended)"
    echo "   npm run start                 # Start services"
    echo "   npm run logs                  # View logs"
    echo "   npm run health                # Check health"
    echo ""
    echo "🌐 Access points after starting:"
    echo "   http://localhost:7734         # Main interface"
    echo "   http://localhost:7734/health  # Health check"
}

# Run main function
main