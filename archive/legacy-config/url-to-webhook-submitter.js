/**
 * url-to-webhook-submitter.js
 * 
 * Main application logic for AutoLlama.io
 * Handles URL submission from the web interface and sends it to n8n webhooks
 * 
 * This script:
 * - Validates user-submitted URLs
 * - Sends URLs to n8n webhook for processing
 * - Provides visual feedback during submission
 * - Handles errors with detailed troubleshooting
 * - Supports retry logic with exponential backoff
 */

console.log('🔥 URL-TO-WEBHOOK-SUBMITTER.JS LOADED!');

class URLToWebhookSubmitter {
    constructor() {
        // DOM elements - URL mode
        this.form = document.getElementById('url-form');
        this.urlInput = document.getElementById('url-input');
        this.searchBtn = document.getElementById('url-submit-btn');
        this.status = document.getElementById('status');
        this.statusText = document.getElementById('status-text');
        this.result = document.getElementById('result');
        this.resultText = document.getElementById('result-text');
        
        // DOM elements - File mode
        this.urlTab = document.getElementById('url-tab');
        this.fileTab = document.getElementById('file-tab');
        this.fileForm = document.getElementById('file-form');
        this.dropZone = document.getElementById('drop-zone');
        this.fileInput = document.getElementById('file-input');
        this.selectedFiles = document.getElementById('selected-files');
        this.uploadBtn = document.getElementById('upload-btn');
        
        // Debug: Log which elements were found
        console.log('File upload elements found:', {
            urlTab: !!this.urlTab,
            fileTab: !!this.fileTab,
            fileForm: !!this.fileForm,
            dropZone: !!this.dropZone,
            fileInput: !!this.fileInput,
            selectedFiles: !!this.selectedFiles,
            uploadBtn: !!this.uploadBtn
        });
        
        // Dependencies
        this.config = window.webhookConfig;
        this.logger = window.webhookDebugLogger;
        
        // State
        this.isSubmitting = false;
        this.currentMode = 'url'; // 'url' or 'file'
        this.selectedFilesList = [];
        
        // Resumable sessions elements
        this.resumableSessions = document.getElementById('resumable-sessions');
        this.resumableList = document.getElementById('resumable-list');
        this.refreshSessions = document.getElementById('refresh-sessions');
        
        this.init();
    }
    
    /**
     * Initialize event listeners and log startup
     */
    init() {
        // URL mode event listeners
        this.form.addEventListener('submit', this.handleSubmit.bind(this));
        this.urlInput.addEventListener('input', this.handleInput.bind(this));
        
        // Tab switching event listeners with null checks and debugging
        if (this.urlTab) {
            console.log('Adding URL tab click listener');
            this.urlTab.addEventListener('click', (e) => {
                console.log('URL tab clicked!', e);
                this.switchMode('url');
            });
        } else {
            console.error('URL tab element not found');
        }
        
        if (this.fileTab) {
            console.log('Adding File tab click listener');
            this.fileTab.addEventListener('click', (e) => {
                console.log('File tab clicked!', e);
                this.switchMode('file');
            });
            
            // Also add a simple test to make sure the element is clickable
            this.fileTab.style.cursor = 'pointer';
            console.log('File tab element:', this.fileTab);
        } else {
            console.error('File tab element not found');
        }
        
        // File upload event listeners with null checks
        if (this.dropZone && this.fileInput) {
            this.dropZone.addEventListener('click', () => this.fileInput.click());
            this.dropZone.addEventListener('dragover', this.handleDragOver.bind(this));
            this.dropZone.addEventListener('dragleave', this.handleDragLeave.bind(this));
            this.dropZone.addEventListener('drop', this.handleDrop.bind(this));
            this.fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        } else {
            console.error('File upload elements not found:', {
                dropZone: !!this.dropZone,
                fileInput: !!this.fileInput
            });
        }
        
        if (this.uploadBtn) {
            this.uploadBtn.addEventListener('click', this.handleFileUpload.bind(this));
        } else {
            console.error('Upload button element not found');
        }
        
        // Resumable sessions event listeners
        if (this.refreshSessions) {
            this.refreshSessions.addEventListener('click', this.loadResumableSessions.bind(this));
        }
        
        // Load resumable sessions on init
        this.loadResumableSessions();
        
        // Log initialization
        this.logger.logInfo('URLToWebhookSubmitter initialized', {
            webhookUrl: this.config.getWebhookUrl(),
            environment: this.config.getEnvironment(),
            debugMode: this.config.isDebugMode()
        });
        
        // Show debug info in console if debug mode is on
        if (this.config.isDebugMode()) {
            console.log('%c🚀 AutoLlama Debug Mode Active', 'color: #FF5722; font-size: 16px; font-weight: bold');
            console.log('Current configuration:', this.config.getAllConfig());
        }
        
    }
    
    /**
     * Set up file upload tabs - called when home view is shown
     */
    setupFileUploadTabs() {
        console.log('🔧 Setting up file upload tabs...');
        
        const urlTab = document.getElementById('url-tab');
        const fileTab = document.getElementById('file-tab');
        
        if (urlTab && fileTab) {
            console.log('✅ Found both tabs, adding event listeners');
            
            // Remove any existing listeners and add new ones
            urlTab.onclick = (e) => {
                console.log('URL tab clicked');
                this.switchMode('url');
            };
            
            fileTab.onclick = (e) => {
                console.log('File tab clicked');
                this.switchMode('file');
            };
            
            // Restore last used mode from localStorage
            const lastMode = localStorage.getItem('autollama_last_mode');
            console.log('Restoring last mode from localStorage:', lastMode);
            if (lastMode && ['url', 'file'].includes(lastMode)) {
                this.switchMode(lastMode);
            } else {
                // Default to URL mode
                this.switchMode('url');
            }
            
            // Also set up file upload elements
            this.setupFileUploadElements();
        } else {
            console.log('❌ Tabs not found:', { urlTab: !!urlTab, fileTab: !!fileTab });
        }
    }
    
    /**
     * Set up file upload drag/drop and other elements
     */
    setupFileUploadElements() {
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');
        const uploadBtn = document.getElementById('upload-btn');
        
        if (dropZone && fileInput) {
            console.log('✅ Setting up file upload elements');
            
            dropZone.onclick = () => fileInput.click();
            dropZone.ondragover = this.handleDragOver.bind(this);
            dropZone.ondragleave = this.handleDragLeave.bind(this);
            dropZone.ondrop = this.handleDrop.bind(this);
            fileInput.onchange = this.handleFileSelect.bind(this);
        }
        
        if (uploadBtn) {
            uploadBtn.onclick = this.handleFileUpload.bind(this);
        }
    }
    
    /**
     * Handle input changes - reset status when user types
     */
    handleInput() {
        this.hideStatus();
        this.hideResult();
    }
    
    /**
     * Handle form submission
     */
    async handleSubmit(event) {
        event.preventDefault();
        
        if (this.isSubmitting) {
            this.logger.logWarn('Submission already in progress');
            return;
        }
        
        const url = this.urlInput.value.trim();
        if (!url) return;
        
        this.logger.logInfo('Form submitted', { url: url });
        
        // Validate URL format
        if (!this.isValidUrl(url)) {
            this.logger.logWarn('Invalid URL format', { url: url });
            this.logger.logDebug('URL validation failed');
            this.showResult('Please enter a valid URL (e.g., https://example.com)', 'error');
            return;
        }
        
        // Submit with retry logic
        this.isSubmitting = true;
        try {
            await this.submitUrlWithRetry(url);
        } finally {
            this.isSubmitting = false;
        }
    }
    
    /**
     * Validate URL format
     */
    isValidUrl(string) {
        try {
            const url = new URL(string);
            // Additional validation
            if (!['http:', 'https:'].includes(url.protocol)) {
                return false;
            }
            return true;
        } catch (_) {
            // Try adding https:// if no protocol
            if (!string.includes('://')) {
                return this.isValidUrl('https://' + string);
            }
            return false;
        }
    }
    
    /**
     * Submit URL with retry logic
     */
    async submitUrlWithRetry(url) {
        const retryConfig = this.config.getRetryConfig();
        let lastError;
        
        for (let attempt = 1; attempt <= retryConfig.attempts; attempt++) {
            try {
                await this.submitUrl(url, attempt);
                return; // Success!
            } catch (error) {
                lastError = error;
                this.logger.logWarn(`Attempt ${attempt} failed`, {
                    error: error.message,
                    willRetry: attempt < retryConfig.attempts
                });
                
                if (attempt < retryConfig.attempts) {
                    // Exponential backoff
                    const delay = retryConfig.delay * Math.pow(2, attempt - 1);
                    this.showStatus(`Retrying in ${delay / 1000} seconds... (Attempt ${attempt + 1}/${retryConfig.attempts})`);
                    await this.sleep(delay);
                }
            }
        }
        
        // All retries failed
        const troubleshooting = this.logger.logWebhookError(lastError, this.config.getWebhookUrl(), retryConfig.attempts);
        this.showDetailedError(lastError, troubleshooting);
    }
    
    /**
     * Submit URL to webhook with real-time updates
     */
    async submitUrl(url, attempt = 1) {
        const streamUrl = this.config.getWebhookUrl();
        const startTime = Date.now();
        
        console.log('Using SSE endpoint:', streamUrl);
        this.showStatus(`🚀 Starting intelligent content analysis...`);
        this.disableForm();
        
        // Ensure URL has protocol
        if (!url.includes('://')) {
            url = 'https://' + url;
        }
        
        // Prepare payload
        const payload = {
            url: url,
            timestamp: new Date().toISOString(),
            source: 'autollama.io'
        };
        
        // Log request (simplified to avoid circular reference issues)
        this.logger.logInfo('Starting SSE stream request', { url: streamUrl, environment: 'stream' });
        
        try {
            console.log('About to make SSE request to:', streamUrl);
            console.log('Payload:', payload);
            
            // Use Server-Sent Events for real-time updates
            const response = await fetch(streamUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream'
                },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            // Process the SSE stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let progressInfo = { current: 0, total: 0 };
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            this.handleSSEUpdate(data, progressInfo);
                        } catch (e) {
                            // Ignore malformed JSON
                        }
                    }
                }
            }
            
            // Success! 
            this.clearForm();
            
            // Clear pending logs on success
            window.pendingLogs = [];
            
        } catch (error) {
            console.error('SSE submission failed:', error);
            this.hideStatus();
            this.showResult(`Error: ${error.message}`, 'error');
            throw error; // Let retry logic handle it
        } finally {
            this.enableForm();
        }
    }
    
    /**
     * Handle Server-Sent Event updates
     */
    handleSSEUpdate(data, progressInfo) {
        const { step, message, progress } = data;
        
        // Update progress information if provided
        if (progress) {
            progressInfo.current = progress.current;
            progressInfo.total = progress.total;
        }
        
        // Handle different step types
        switch (step) {
            case 'start':
            case 'fetch':
            case 'extract':
            case 'convert':
            case 'chunk':
                this.showStatus(message);
                break;
                
            case 'analyze':
            case 'embed':
                // Show progress for chunk processing
                if (progressInfo.total > 0) {
                    const percent = Math.round((progressInfo.current / progressInfo.total) * 100);
                    this.showStatusWithProgress(message, percent);
                } else {
                    this.showStatus(message);
                }
                break;
                
            case 'store':
                // Quick flash of storage updates
                this.showStatus(message);
                break;
                
            case 'warning':
                console.warn('Processing warning:', message);
                // Don't update main status for warnings
                break;
                
            case 'complete':
                this.showResult(message, 'success');
                break;
                
            case 'error':
                this.showResult(message, 'error');
                break;
                
            case 'summary':
                // Parse final summary
                try {
                    const summary = JSON.parse(message);
                    console.log('Processing summary:', summary);
                } catch (e) {
                    console.log('Processing complete');
                }
                break;
        }
    }
    
    /**
     * Show detailed error with troubleshooting steps
     */
    showDetailedError(error, troubleshooting) {
        let errorMessage = `Error: ${error.message}\n\n`;
        
        if (troubleshooting && troubleshooting.steps.length > 0) {
            errorMessage += `${troubleshooting.title}\n`;
            errorMessage += troubleshooting.steps.join('\n');
        }
        
        this.showResult(errorMessage, 'error');
        
        // Also show a shorter message in the UI
        this.resultText.innerHTML = `
            <strong>Error submitting URL</strong><br>
            ${error.message}<br><br>
            <details>
                <summary>Show troubleshooting steps</summary>
                <pre style="text-align: left; font-size: 0.9em; margin-top: 10px;">${troubleshooting.steps.join('\n')}</pre>
            </details>
            <br>
            <button onclick="window.exportLogs()" style="margin-top: 10px;">Export Debug Logs</button>
        `;
    }
    
    /**
     * UI Helper Methods
     */
    /**
     * Mode switching methods
     */
    switchMode(mode) {
        console.log('Switching to mode:', mode);
        this.currentMode = mode;
        
        // Save the selected mode to localStorage for persistence
        localStorage.setItem('autollama_last_mode', mode);
        console.log('Saved mode to localStorage:', mode);
        
        if (mode === 'url') {
            // Switch to URL mode
            this.urlTab.classList.add('bg-white', 'dark:bg-gray-700', 'text-gray-900', 'dark:text-white', 'shadow-sm');
            this.urlTab.classList.remove('text-gray-500', 'dark:text-gray-400', 'hover:text-gray-700', 'dark:hover:text-gray-200');
            
            this.fileTab.classList.remove('bg-white', 'dark:bg-gray-700', 'text-gray-900', 'dark:text-white', 'shadow-sm');
            this.fileTab.classList.add('text-gray-500', 'dark:text-gray-400', 'hover:text-gray-700', 'dark:hover:text-gray-200');
            
            this.form.classList.remove('hidden');
            this.fileForm.classList.add('hidden');
        } else {
            // Switch to file mode
            this.fileTab.classList.add('bg-white', 'dark:bg-gray-700', 'text-gray-900', 'dark:text-white', 'shadow-sm');
            this.fileTab.classList.remove('text-gray-500', 'dark:text-gray-400', 'hover:text-gray-700', 'dark:hover:text-gray-200');
            
            this.urlTab.classList.remove('bg-white', 'dark:bg-gray-700', 'text-gray-900', 'dark:text-white', 'shadow-sm');
            this.urlTab.classList.add('text-gray-500', 'dark:text-gray-400', 'hover:text-gray-700', 'dark:hover:text-gray-200');
            
            this.form.classList.add('hidden');
            this.fileForm.classList.remove('hidden');
        }
        
        this.hideStatus();
        this.hideResult();
    }
    
    /**
     * File drag and drop handlers
     */
    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.add('border-primary-500', 'dark:border-primary-400', 'bg-primary-50', 'dark:bg-primary-900/20');
    }
    
    handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.remove('border-primary-500', 'dark:border-primary-400', 'bg-primary-50', 'dark:bg-primary-900/20');
    }
    
    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.remove('border-primary-500', 'dark:border-primary-400', 'bg-primary-50', 'dark:bg-primary-900/20');
        
        const files = Array.from(e.dataTransfer.files);
        this.processSelectedFiles(files);
    }
    
    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        this.processSelectedFiles(files);
    }
    
    processSelectedFiles(files) {
        // Filter valid files
        const validFiles = files.filter(file => this.isValidFile(file));
        
        if (validFiles.length !== files.length) {
            this.showResult('Some files were skipped due to invalid format or size limit (500MB max)', 'error');
        }
        
        this.selectedFilesList = validFiles;
        this.updateSelectedFilesDisplay();
        this.updateUploadButton();
    }
    
    isValidFile(file) {
        const validTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword',
            'application/epub+zip',
            'text/plain',
            'text/csv',
            'text/html'
        ];
        
        const validExtensions = ['.pdf', '.docx', '.doc', '.epub', '.txt', '.csv', '.html', '.htm'];
        const hasValidType = validTypes.includes(file.type);
        const hasValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
        const isValidSize = file.size <= 500 * 1024 * 1024; // 500MB
        
        return (hasValidType || hasValidExtension) && isValidSize;
    }
    
    updateSelectedFilesDisplay() {
        if (this.selectedFilesList.length === 0) {
            this.selectedFiles.classList.add('hidden');
            return;
        }
        
        this.selectedFiles.classList.remove('hidden');
        this.selectedFiles.innerHTML = '';
        
        this.selectedFilesList.forEach((file, index) => {
            const fileDiv = document.createElement('div');
            fileDiv.className = 'flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg';
            
            fileDiv.innerHTML = `
                <div class="flex items-center space-x-3">
                    <svg class="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z"></path>
                        <path fill-rule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clip-rule="evenodd"></path>
                    </svg>
                    <div>
                        <p class="text-sm font-medium text-gray-900 dark:text-white">${file.name}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">${this.formatFileSize(file.size)}</p>
                    </div>
                </div>
                <button class="text-red-500 hover:text-red-700 text-sm" onclick="window.app.removeFile(${index})">Remove</button>
            `;
            
            this.selectedFiles.appendChild(fileDiv);
        });
    }
    
    removeFile(index) {
        this.selectedFilesList.splice(index, 1);
        this.updateSelectedFilesDisplay();
        this.updateUploadButton();
    }
    
    updateUploadButton() {
        this.uploadBtn.disabled = this.selectedFilesList.length === 0 || this.isSubmitting;
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    /**
     * File upload handler
     */
    async handleFileUpload() {
        if (this.selectedFilesList.length === 0 || this.isSubmitting) return;
        
        this.isSubmitting = true;
        this.updateUploadButton();
        
        try {
            for (let i = 0; i < this.selectedFilesList.length; i++) {
                const file = this.selectedFilesList[i];
                await this.uploadSingleFile(file, i + 1, this.selectedFilesList.length);
            }
            
            this.showResult(`Successfully processed ${this.selectedFilesList.length} file(s)!`, 'success');
            this.selectedFilesList = [];
            this.updateSelectedFilesDisplay();
            
        } catch (error) {
            this.logger.logError('File upload failed', { error: error.message });
            this.showResult(`Upload failed: ${error.message}`, 'error');
        } finally {
            this.isSubmitting = false;
            this.updateUploadButton();
        }
    }
    
    async uploadSingleFile(file, fileNumber, totalFiles) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', file);
            
            this.showStatus(`Starting upload of ${file.name}...`);
            
            // Use streaming endpoint for detailed progress
            fetch('/api/process-file-stream', {
                method: 'POST',
                body: formData
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                
                const processStream = () => {
                    return reader.read().then(({ done, value }) => {
                        if (done) {
                            resolve({ success: true });
                            return;
                        }
                        
                        const chunk = decoder.decode(value);
                        const lines = chunk.split('\n');
                        
                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                try {
                                    const data = JSON.parse(line.slice(6));
                                    
                                    switch (data.event) {
                                        case 'start':
                                            this.showStatus(`Processing file ${fileNumber}/${totalFiles}: ${file.name}`);
                                            break;
                                        case 'upload':
                                            this.showStatusWithProgress(`Uploading ${file.name}`, data.data.progress || 0);
                                            break;
                                        case 'parse':
                                            this.showStatusWithProgress(`Parsing ${file.name}`, data.data.progress || 0);
                                            break;
                                        case 'analyze':
                                            if (data.data.current !== undefined && data.data.total !== undefined) {
                                                const percent = Math.round((data.data.current / data.data.total) * 100);
                                                this.showStatusWithProgress(data.data.message || 'Analyzing content...', percent);
                                            } else {
                                                this.showStatus(data.data.message || 'Analyzing content...');
                                            }
                                            break;
                                        case 'store':
                                            this.showStatusWithProgress(`Storing processed data`, data.data.progress || 0);
                                            break;
                                        case 'session':
                                            // Session created, store session ID for resume capability
                                            if (data.data.sessionId) {
                                                this.logger.logInfo('Upload session created', { 
                                                    sessionId: data.data.sessionId, 
                                                    filename: file.name 
                                                });
                                            }
                                            break;
                                        case 'complete':
                                            this.showStatusWithProgress(`Processing ${file.name}`, 100);
                                            resolve(data.data);
                                            return;
                                        case 'error':
                                            // On error, refresh resumable sessions list
                                            if (data.data.resumable) {
                                                setTimeout(() => this.loadResumableSessions(), 1000);
                                            }
                                            reject(new Error(data.data.message));
                                            return;
                                    }
                                } catch (parseError) {
                                    // Ignore JSON parse errors for partial chunks
                                }
                            }
                        }
                        
                        return processStream();
                    });
                };
                
                return processStream();
            })
            .catch(error => {
                reject(error);
            });
        });
    }

    showStatus(message) {
        this.statusText.textContent = message;
        this.status.classList.remove('hidden');
        this.hideResult();
    }
    
    showStatusWithProgress(message, percent) {
        const progressMessage = `${message} (${percent}%)`;
        this.statusText.textContent = progressMessage;
        this.status.classList.remove('hidden');
        this.hideResult();
    }
    
    hideStatus() {
        this.status.classList.add('hidden');
    }
    
    showResult(message, type = 'success') {
        this.resultText.textContent = message;
        this.result.classList.remove('hidden');
        
        // Add visual styling based on type
        this.result.classList.remove('success', 'error');
        this.result.classList.add(type);
        
        this.hideStatus();
    }
    
    hideResult() {
        this.result.classList.add('hidden');
    }
    
    disableForm() {
        this.urlInput.disabled = true;
        this.searchBtn.disabled = true;
        this.searchBtn.style.opacity = '0.6';
    }
    
    enableForm() {
        this.urlInput.disabled = false;
        this.searchBtn.disabled = false;
        this.searchBtn.style.opacity = '1';
        this.urlInput.focus();
    }
    
    clearForm() {
        this.urlInput.value = '';
    }
    
    /**
     * Utility function for delays
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Enhanced paste handler - auto-format URLs
 */
class URLPasteEnhancer {
    constructor(urlInput) {
        this.urlInput = urlInput;
        this.init();
    }
    
    init() {
        this.urlInput.addEventListener('paste', (e) => {
            setTimeout(() => {
                let url = this.urlInput.value.trim();
                
                // Auto-add https:// if no protocol
                if (url && !url.includes('://')) {
                    this.urlInput.value = 'https://' + url;
                    
                    // Log the auto-correction
                    if (window.webhookDebugLogger) {
                        window.webhookDebugLogger.logDebug('Auto-added https:// protocol', {
                            original: url,
                            corrected: this.urlInput.value
                        });
                    }
                }
            }, 10);
        });
    }
    
    /**
     * Load resumable sessions from the server
     */
    async loadResumableSessions() {
        if (!this.resumableList) return;
        
        try {
            const response = await fetch('/api/sessions/resumable');
            const sessions = await response.json();
            
            if (sessions.length === 0) {
                this.resumableSessions.classList.add('hidden');
                return;
            }
            
            this.resumableSessions.classList.remove('hidden');
            this.resumableList.innerHTML = '';
            
            sessions.forEach(session => {
                const sessionElement = this.createSessionElement(session);
                this.resumableList.appendChild(sessionElement);
            });
            
        } catch (error) {
            console.error('Failed to load resumable sessions:', error);
            this.resumableSessions.classList.add('hidden');
        }
    }
    
    /**
     * Create HTML element for a resumable session
     */
    createSessionElement(session) {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg';
        
        const progressPercent = Math.round((session.completedChunks / session.totalChunks) * 100);
        
        div.innerHTML = `
            <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                    <span class="text-sm font-medium text-gray-900 dark:text-white">${session.filename}</span>
                    <span class="text-xs px-2 py-1 rounded-full ${session.status === 'Failed' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'}">${session.status}</span>
                </div>
                <div class="text-xs text-gray-600 dark:text-gray-400">
                    ${session.completedChunks}/${session.totalChunks} chunks processed (${progressPercent}%)
                </div>
                <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-2">
                    <div class="bg-yellow-500 h-1.5 rounded-full" style="width: ${progressPercent}%"></div>
                </div>
            </div>
            <button class="resume-btn ml-4 px-3 py-1.5 bg-primary-500 text-white text-sm font-medium rounded-md hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2" data-session-id="${session.sessionId}">
                Resume
            </button>
        `;
        
        // Add event listener to resume button
        const resumeBtn = div.querySelector('.resume-btn');
        resumeBtn.addEventListener('click', () => this.resumeSession(session.sessionId, session.filename));
        
        return div;
    }
    
    /**
     * Resume a failed or interrupted upload session
     */
    async resumeSession(sessionId, filename) {
        this.isSubmitting = true;
        this.showStatus(`Resuming upload of ${filename}...`);
        
        try {
            const response = await fetch(`/api/resume-upload/${sessionId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            const processStream = () => {
                return reader.read().then(({ done, value }) => {
                    if (done) {
                        // Refresh sessions list when done
                        setTimeout(() => this.loadResumableSessions(), 1000);
                        return;
                    }
                    
                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n');
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                
                                switch (data.event) {
                                    case 'start':
                                        this.showStatus(`Checking session: ${filename}`);
                                        break;
                                    case 'session':
                                        this.showStatusWithProgress(`Found session: ${data.data.filename}`, data.data.progress || 10);
                                        break;
                                    case 'upload':
                                        this.showStatusWithProgress(data.data.message, data.data.progress || 0);
                                        break;
                                    case 'parse':
                                        this.showStatusWithProgress(data.data.message, data.data.progress || 0);
                                        break;
                                    case 'resume':
                                        this.showStatusWithProgress(data.data.message, data.data.progress || 50);
                                        break;
                                    case 'analyze':
                                        if (data.data.current !== undefined && data.data.total !== undefined) {
                                            const percent = Math.round((data.data.current / data.data.total) * 100);
                                            this.showStatusWithProgress(data.data.message || 'Processing chunks...', Math.max(50, Math.min(95, percent)));
                                        } else {
                                            this.showStatusWithProgress(data.data.message || 'Processing...', data.data.progress || 70);
                                        }
                                        break;
                                    case 'complete':
                                        this.showStatusWithProgress('Resume completed successfully!', 100);
                                        this.showResult(`Successfully resumed and completed processing of ${filename}`, 'success');
                                        break;
                                    case 'error':
                                        throw new Error(data.data.message);
                                }
                            } catch (parseError) {
                                // Ignore JSON parse errors for partial chunks
                            }
                        }
                    }
                    
                    return processStream();
                });
            };
            
            await processStream();
            
        } catch (error) {
            this.logger.logError('Resume upload failed', { sessionId, error: error.message });
            this.showResult(`Resume failed: ${error.message}`, 'error');
        } finally {
            this.isSubmitting = false;
        }
    }
}

/**
 * Initialize the application when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('🟢 DOM loaded, initializing AutoLlama...');
    
    // Wait for dependencies to load
    if (!window.webhookConfig || !window.webhookDebugLogger) {
        console.error('❌ Dependencies not loaded! Make sure webhook-config.js and webhook-debug-logger.js are loaded first.');
        return;
    }
    
    // Test if file tab element exists right now
    const testFileTab = document.getElementById('file-tab');
    console.log('🔍 File tab element test at DOM ready:', testFileTab);
    
    try {
        // Initialize main application
        console.log('🚀 Creating URLToWebhookSubmitter...');
        const app = new URLToWebhookSubmitter();
        window.app = app; // Expose globally for remove file buttons
        console.log('✅ URLToWebhookSubmitter created successfully');
    } catch (error) {
        console.error('❌ Error creating URLToWebhookSubmitter:', error);
    }
    
    // Simple test - add click listener directly to file tab after a delay
    setTimeout(() => {
        console.log('⏰ Testing file tab after 1 second...');
        const fileTab = document.getElementById('file-tab');
        console.log('📋 File tab element found:', fileTab);
        
        if (fileTab) {
            console.log('🎯 Adding simple onclick test...');
            fileTab.onclick = function(e) {
                console.log('🟢 SIMPLE ONCLICK WORKED!', e);
                
                return false;
            };
            
            // Also add addEventListener test
            fileTab.addEventListener('click', (e) => {
            urlForm.classList.add('hidden');
            fileForm.classList.remove('hidden');
            urlTab.classList.remove('bg-white', 'dark:bg-gray-700', 'shadow-sm');
            urlTab.classList.add('hover:text-gray-700', 'dark:hover:text-gray-200');
            fileTab.classList.add('bg-white', 'dark:bg-gray-700', 'shadow-sm');
            fileTab.classList.remove('hover:text-gray-700', 'dark:hover:text-gray-200');
        });
            
            console.log('✅ Click handlers added to file tab');
        } else {
            console.log('❌ File tab still not found after 1 second');
        }
    }, 1000);
    
    // Initialize paste enhancer
    const pasteEnhancer = new URLPasteEnhancer(document.getElementById('url-input'));
    
    // Auto-focus
    document.getElementById('url-input').focus();
    
    console.log('%c✅ AutoLlama Ready', 'color: #4CAF50; font-size: 16px; font-weight: bold');
    console.log(`Webhook: ${window.webhookConfig.getWebhookUrl()}`);
    console.log(`Environment: ${window.webhookConfig.getEnvironment()}`);
});

// Global error handler for debugging
window.addEventListener('error', (event) => {
    if (window.webhookDebugLogger) {
        window.webhookDebugLogger.logError('Uncaught error', {
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            error: event.error ? event.error.stack : 'No stack trace'
        });
    }
});