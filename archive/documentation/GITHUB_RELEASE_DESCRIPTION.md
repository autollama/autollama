# AutoLlama v2.1 "Context Llama" - Comprehensive Settings Management

> *The most context-aware llama in the digital pasture! Now with 35% better understanding, comprehensive settings management, and 100% more personality.*

## 🎉 Major New Features

### ⚙️ Settings Modal System
- **4-Tab Interface**: Connections, OpenWebUI, Processing, System configuration
- **Real-time Validation**: Instant API key testing and connection verification  
- **Auto-save**: Settings automatically saved with visual feedback
- **Import/Export**: JSON backup and restore functionality
- **Keyboard Shortcuts**: Ctrl+S to save, Esc to close

### 🔗 Multi-Provider AI Support  
- **OpenAI**: GPT-4o, GPT-4o-mini, GPT-3.5-turbo models
- **Claude (Anthropic)**: Advanced reasoning and analysis
- **Google Gemini**: Diverse AI capabilities
- **Real-time Connection Testing**: Verify API keys instantly

### 🎛️ User-Configurable Processing
- **Dynamic Chunking**: Adjust chunk size (100-5000 chars) and overlap via UI
- **AI Model Selection**: Choose optimal model for your use case
- **Cost Analysis**: Real-time per-document and monthly cost estimates
- **Performance Tuning**: Batch sizes, timeouts, processing parameters

## 🖥️ Complete React Frontend

### Modern Architecture
- **React 18 + Vite**: Hot module replacement for development
- **Tailwind CSS**: Responsive design with dark/light themes
- **Component Architecture**: Modular, reusable components with custom hooks
- **Real-time Updates**: Server-Sent Events for processing progress

### Advanced Features  
- **Dashboard**: Health monitoring and processing queue management
- **File Upload**: Drag-and-drop support for PDFs, EPUB, DOC, TXT, etc.
- **Unified Search**: BM25 lexical + semantic search modes
- **Document Viewer**: Chunk inspection with vector heatmaps
- **Error Boundaries**: Comprehensive error handling and recovery

## 📚 Enhanced Documentation
- **Updated README.md**: Comprehensive v2.1 feature documentation
- **Enhanced CLAUDE.md**: Settings system architecture details  
- **Performance Analysis**: Detailed performance regression documentation

## ⚡ Performance & Compatibility

### ✅ Improvements
- **Optimized Docker**: Enhanced container orchestration
- **API Caching**: Configurable timeout and response caching
- **Component Optimization**: React.memo and lazy loading

### ⚠️ Known Issues
- **Processing Tab Lag**: 4-6 second delay in settings modal Processing tab
- **Root Cause**: Heavy API calls in useEffect hooks during component mount
- **Status**: Documented in PERFORMANCE_ISSUES.md with optimization roadmap

### 🔄 Backward Compatibility
- **Fully Compatible**: All v2.0 configurations continue to work
- **Dual Configuration**: Environment variables + UI settings management
- **No Breaking Changes**: Seamless upgrade path

## 🛠️ Technical Highlights
- **560 files changed**: 198,974 insertions, comprehensive codebase enhancement
- **Settings Storage**: localStorage with React Context state management
- **Connection Validation**: Async testing for all configured services
- **Tailscale Integration**: Secure VPN networking maintained

## 🚀 Getting Started with v2.1

1. **Pull the latest changes**:
   ```bash
   git pull origin main
   docker compose down && docker compose up -d
   ```

2. **Access the settings**: Click the gear ⚙️ icon in the top-right corner

3. **Configure your APIs**: Add OpenAI, Claude, or Gemini API keys via the UI

4. **Customize processing**: Adjust chunk sizes and AI models to your needs

## 🤖 Credits
Built with ❤️ and comprehensive testing. Special thanks to the community for feedback and the smart llamas who made this possible!

---

**Full Changelog**: [v2.0.0...v2.1](https://github.com/snedea/autollama/compare/v2.0.0...v2.1)