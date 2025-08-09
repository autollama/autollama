#!/bin/bash

# AutoLlama Pipeline UI Build Script
echo "🦙 Building AutoLlama Pipeline UI..."

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ to build the pipeline UI."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18 or higher is required. Current version: $(node -v)"
    exit 1
fi

# Navigate to pipeline directory
cd config/pipeline

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies"
        exit 1
    fi
fi

# Type check
echo "🔍 Running type check..."
npm run type-check
if [ $? -ne 0 ]; then
    echo "❌ Type check failed"
    exit 1
fi

# Build the React app
echo "🏗️ Building React app..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

# Create backup of original index.html
if [ -f "../index.html" ] && [ ! -f "../index.html.backup" ]; then
    echo "💾 Backing up original index.html..."
    cp ../index.html ../index.html.backup
fi

# Copy built files to nginx directory
echo "📋 Copying built files..."
cp -r dist/* ../
if [ $? -ne 0 ]; then
    echo "❌ Failed to copy built files"
    exit 1
fi

# Copy icons if they exist
if [ -f "../icons.svg" ]; then
    cp ../icons.svg dist/
fi

echo "✅ Pipeline UI built successfully!"
echo "🌐 The new pipeline UI will be served by nginx at http://localhost:8080"
echo ""
echo "Development commands:"
echo "  npm run dev     - Start development server"
echo "  npm run build   - Build for production"
echo "  npm run preview - Preview production build"
echo ""
echo "To restore the original UI:"
echo "  cp config/index.html.backup config/index.html"

cd ../..