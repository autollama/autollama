class AutoLlamaViewManager {
    constructor() {
        this.apiBaseUrl = '/api';
        this.inProgressIntervalId = null;
        this.allRecords = [];
        this.isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        
        if (this.isSafari || this.isMobile) {
            console.log('📱 Safari/Mobile detected - using enhanced compatibility mode');
        }
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        
        const lastView = localStorage.getItem('autollama_last_view');
        this.showView(lastView || 'explore');
        this.loadRecentSubmissions();
        setInterval(() => this.loadRecentSubmissions(), 5000);
    }

    setupEventListeners() {
        document.getElementById('new-btn').addEventListener('click', () => this.showView('home'));
        document.getElementById('explore-btn-nav').addEventListener('click', () => this.showView('explore'));
        document.getElementById('documents-tab').addEventListener('click', () => this.showExploreView('documents'));
        document.getElementById('chunks-tab').addEventListener('click', () => this.showExploreView('chunks'));
        document.getElementById('queue-btn').addEventListener('click', () => this.showView('in-progress'));
        document.getElementById('settings-btn').addEventListener('click', () => this.showView('settings'));
        document.getElementById('back-btn').addEventListener('click', () => this.showView('explore'));
        document.getElementById('search-input').addEventListener('input', (e) => this.debounceSearch(e.target.value));
    }

    showView(viewName) {
        console.log(`Showing view: ${viewName}`);
        if (this.inProgressIntervalId) {
            clearInterval(this.inProgressIntervalId);
            this.inProgressIntervalId = null;
        }
        
        if (this.inProgressDetailInterval) {
            clearInterval(this.inProgressDetailInterval);
            this.inProgressDetailInterval = null;
        }

        localStorage.setItem('autollama_last_view', viewName);
        
        document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
        document.getElementById(`${viewName}-view`).classList.remove('hidden');
        
        document.querySelectorAll('.sidebar-nav-btn').forEach(btn => {
            btn.classList.remove('bg-primary-500', 'text-white');
            btn.classList.add('hover:bg-gray-200', 'dark:hover:bg-gray-800');
        });

        let activeBtnId;
        if (viewName === 'home') activeBtnId = 'new-btn';
        else if (viewName === 'explore') activeBtnId = 'explore-btn-nav';
        else if (viewName === 'in-progress') activeBtnId = 'in-progress-btn';
        else if (viewName === 'settings') activeBtnId = 'settings-btn';
        
        const activeBtn = document.getElementById(activeBtnId);
        if(activeBtn) {
            activeBtn.classList.add('bg-primary-500', 'text-white');
            activeBtn.classList.remove('hover:bg-gray-200', 'dark:hover:bg-gray-800');
        }

        if (viewName === 'explore') {
            this.showExploreView('documents');
        } else if (viewName === 'in-progress') {
            this.loadInProgressFiles();
            this.inProgressIntervalId = setInterval(() => this.loadInProgressFiles(), 2000);
        } else if (viewName === 'settings') {
            this.loadKnowledgeBaseStats();
            this.loadPipelineHealthStatus();
        } else if (viewName === 'detail') {
            // This case is now handled by showDocumentDetail and showChunkDetail directly
        }
    }

    showExploreView(tab) {
        console.log(`Showing explore tab: ${tab}`);
        const documentsTab = document.getElementById('documents-tab');
        const chunksTab = document.getElementById('chunks-tab');
        this.currentExploreTab = tab; // Store current tab

        if (tab === 'documents') {
            documentsTab.classList.add('bg-white', 'dark:bg-gray-700', 'text-gray-900', 'dark:text-white', 'shadow-sm');
            documentsTab.classList.remove('text-gray-500', 'dark:text-gray-400', 'hover:text-gray-700', 'dark:hover:text-gray-200');
            chunksTab.classList.add('text-gray-500', 'dark:text-gray-400', 'hover:text-gray-700', 'dark:hover:text-gray-200');
            chunksTab.classList.remove('bg-white', 'dark:bg-gray-700', 'text-gray-900', 'dark:text-white', 'shadow-sm');
            this.loadDocuments();
        } else {
            chunksTab.classList.add('bg-white', 'dark:bg-gray-700', 'text-gray-900', 'dark:text-white', 'shadow-sm');
            chunksTab.classList.remove('text-gray-500', 'dark:text-gray-400', 'hover:text-gray-700', 'dark:hover:text-gray-200');
            documentsTab.classList.add('text-gray-500', 'dark:text-gray-400', 'hover:text-gray-700', 'dark:hover:text-gray-200');
            documentsTab.classList.remove('bg-white', 'dark:bg-gray-700', 'text-gray-900', 'dark:text-white', 'shadow-sm');
            this.loadChunks();
        }
        // Clear search input when switching tabs
        document.getElementById('search-input').value = '';
    }

    async loadChunks() {
        console.log('Loading chunks...');
        const loadingEl = document.getElementById('search-loading');
        const exploreListEl = document.getElementById('search-list');

        loadingEl.classList.remove('hidden');
        exploreListEl.innerHTML = '';

        try {
            const response = await fetch(`${this.apiBaseUrl}/chunks?limit=50`);
            
            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }
            
            const chunks = await response.json();
            console.log('Chunks loaded:', chunks.length);
            
            this.allChunks = chunks;
            this.displayChunks(this.allChunks, exploreListEl);
        } catch (error) {
            console.error('Failed to load chunks:', error);
            exploreListEl.innerHTML = `
                <div class="text-center py-12">
                     <svg class="mx-auto h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    <h3 class="mt-2 text-sm font-semibold text-gray-900 dark:text-white">Failed to load chunks</h3>
                    <p class="mt-1 text-sm text-gray-500">${error.message}</p>
                </div>
            `;
        } finally {
            loadingEl.classList.add('hidden');
        }
    }

    displayChunks(chunks, searchListEl) {
        if (!chunks || chunks.length === 0) {
            searchListEl.innerHTML = `
                <div class="text-center py-12">
                    <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
                    <h3 class="mt-2 text-sm font-semibold text-gray-900 dark:text-white">No chunks found</h3>
                    <p class="mt-1 text-sm text-gray-500">Try submitting a new URL or file to get started.</p>
                </div>
            `;
            return;
        }

        const validChunks = chunks.filter(c => c.chunkText).sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
        const chunksHtml = validChunks.map(chunk => {
            const sentimentColor = {
                'positive': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
                'negative': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
                'neutral': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
                'mixed': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
            }[chunk.sentiment] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';

            return `
                <div class="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6 cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-[1.02]" onclick="viewManager.showChunkDetail('${chunk.id}')">
                    <div class="flex justify-between items-start mb-3">
                        <h3 class="font-semibold text-gray-900 dark:text-white text-lg line-clamp-2">Chunk ${chunk.chunkIndex + 1} from ${this.escapeHtml(chunk.title || chunk.url)}</h3>
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${sentimentColor} ml-3 flex-shrink-0">${chunk.sentiment || 'Neutral'}</span>
                    </div>
                    
                    <a href="${this.escapeHtml(chunk.url)}" target="_blank" onclick="event.stopPropagation()" class="text-primary-500 hover:text-primary-600 text-sm truncate block mb-3">${this.escapeHtml(chunk.url)}</a>
                    
                    <p class="text-gray-600 dark:text-gray-400 text-sm line-clamp-3 mb-4">${this.escapeHtml(chunk.chunkText || 'No content preview available.')}</p>
                    
                    <div class="flex flex-wrap gap-2 mb-3">
                        ${chunk.category ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">${chunk.category}</span>` : ''}
                        ${chunk.contentType ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">${chunk.contentType}</span>` : ''}
                    </div>
                    
                    <div class="flex justify-between items-center text-xs text-gray-500">
                        <span class="flex items-center">
                            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            ${this.getRelativeTime(chunk.createdTime)}
                        </span>
                        <span class="flex items-center">
                            ${chunk.embeddingStatus === 'complete' ? 
                                '<svg class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>' :
                                '<svg class="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"></path></svg>'
                            }
                        </span>
                    </div>
                </div>
            `;
        }).join('');
        searchListEl.className = 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6';
        searchListEl.innerHTML = chunksHtml;
    }

    

    async loadDocuments() {
        console.log('Loading documents...');
        const loadingEl = document.getElementById('search-loading');
        const exploreListEl = document.getElementById('search-list');

        loadingEl.classList.remove('hidden');
        exploreListEl.innerHTML = '';

        try {
            // Load documents with chunk counts (new document-centric view)
            const response = await fetch(`${this.apiBaseUrl}/documents?limit=50`);
            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }
            this.allDocuments = await response.json();
            this.displayDocuments(this.allDocuments, exploreListEl);
            
            // Clear the search input to show we're starting fresh
            const searchInput = document.getElementById('search-input');
            if (searchInput && searchInput.value.trim()) {
                // If there's already a search query, perform search
                this.performSearch(searchInput.value.trim());
            }
        } catch (error) {
            console.error('Failed to load documents:', error);
            exploreListEl.innerHTML = `
                <div class="text-center py-12">
                     <svg class="mx-auto h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                    <h3 class="mt-2 text-sm font-semibold text-gray-900 dark:text-white">Failed to load documents</h3>
                    <p class="mt-1 text-sm text-gray-500">${error.message}</p>
                </div>
            `;
        } finally {
            loadingEl.classList.add('hidden');
        }
    }

    // Debounce search to avoid too many API calls
    debounceSearch(query) {
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
        this.searchTimeout = setTimeout(() => {
            if (query.trim()) {
                this.performSearch(query.trim());
            } else {
                // Empty search - show all documents or chunks based on current tab
                const searchListEl = document.getElementById('search-list');
                if (this.currentExploreTab === 'documents') {
                    this.displayDocuments(this.allDocuments || [], searchListEl);
                } else {
                    this.displayChunks(this.allChunks || [], searchListEl);
                }
            }
        }, 300); // 300ms debounce
    }
    
    async performSearch(query) {
        if (!query || query.trim().length === 0) {
            // Empty search - show all documents or chunks based on current tab
            const searchListEl = document.getElementById('search-list');
            if (this.currentExploreTab === 'documents') {
                this.displayDocuments(this.allDocuments || [], searchListEl);
            } else {
                this.displayChunks(this.allChunks || [], searchListEl);
            }
            return;
        }
        
        const loadingEl = document.getElementById('search-loading');
        const exploreListEl = document.getElementById('search-list');
        
        try {
            loadingEl.classList.remove('hidden');
            
            console.log(`🔍 Searching for: "${query}"`);
            let response;
            if (this.currentExploreTab === 'documents') {
                response = await fetch(`${this.apiBaseUrl}/search/grouped?q=${encodeURIComponent(query)}`);
            } else {
                response = await fetch(`${this.apiBaseUrl}/search?q=${encodeURIComponent(query)}`);
            }
            
            if (!response.ok) {
                throw new Error(`Search failed: ${response.status} ${response.statusText}`);
            }
            
            const searchResults = await response.json();
            console.log(`📊 Found ${searchResults.length} results matching "${query}"`);
            
            if (this.currentExploreTab === 'documents') {
                this.displayGroupedSearchResults(searchResults);
            } else {
                this.displayChunks(searchResults, exploreListEl); // Display raw chunks for chunk search
            }
            
        } catch (error) {
            console.error('Search error:', error);
            exploreListEl.innerHTML = `
                <div class="text-center py-12">
                    <svg class="mx-auto h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                    <h3 class="mt-2 text-sm font-semibold text-gray-900 dark:text-white">Search failed</h3>
                    <p class="mt-1 text-sm text-gray-500">${error.message}</p>
                </div>
            `;
        } finally {
            loadingEl.classList.add('hidden');
        }
    }
    
    

    

    displayDocuments(documents, searchListEl) {
        if (!documents || documents.length === 0) {
            searchListEl.innerHTML = `
                <div class="text-center py-12">
                    <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
                    <h3 class="mt-2 text-sm font-semibold text-gray-900 dark:text-white">No documents found</h3>
                    <p class="mt-1 text-sm text-gray-500">Try submitting a new URL or file to get started.</p>
                </div>
            `;
            return;
        }

        const validDocuments = documents.filter(d => d.url && d.title).sort((a, b) => new Date(b.latestChunkTime) - new Date(a.latestChunkTime));
        const documentsHtml = validDocuments.map(document => {
            // Status determination
            const status = document.status || 'completed';
            const statusColor = {
                'completed': 'text-green-500',
                'processing': 'text-yellow-500',
                'failed': 'text-red-500'
            }[status] || 'text-gray-500';
            
            const statusIcon = {
                'completed': '✓',
                'processing': '⟳',
                'failed': '✗'
            }[status] || '◯';

            // Sentiment color
            const sentimentColor = {
                'positive': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
                'negative': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
                'neutral': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
            }[document.sentiment] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';

            // Progress percentage
            const progressPercent = document.progressPercent || 0;
            
            return `
                <div class="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6 transition-all duration-200">
                    <!-- Document Header (clickable) -->
                    <div class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 -m-6 p-6 rounded-lg transition-colors" onclick="viewManager.showDocumentDetail('${encodeURIComponent(document.url)}')">
                        <div class="flex justify-between items-start mb-3">
                            <div class="flex-1 min-w-0">
                                <h3 class="font-semibold text-gray-900 dark:text-white text-lg line-clamp-2 pr-4">${this.escapeHtml(document.title)}</h3>
                                <div class="flex items-center gap-3 mt-2 text-sm text-gray-600 dark:text-gray-400">
                                    <span class="flex items-center gap-1">
                                        <span class="${statusColor}">${statusIcon}</span>
                                        <span>${document.completedChunks}/${document.totalChunks} chunks</span>
                                    </span>
                                    ${progressPercent < 100 ? `<span class="text-xs">(${progressPercent}%)</span>` : ''}
                                </div>
                            </div>
                            <div class="flex items-center gap-2 flex-shrink-0">
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${sentimentColor}">${document.sentiment || 'neutral'}</span>
                                <button class="p-1 text-gray-400 hover:text-gray-600 transition-colors" onclick="event.stopPropagation(); viewManager.toggleDocumentChunks('${encodeURIComponent(document.url)}')">
                                    <svg class="w-4 h-4 transition-transform expand-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        
                        <p class="text-gray-600 dark:text-gray-400 text-sm line-clamp-2 mb-3">${this.escapeHtml(document.summary || 'No summary available.')}</p>
                        
                        <div class="flex flex-wrap gap-2 mb-3">
                            ${document.category ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">${document.category}</span>` : ''}
                            ${document.contentType ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">${document.contentType}</span>` : ''}
                        </div>

                        ${progressPercent < 100 ? `
                        <div class="mb-3">
                            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                <div class="bg-yellow-500 h-2 rounded-full transition-all duration-300" style="width: ${progressPercent}%"></div>
                            </div>
                        </div>
                        ` : ''}
                        
                        <div class="flex justify-between items-center text-xs text-gray-500">
                            <span class="flex items-center">
                                <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                                ${this.getRelativeTime(document.latestChunkTime)}
                            </span>
                            <span class="flex items-center">
                                ${document.embeddedChunks === document.totalChunks ? 
                                    '<svg class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>' :
                                    '<svg class="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"></path></svg>'
                                }
                            </span>
                        </div>
                    </div>
                    
                    <!-- Expandable Chunks Section (hidden by default) -->
                    <div class="chunks-container hidden mt-4 border-t border-gray-200 dark:border-gray-700 pt-4" id="chunks-${btoa(document.url).replace(/[+/=]/g, '')}">
                        <div class="chunk-loading hidden text-center py-4">
                            <div class="inline-flex items-center">
                                <svg class="animate-spin -ml-1 mr-3 h-4 w-4 text-primary-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Loading chunks...
                            </div>
                        </div>
                        <div class="chunk-content"></div>
                    </div>
                </div>
            `;
        }).join('');
        
        searchListEl.className = 'grid grid-cols-1 gap-4 sm:gap-6';
        searchListEl.innerHTML = documentsHtml;
    }

    displayGroupedSearchResults(exploreResults) {
        const searchListEl = document.getElementById('search-list');
        if (!exploreResults || exploreResults.length === 0) {
            searchListEl.innerHTML = `
                <div class="text-center py-12">
                    <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <h3 class="mt-2 text-sm font-semibold text-gray-900 dark:text-white">No explore results found</h3>
                    <p class="mt-1 text-sm text-gray-500">Try different explore terms or check your spelling.</p>
                </div>
            `;
            return;
        }

        const resultsHtml = exploreResults.map(result => {
            // Status determination
            const status = result.status || 'completed';
            const statusColor = {
                'completed': 'text-green-500',
                'processing': 'text-yellow-500',
                'failed': 'text-red-500'
            }[status] || 'text-gray-500';
            
            const statusIcon = {
                'completed': '✓',
                'processing': '⟳',
                'failed': '✗'
            }[status] || '◯';

            return `
                <div class="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6 transition-all duration-200">
                    <!-- Document Header -->
                    <div class="mb-4">
                        <div class="flex justify-between items-start mb-2">
                            <div class="flex-1 min-w-0">
                                <h3 class="font-semibold text-gray-900 dark:text-white text-lg line-clamp-2 pr-4">${this.escapeHtml(result.documentTitle)}</h3>
                                <div class="flex items-center gap-3 mt-1 text-sm text-gray-600 dark:text-gray-400">
                                    <span class="flex items-center gap-1">
                                        <span class="${statusColor}">${statusIcon}</span>
                                        <span>${result.matchingChunks} of ${result.totalChunks} chunks match</span>
                                    </span>
                                </div>
                            </div>
                            <button class="text-primary-500 hover:text-primary-600 text-sm font-medium" onclick="viewManager.showDocumentDetail('${encodeURIComponent(result.url)}')">
                                View all chunks →
                            </button>
                        </div>
                        <p class="text-gray-600 dark:text-gray-400 text-sm line-clamp-2 mb-3">${this.escapeHtml(result.documentSummary || 'No summary available.')}</p>
                    </div>
                    
                    <!-- Matching Chunks -->
                    <div class="space-y-3">
                        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 pb-2">
                            Matching chunks:
                        </h4>
                        ${result.chunks.slice(0, 3).map((chunk, index) => `
                            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer transition-colors" onclick="viewManager.showChunkDetail('${chunk.id}')">
                                <div class="flex justify-between items-start mb-2">
                                    <h5 class="font-medium text-gray-900 dark:text-white text-sm">${this.escapeHtml(chunk.title)}</h5>
                                    <span class="text-xs text-gray-500 ml-2">Chunk ${chunk.chunkIndex || index + 1}</span>
                                </div>
                                <p class="text-gray-600 dark:text-gray-400 text-sm line-clamp-2 mb-2">${this.escapeHtml(chunk.summary || chunk.chunkText?.substring(0, 150) + '...' || 'No content preview available.')}</p>
                                <div class="flex gap-2">
                                    ${chunk.sentiment ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">${chunk.sentiment}</span>` : ''}
                                    ${chunk.category ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-700 dark:text-blue-200">${chunk.category}</span>` : ''}
                                </div>
                            </div>
                        `).join('')}
                        
                        ${result.chunks.length > 3 ? `
                        <div class="text-center pt-2">
                            <button class="text-primary-500 hover:text-primary-600 text-sm font-medium" onclick="viewManager.showDocumentDetail('${encodeURIComponent(result.url)}')">
                                View ${result.chunks.length - 3} more matching chunks →
                            </button>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        searchListEl.className = 'grid grid-cols-1 gap-4 sm:gap-6';
        searchListEl.innerHTML = resultsHtml;
    }

    async loadInProgressFiles() {
        const inProgressListEl = document.getElementById('in-progress-list');
        const inProgressEmptyEl = document.getElementById('in-progress-empty');
        const loadingEl = document.getElementById('in-progress-loading');

        const isFirstLoad = !inProgressListEl.hasChildNodes();
        if (isFirstLoad) {
            loadingEl.classList.remove('hidden');
            inProgressListEl.innerHTML = '';
            inProgressEmptyEl.classList.add('hidden');
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/in-progress`);
            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }
            const sessions = await response.json();
            this.displayInProgressFiles(sessions);
        } catch (error) {
            console.error('Failed to load in-progress files:', error);
            inProgressListEl.innerHTML = `
                <div class="text-center py-12">
                     <svg class="mx-auto h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                    <h3 class="mt-2 text-sm font-semibold text-gray-900 dark:text-white">Failed to load in-progress files</h3>
                    <p class="mt-1 text-sm text-gray-500">${error.message}</p>
                </div>
            `;
        } finally {
            if (isFirstLoad) {
                loadingEl.classList.add('hidden');
            }
        }
    }

    displayInProgressFiles(sessions) {
        const inProgressListEl = document.getElementById('in-progress-list');
        const inProgressEmptyEl = document.getElementById('in-progress-empty');
        
        if (!sessions || sessions.length === 0) {
            inProgressEmptyEl.classList.remove('hidden');
            inProgressListEl.innerHTML = '';
            return;
        }
        
        inProgressEmptyEl.classList.add('hidden');

        sessions.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

        const sessionsHtml = sessions.map(session => {
            const completed = session.completedChunks || session.processedChunks || 0;
            const progress = session.totalChunks > 0 ? Math.round((completed / session.totalChunks) * 100) : 0;
            const timeAgo = this.getRelativeTime(session.lastActivity);
            const progressText = session.totalChunks ? `${completed}/${session.totalChunks} chunks (${progress}%)` : `${completed} chunks processed`;
            const funnyStatus = this.getFunnyStatus();

            return `
                <div class="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6 cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-[1.02]" onclick="viewManager.showInProgressDetail('${session.id}')">
                    <div class="flex justify-between items-start mb-3">
                        <h3 class="font-semibold text-gray-900 dark:text-white text-lg">${this.escapeHtml(session.filename || 'Unknown File')}</h3>
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                            Processing
                        </span>
                    </div>
                    
                    <div class="mb-4">
                        <div class="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
                            <span>Progress</span>
                            <span>${progressText}</span>
                        </div>
                        <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div class="bg-yellow-500 h-2 rounded-full transition-all duration-300 ${session.totalChunks ? '' : 'animate-pulse'}" style="width: ${session.totalChunks ? progress + '%' : '100%'}"></div>
                        </div>
                    </div>
                    
                    <div class="flex justify-between items-center text-xs text-gray-500">
                        <span class="flex items-center">
                            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            ${funnyStatus} (${timeAgo})
                        </span>
                        <span class="flex items-center">
                            <svg class="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"></path>
                            </svg>
                        </span>
                    </div>
                </div>
            `;
        }).join('');
        
        inProgressListEl.className = 'space-y-4';
        inProgressListEl.innerHTML = sessionsHtml;
    }

    async showInProgressDetail(sessionId) {
        this.showView('detail', sessionId);
        const loadingEl = document.getElementById('detail-loading');
        const contentEl = document.getElementById('detail-content');

        loadingEl.classList.remove('hidden');
        contentEl.innerHTML = '';

        try {
            // Get the session data from in-progress endpoint
            const response = await fetch(`${this.apiBaseUrl}/in-progress`);
            if (!response.ok) throw new Error(`API Error: ${response.status} ${response.statusText}`);
            
            const sessions = await response.json();
            const session = sessions.find(s => s.id === sessionId);
            
            if (!session) {
                throw new Error('Session not found');
            }
            
            // Display partial data with loading indicators
            this.displayInProgressRecord(session);
        } catch (error) {
            console.error('Failed to load in-progress detail:', error);
            contentEl.innerHTML = `<p class="text-center text-red-500">Failed to load in-progress file: ${error.message}</p>`;
        } finally {
            loadingEl.classList.add('hidden');
        }
    }

    displayInProgressRecord(session) {
        const contentEl = document.getElementById('detail-content');
        const progress = session.totalChunks > 0 ? 
            Math.round((session.processedChunks / session.totalChunks) * 100) : 0;

        contentEl.innerHTML = `
            <div class="space-y-8">
                <!-- Header with Processing Status -->
                <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center">
                            <svg class="w-5 h-5 text-yellow-600 dark:text-yellow-400 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span class="text-yellow-800 dark:text-yellow-200 font-medium">Processing in Progress</span>
                        </div>
                        <span class="text-sm text-yellow-600 dark:text-yellow-400">${progress}% Complete</span>
                    </div>
                    <div class="mt-3">
                        <div class="bg-yellow-200 dark:bg-yellow-800 rounded-full h-2 overflow-hidden">
                            <div class="bg-yellow-600 dark:bg-yellow-400 h-2 rounded-full transition-all duration-300" style="width: ${progress}%"></div>
                        </div>
                        <p class="text-sm text-yellow-700 dark:text-yellow-300 mt-2">
                            ${session.processedChunks || 0} of ${session.totalChunks || '?'} chunks processed
                        </p>
                    </div>
                </div>

                <!-- Basic Information -->
                <div>
                    <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">${this.escapeHtml(session.filename || 'Processing File')}</h1>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                            <h3 class="font-semibold text-gray-900 dark:text-white mb-2">File Information</h3>
                            <div class="space-y-2">
                                <div class="flex justify-between">
                                    <span class="text-gray-600 dark:text-gray-400">Status:</span>
                                    <span class="text-yellow-600 dark:text-yellow-400 font-medium">Processing</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-600 dark:text-gray-400">Started:</span>
                                    <span>${new Date(session.createdAt).toLocaleString()}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-600 dark:text-gray-400">Last Activity:</span>
                                    <span>${new Date(session.lastActivity).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                            <h3 class="font-semibold text-gray-900 dark:text-white mb-2">Analysis Preview</h3>
                            <div class="space-y-2">
                                <div class="flex justify-between">
                                    <span class="text-gray-600 dark:text-gray-400">Category:</span>
                                    <span class="animate-pulse bg-gray-300 dark:bg-gray-600 h-4 w-24 rounded"></span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-600 dark:text-gray-400">Sentiment:</span>
                                    <span class="animate-pulse bg-gray-300 dark:bg-gray-600 h-4 w-20 rounded"></span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-600 dark:text-gray-400">Content Type:</span>
                                    <span class="animate-pulse bg-gray-300 dark:bg-gray-600 h-4 w-28 rounded"></span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Content Preview -->
                <div>
                    <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Content Preview</h2>
                    <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
                        <div class="space-y-3">
                            <div class="animate-pulse">
                                <div class="h-4 bg-gray-300 dark:bg-gray-600 rounded w-full mb-2"></div>
                                <div class="h-4 bg-gray-300 dark:bg-gray-600 rounded w-5/6 mb-2"></div>
                                <div class="h-4 bg-gray-300 dark:bg-gray-600 rounded w-4/5 mb-2"></div>
                                <div class="h-4 bg-gray-300 dark:bg-gray-600 rounded w-full mb-2"></div>
                                <div class="h-4 bg-gray-300 dark:bg-gray-600 rounded w-3/4"></div>
                            </div>
                        </div>
                        <p class="text-sm text-gray-500 dark:text-gray-400 mt-4 text-center">
                            Content will be available once processing is complete...
                        </p>
                    </div>
                </div>

                <!-- Auto-refresh notice -->
                <div class="text-center text-sm text-gray-500 dark:text-gray-400">
                    <svg class="inline-block w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                    </svg>
                    This page will refresh automatically to show progress
                </div>
            </div>
        `;

        // Set up auto-refresh for this page
        if (this.inProgressDetailInterval) {
            clearInterval(this.inProgressDetailInterval);
        }
        this.inProgressDetailInterval = setInterval(() => {
            this.showInProgressDetail(session.id);
        }, 3000);
    }

    async showDetail(recordId) {
        console.log('showDetail called with recordId:', recordId);
        this.showView('detail', recordId);
        const loadingEl = document.getElementById('detail-loading');
        const contentEl = document.getElementById('detail-content');

        loadingEl.classList.remove('hidden');
        contentEl.innerHTML = '';

        try {
            const url = `${this.apiBaseUrl}/record?id=${recordId}`;
            console.log('Fetching record from:', url);
            const response = await fetch(url);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error response:', errorText);
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }
            
            const record = await response.json();
            console.log('Record received:', record);
            this.displayRecordDetail(Array.isArray(record) ? record[0] : record);
        } catch (error) {
            console.error('Failed to load record detail:', error);
            contentEl.innerHTML = `<p class="text-center text-red-500">Failed to load record: ${error.message}</p>`;
        } finally {
            loadingEl.classList.add('hidden');
        }
    }

    // 🦙 v2.0 UPDATED: Use unified chunk detail view
    displayRecordDetail(record) {
        console.log('🧩 displayRecordDetail - routing to unified chunk detail view');
        this.displayUnifiedChunkDetail(record);
    }

    // 🦙 v2.0 UNIFIED DOCUMENT DETAIL VIEW
    // Document-centric view with chunk browser underneath
    async displayUnifiedDocumentDetail(documentSummary, chunks = []) {
        const contentEl = document.getElementById('detail-content');
        
        // Use first chunk for additional metadata if available
        const sampleChunk = chunks[0] || {};
        
        // Calculate metrics for v2.0 showcase
        const totalChunks = documentSummary.totalChunks || chunks.length || 1;
        const completedChunks = documentSummary.completedChunks || chunks.filter(c => c.processingStatus === 'completed').length || 1;
        const progressPercent = documentSummary.progressPercent || (totalChunks > 0 ? Math.round((completedChunks / totalChunks) * 100) : 100);
        const contextualChunks = chunks.filter(c => c.uses_contextual_embedding || c.usesContextualEmbedding).length;
        const hasContextualEmbeddings = contextualChunks > 0;

        // Helper functions for rendering
        const renderTopics = (topics) => {
            if (!topics || topics.length === 0) return '<span class="text-gray-400">None identified</span>';
            return topics.map(topic => 
                `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">${topic}</span>`
            ).join(' ');
        };

        const getSentimentColor = (sentiment) => {
            const colors = {
                'Positive': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
                'Negative': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
                'Neutral': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
                'Mixed': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
            };
            return colors[sentiment] || colors['Neutral'];
        };

        contentEl.innerHTML = `
            <!-- Document Header with v2.0 Badge -->
            <div class="bg-gradient-to-r from-primary-500 to-purple-600 rounded-lg p-6 text-white mb-6 relative">
                ${hasContextualEmbeddings ? `
                <div class="absolute top-4 right-4">
                    <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-yellow-400 text-purple-900">
                        🧠 Context Llama v2.0
                    </span>
                </div>
                ` : ''}
                <h1 class="text-3xl font-bold mb-2">${this.escapeHtml(documentSummary.title || 'Document')}</h1>
                <a href="${this.escapeHtml(documentSummary.url)}" target="_blank" class="text-primary-100 hover:text-white underline text-sm break-all">${this.escapeHtml(documentSummary.url)}</a>
                <div class="flex items-center gap-4 mt-4">
                    <span class="text-primary-100 text-sm">${totalChunks} total chunks</span>
                    <span class="text-primary-100 text-sm">${completedChunks} completed</span>
                    <span class="text-primary-100 text-sm">${progressPercent}% processed</span>
                    ${hasContextualEmbeddings ? `<span class="text-primary-100 text-sm">${contextualChunks} enhanced</span>` : ''}
                </div>
                ${progressPercent < 100 ? `
                <div class="mt-4">
                    <div class="w-full bg-primary-400 rounded-full h-2">
                        <div class="bg-white h-2 rounded-full transition-all duration-300" style="width: ${progressPercent}%"></div>
                    </div>
                </div>
                ` : ''}
            </div>

            <!-- 🧠 v2.0 Context Llama Showcase (NEW!) -->
            ${hasContextualEmbeddings ? `
            <div class="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg border-2 border-purple-200 dark:border-purple-700 p-6 mb-6">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-xl font-bold text-purple-900 dark:text-purple-200 flex items-center">
                        🧠 Context Llama v2.0 Enhanced Document
                        <span class="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            +35% Better Retrieval
                        </span>
                    </h2>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <div class="bg-white dark:bg-gray-900 rounded-lg p-4 border border-purple-200 dark:border-purple-700">
                        <div class="text-sm font-medium text-purple-700 dark:text-purple-300">Enhanced Chunks</div>
                        <div class="text-2xl font-bold text-purple-900 dark:text-purple-200">${contextualChunks}/${totalChunks}</div>
                        <div class="text-xs text-purple-600 dark:text-purple-400">With contextual summaries</div>
                    </div>
                    <div class="bg-white dark:bg-gray-900 rounded-lg p-4 border border-purple-200 dark:border-purple-700">
                        <div class="text-sm font-medium text-purple-700 dark:text-purple-300">Context Model</div>
                        <div class="text-lg font-bold text-purple-900 dark:text-purple-200">GPT-4o-mini</div>
                        <div class="text-xs text-purple-600 dark:text-purple-400">Document-aware analysis</div>
                    </div>
                    <div class="bg-white dark:bg-gray-900 rounded-lg p-4 border border-purple-200 dark:border-purple-700">
                        <div class="text-sm font-medium text-purple-700 dark:text-purple-300">Vector Embeddings</div>
                        <div class="text-lg font-bold text-purple-900 dark:text-purple-200">text-embedding-3-small</div>
                        <div class="text-xs text-purple-600 dark:text-purple-400">1536 dimensions</div>
                    </div>
                    <div class="bg-white dark:bg-gray-900 rounded-lg p-4 border border-purple-200 dark:border-purple-700">
                        <div class="text-sm font-medium text-purple-700 dark:text-purple-300">Processing Cost</div>
                        <div class="text-lg font-bold text-purple-900 dark:text-purple-200">~$1.02/M</div>
                        <div class="text-xs text-purple-600 dark:text-purple-400">tokens + caching</div>
                    </div>
                </div>

                <div class="bg-purple-100 dark:bg-purple-800/30 rounded-lg p-4">
                    <h4 class="font-semibold text-purple-900 dark:text-purple-200 mb-2 flex items-center">
                        <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        Document Processing Pipeline
                    </h4>
                    <div class="text-sm text-purple-800 dark:text-purple-300 flex items-center gap-2">
                        <span>📄 Content Extraction</span>
                        <span>→</span>
                        <span>✂️ Smart Chunking</span>
                        <span>→</span>
                        <span>🧠 Context Generation</span>
                        <span>→</span>
                        <span>🧮 Enhanced Embeddings</span>
                        <span>→</span>
                        <span>💾 Dual Storage</span>
                    </div>
                </div>
            </div>
            ` : `
            <!-- Legacy Processing Badge -->
            <div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 mb-6 text-center">
                <span class="text-sm text-gray-600 dark:text-gray-400">
                    📄 Processed with standard embeddings • 
                    <a href="#" class="text-primary-500 hover:text-primary-600 underline">Upgrade to Context Llama v2.0</a>
                </span>
            </div>
            `}

            <!-- Document Summary & Metadata -->
            <div class="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6 mb-6">
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">Document Summary</h2>
                <p class="text-gray-700 dark:text-gray-300 leading-relaxed mb-6">${this.escapeHtml(documentSummary.summary || 'No summary available.')}</p>
                
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="text-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <div class="text-2xl font-bold text-gray-900 dark:text-white">${documentSummary.category || sampleChunk.category || 'General'}</div>
                        <div class="text-sm text-gray-500">Category</div>
                    </div>
                    <div class="text-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <div class="text-2xl font-bold text-gray-900 dark:text-white">${documentSummary.contentType || sampleChunk.contentType || 'Article'}</div>
                        <div class="text-sm text-gray-500">Content Type</div>
                    </div>
                    <div class="text-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <span class="inline-flex items-center px-3 py-1 rounded-full text-lg font-medium ${getSentimentColor(documentSummary.sentiment || sampleChunk.sentiment)}">${documentSummary.sentiment || sampleChunk.sentiment || 'Neutral'}</span>
                        <div class="text-sm text-gray-500 mt-2">Overall Sentiment</div>
                    </div>
                </div>
            </div>

            <!-- Main Topics (if available) -->
            ${(sampleChunk.mainTopics && sampleChunk.mainTopics.length > 0) ? `
            <div class="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6 mb-6">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                    <svg class="w-5 h-5 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
                    </svg>
                    Main Topics
                </h3>
                <div class="space-y-2">${renderTopics(sampleChunk.mainTopics)}</div>
            </div>
            ` : ''}

            ${this.renderChunkBrowser(chunks, totalChunks)}
        `;
    }

    // 🧩 v2.0 UNIFIED CHUNK DETAIL VIEW  
    // Chunk-centric view with document context
    async displayUnifiedChunkDetail(record) {
        const contentEl = document.getElementById('detail-content');
        
        // Check for contextual enhancements
        const hasContextualEmbeddings = record.uses_contextual_embedding || record.usesContextualEmbedding || false;
        const contextualSummary = record.contextual_summary || record.contextualSummary || null;

        // Helper functions for rendering
        const renderEmotions = (emotions) => {
            if (!emotions || emotions.length === 0) return '<span class="text-gray-400">None detected</span>';
            return emotions.map(emotion => 
                `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">${emotion}</span>`
            ).join(' ');
        };

        const renderTags = (tags) => {
            if (!tags) return '<span class="text-gray-400">None</span>';
            return tags.split(',').map(tag => 
                `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">${tag.trim()}</span>`
            ).join(' ');
        };

        const renderTopics = (topics) => {
            if (!topics || topics.length === 0) return '<span class="text-gray-400">None identified</span>';
            return topics.map(topic => 
                `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">${topic}</span>`
            ).join(' ');
        };

        const renderEntities = (entities) => {
            if (!entities || Object.keys(entities).length === 0) return '<span class="text-gray-400">None found</span>';
            let html = '';
            if (entities.people && entities.people.length > 0) {
                html += `<div class="mb-2"><strong class="text-sm text-gray-600 dark:text-gray-400">People:</strong> ${entities.people.join(', ')}</div>`;
            }
            if (entities.organizations && entities.organizations.length > 0) {
                html += `<div class="mb-2"><strong class="text-sm text-gray-600 dark:text-gray-400">Organizations:</strong> ${entities.organizations.join(', ')}</div>`;
            }
            if (entities.locations && entities.locations.length > 0) {
                html += `<div class="mb-2"><strong class="text-sm text-gray-600 dark:text-gray-400">Locations:</strong> ${entities.locations.join(', ')}</div>`;
            }
            return html || '<span class="text-gray-400">None found</span>';
        };

        const getSentimentColor = (sentiment) => {
            const colors = {
                'Positive': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
                'Negative': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
                'Neutral': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
                'Mixed': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
            };
            return colors[sentiment] || colors['Neutral'];
        };

        const getStatusColor = (status) => {
            const colors = {
                'Complete': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
                'Processing': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
                'Error': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
            };
            return colors[status] || colors['Complete'];
        };

        contentEl.innerHTML = `
            <!-- Chunk Header with Document Context -->
            <div class="bg-gradient-to-r from-green-500 to-teal-600 rounded-lg p-6 text-white mb-6 relative">
                ${hasContextualEmbeddings ? `
                <div class="absolute top-4 right-4">
                    <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-yellow-400 text-green-900">
                        🧠 Context Llama v2.0
                    </span>
                </div>
                ` : ''}
                
                <!-- Breadcrumb -->
                <div class="flex items-center text-green-100 text-sm mb-3">
                    <button onclick="viewManager.showDocumentDetail('${encodeURIComponent(record.url)}')" class="hover:text-white underline">
                        📄 ${this.escapeHtml(record.title || 'Parent Document')}
                    </button>
                    <span class="mx-2">→</span>
                    <span>🧩 Chunk ${record.chunkIndex || 1}</span>
                </div>
                
                <h1 class="text-3xl font-bold mb-2">${this.escapeHtml(record.title || `Chunk ${record.chunkIndex || 1}`)}</h1>
                <a href="${this.escapeHtml(record.url)}" target="_blank" class="text-green-100 hover:text-white underline text-sm break-all">${this.escapeHtml(record.url)}</a>
                <div class="flex items-center gap-4 mt-4">
                    <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(record.status || 'Complete')}">${record.status || 'Complete'}</span>
                    <span class="text-green-100 text-sm">${record.source || 'autollama.io'}</span>
                    <span class="text-green-100 text-sm">${new Date(record.createdTime || record.processedDate || Date.now()).toLocaleDateString()}</span>
                    <span class="text-green-100 text-sm">Chunk ${record.chunkIndex || 1}</span>
                </div>
            </div>

            <!-- 🧠 v2.0 Context Llama Showcase for Individual Chunk -->
            ${hasContextualEmbeddings ? `
            <div class="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg border-2 border-purple-200 dark:border-purple-700 p-6 mb-6">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-xl font-bold text-purple-900 dark:text-purple-200 flex items-center">
                        🧩 Context-Enhanced Chunk Analysis
                        <span class="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            v2.0 Enhanced
                        </span>
                    </h2>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div class="bg-white dark:bg-gray-900 rounded-lg p-4 border border-purple-200 dark:border-purple-700">
                        <div class="text-sm font-medium text-purple-700 dark:text-purple-300">Context Model</div>
                        <div class="text-lg font-bold text-purple-900 dark:text-purple-200">GPT-4o-mini</div>
                        <div class="text-xs text-purple-600 dark:text-purple-400">Document-aware context</div>
                    </div>
                    <div class="bg-white dark:bg-gray-900 rounded-lg p-4 border border-purple-200 dark:border-purple-700">
                        <div class="text-sm font-medium text-purple-700 dark:text-purple-300">Vector Embedding</div>
                        <div class="text-lg font-bold text-purple-900 dark:text-purple-200">text-embedding-3-small</div>
                        <div class="text-xs text-purple-600 dark:text-purple-400">Enhanced with context</div>
                    </div>
                    <div class="bg-white dark:bg-gray-900 rounded-lg p-4 border border-purple-200 dark:border-purple-700">
                        <div class="text-sm font-medium text-purple-700 dark:text-purple-300">Retrieval Boost</div>
                        <div class="text-lg font-bold text-purple-900 dark:text-purple-200">+35%</div>
                        <div class="text-xs text-purple-600 dark:text-purple-400">Better accuracy</div>
                    </div>
                </div>

                ${contextualSummary ? `
                <div class="bg-purple-100 dark:bg-purple-800/30 rounded-lg p-4">
                    <h4 class="font-semibold text-purple-900 dark:text-purple-200 mb-2 flex items-center">
                        <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        Contextual Summary
                    </h4>
                    <p class="text-sm text-purple-800 dark:text-purple-300 italic">"${this.escapeHtml(contextualSummary)}"</p>
                    <div class="text-xs text-purple-600 dark:text-purple-400 mt-2">This explains how this chunk fits within the larger document context</div>
                </div>
                ` : ''}
            </div>
            ` : `
            <!-- Legacy Processing Badge -->
            <div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 mb-6 text-center">
                <span class="text-sm text-gray-600 dark:text-gray-400">
                    🧩 Processed with standard embeddings • 
                    <a href="#" class="text-primary-500 hover:text-primary-600 underline">Upgrade to Context Llama v2.0</a>
                </span>
            </div>
            `}

            <!-- Chunk Summary -->
            <div class="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6 mb-6">
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">Chunk Summary</h2>
                <p class="text-gray-700 dark:text-gray-300 leading-relaxed">${this.escapeHtml(record.summary || 'No summary available.')}</p>
            </div>

            <!-- Metadata Grid -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6">
                <div class="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Sentiment</h3>
                        <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </div>
                    <span class="inline-flex items-center px-3 py-1 rounded-full text-lg font-medium ${getSentimentColor(record.sentiment)}">${record.sentiment || 'Neutral'}</span>
                </div>
                <div class="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Content Type</h3>
                        <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                    </div>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white capitalize">${record.contentType || 'other'}</p>
                    <p class="text-sm text-gray-500 capitalize">${record.technicalLevel || 'intermediate'} level</p>
                </div>
                <div class="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Category</h3>
                        <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
                        </svg>
                    </div>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">${record.category || 'General'}</p>
                </div>
            </div>

            <!-- Emotions and Tags Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6">
                <div class="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                        <svg class="w-5 h-5 mr-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                        </svg>
                        Emotions
                    </h3>
                    <div class="space-y-2">${renderEmotions(record.emotions)}</div>
                </div>
                <div class="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                        <svg class="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
                        </svg>
                        Tags
                    </h3>
                    <div class="space-y-2">${renderTags(record.tags)}</div>
                </div>
            </div>

            <!-- Topics and Concepts Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6">
                <div class="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                        <svg class="w-5 h-5 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
                        </svg>
                        Main Topics
                    </h3>
                    <div class="space-y-2">${renderTopics(record.mainTopics)}</div>
                </div>
                <div class="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                        <svg class="w-5 h-5 mr-2 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
                        </svg>
                        Key Concepts
                    </h3>
                    <p class="text-gray-700 dark:text-gray-300">${this.escapeHtml(record.keyConcepts || 'None identified')}</p>
                </div>
            </div>

            <!-- Key Entities -->
            <div class="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6 mb-6">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                    <svg class="w-5 h-5 mr-2 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                    </svg>
                    Key Entities
                </h3>
                <div class="text-gray-700 dark:text-gray-300">${renderEntities(record.keyEntities)}</div>
            </div>

            ${this.renderTechnicalDetails(record)}
        `;
    }

    // Chunk Browser for Document View (First 25 chunks)
    renderChunkBrowser(chunks, totalChunks) {
        const displayChunks = chunks.slice(0, 25);
        const contextualChunks = displayChunks.filter(c => c.uses_contextual_embedding || c.usesContextualEmbedding).length;
        
        return `
            <div class="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-semibold text-gray-900 dark:text-white flex items-center">
                        🔍 Chunk Browser 
                        <span class="ml-3 text-sm font-normal text-gray-500">(First 25 of ${totalChunks})</span>
                    </h2>
                    <div class="text-sm text-gray-500">
                        ${contextualChunks} enhanced with Context Llama v2.0
                    </div>
                </div>
                
                <div class="max-h-96 overflow-y-auto space-y-3 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    ${displayChunks.map((chunk, index) => `
                        <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer transition-colors" onclick="viewManager.showChunkDetail('${chunk.id}')">
                            <div class="flex justify-between items-start mb-2">
                                <h3 class="font-medium text-gray-900 dark:text-white flex items-center">
                                    ${this.escapeHtml(chunk.title || `Chunk ${chunk.chunkIndex || index + 1}`)}
                                    ${chunk.uses_contextual_embedding || chunk.usesContextualEmbedding ? 
                                        '<span class="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">🧠 v2.0</span>' : 
                                        ''
                                    }
                                </h3>
                                <div class="flex items-center gap-2 text-sm text-gray-500">
                                    <span>Chunk ${chunk.chunkIndex || index + 1}</span>
                                    ${chunk.processingStatus === 'completed' ? 
                                        '<span class="text-green-500">✓</span>' : 
                                        '<span class="text-yellow-500">⟳</span>'
                                    }
                                </div>
                            </div>
                            
                            <!-- Contextual Summary (v2.0 Feature) -->
                            ${chunk.contextual_summary || chunk.contextualSummary ? `
                            <div class="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 mb-3 border border-purple-200 dark:border-purple-700">
                                <div class="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">🧠 Context Summary</div>
                                <p class="text-sm text-purple-800 dark:text-purple-200 italic">"${this.escapeHtml(chunk.contextual_summary || chunk.contextualSummary)}"</p>
                            </div>
                            ` : ''}
                            
                            <p class="text-gray-600 dark:text-gray-400 text-sm line-clamp-3 mb-3">${this.escapeHtml(chunk.summary || chunk.chunkText?.substring(0, 200) + '...' || 'No content preview available.')}</p>
                            <div class="flex flex-wrap gap-2">
                                ${chunk.sentiment ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">${chunk.sentiment}</span>` : ''}
                                ${chunk.category ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-700 dark:text-blue-200">${chunk.category}</span>` : ''}
                                ${chunk.contentType ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-700 dark:text-purple-200">${chunk.contentType}</span>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                ${totalChunks > 25 ? `
                <div class="text-center mt-4">
                    <p class="text-gray-500 text-sm">Showing first 25 chunks. Use <strong>Explore > Chunks</strong> to search through all ${totalChunks} chunks.</p>
                </div>
                ` : ''}
            </div>
        `;
    }

    // Technical Details for Chunk View (Enhanced with v2.0 stats)
    renderTechnicalDetails(record) {
        const hasContextualEmbeddings = record.uses_contextual_embedding || record.usesContextualEmbedding || false;
        
        return `
            <div class="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
                <details class="group">
                    <summary class="text-lg font-semibold text-gray-900 dark:text-white cursor-pointer flex items-center justify-between">
                        <span class="flex items-center">
                            <svg class="w-5 h-5 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                            </svg>
                            Technical Details & Ultra-Geeky Stats
                        </span>
                        <svg class="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                    </summary>
                    <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div>
                            <dt class="font-medium text-gray-500 dark:text-gray-400">Chunk ID</dt>
                            <dd class="mt-1 text-gray-900 dark:text-gray-200 font-mono text-xs">${record.chunkId || record.id || 'N/A'}</dd>
                        </div>
                        <div>
                            <dt class="font-medium text-gray-500 dark:text-gray-400">Chunk Index</dt>
                            <dd class="mt-1 text-gray-900 dark:text-gray-200">${record.chunkIndex || 0}</dd>
                        </div>
                        <div>
                            <dt class="font-medium text-gray-500 dark:text-gray-400">Embedding Status</dt>
                            <dd class="mt-1">
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${record.embeddingStatus === 'complete' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'}">${record.embeddingStatus || 'pending'}</span>
                            </dd>
                        </div>
                        <div>
                            <dt class="font-medium text-gray-500 dark:text-gray-400">Context Enhancement</dt>
                            <dd class="mt-1">
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${hasContextualEmbeddings ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'}">${hasContextualEmbeddings ? '🧠 Context Llama v2.0' : 'Standard Processing'}</span>
                            </dd>
                        </div>
                        <div>
                            <dt class="font-medium text-gray-500 dark:text-gray-400">Processed Date</dt>
                            <dd class="mt-1 text-gray-900 dark:text-gray-200">${record.processedDate ? new Date(record.processedDate).toLocaleString() : 'N/A'}</dd>
                        </div>
                        <div>
                            <dt class="font-medium text-gray-500 dark:text-gray-400">Vector Dimensions</dt>
                            <dd class="mt-1 text-gray-900 dark:text-gray-200">1536 (text-embedding-3-small)</dd>
                        </div>
                        ${hasContextualEmbeddings ? `
                        <div>
                            <dt class="font-medium text-gray-500 dark:text-gray-400">Context Model</dt>
                            <dd class="mt-1 text-gray-900 dark:text-gray-200">GPT-4o-mini</dd>
                        </div>
                        <div>
                            <dt class="font-medium text-gray-500 dark:text-gray-400">Retrieval Improvement</dt>
                            <dd class="mt-1 text-gray-900 dark:text-gray-200">+35% accuracy</dd>
                        </div>
                        ` : ''}
                    </div>
                    
                    <!-- Qdrant Vector Database Section -->
                    <div class="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                        <h4 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                            <svg class="w-5 h-5 mr-2 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                            </svg>
                            Vector Database Storage (Qdrant)
                        </h4>
                        <div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 mb-4">
                            <p class="text-sm text-gray-700 dark:text-gray-300 mb-3">
                                This chunk is stored as a high-dimensional vector in Qdrant, enabling semantic search and similarity matching across your entire knowledge base.
                            </p>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                <div>
                                    <dt class="font-medium text-indigo-700 dark:text-indigo-300">Embedding Model</dt>
                                    <dd class="mt-1 text-gray-700 dark:text-gray-300">OpenAI text-embedding-3-small</dd>
                                </div>
                                <div>
                                    <dt class="font-medium text-indigo-700 dark:text-indigo-300">Vector Dimensions</dt>
                                    <dd class="mt-1 text-gray-700 dark:text-gray-300">1,536 floating-point values</dd>
                                </div>
                                <div>
                                    <dt class="font-medium text-indigo-700 dark:text-indigo-300">Storage Location</dt>
                                    <dd class="mt-1 text-gray-700 dark:text-gray-300">Qdrant Cloud (AWS us-west-1)</dd>
                                </div>
                                <div>
                                    <dt class="font-medium text-indigo-700 dark:text-indigo-300">Search Method</dt>
                                    <dd class="mt-1 text-gray-700 dark:text-gray-300">Cosine similarity</dd>
                                </div>
                            </div>
                        </div>
                        
                        ${hasContextualEmbeddings ? `
                        <div class="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 mb-4">
                            <h5 class="font-semibold text-purple-700 dark:text-purple-300 mb-2">🧠 Enhanced with Contextual Embeddings</h5>
                            <p class="text-sm text-gray-700 dark:text-gray-300 mb-3">
                                This chunk was processed with our v2.0 contextual embedding approach, where GPT-4o-mini generated additional context about how this chunk relates to the overall document before creating the vector embedding.
                            </p>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                <div>
                                    <dt class="font-medium text-purple-700 dark:text-purple-300">Context Generation</dt>
                                    <dd class="mt-1 text-gray-700 dark:text-gray-300">GPT-4o-mini analysis</dd>
                                </div>
                                <div>
                                    <dt class="font-medium text-purple-700 dark:text-purple-300">Retrieval Boost</dt>
                                    <dd class="mt-1 text-gray-700 dark:text-gray-300">+35% accuracy improvement</dd>
                                </div>
                                <div>
                                    <dt class="font-medium text-purple-700 dark:text-purple-300">Processing Cost</dt>
                                    <dd class="mt-1 text-gray-700 dark:text-gray-300">~$1.02 per million tokens</dd>
                                </div>
                                <div>
                                    <dt class="font-medium text-purple-700 dark:text-purple-300">Storage Format</dt>
                                    <dd class="mt-1 text-gray-700 dark:text-gray-300">Vector + contextual metadata</dd>
                                </div>
                            </div>
                        </div>
                        ` : `
                        <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 mb-4">
                            <h5 class="font-semibold text-gray-700 dark:text-gray-300 mb-2">🔧 Standard Vector Processing</h5>
                            <p class="text-sm text-gray-600 dark:text-gray-400">
                                This chunk was processed with standard embeddings. For improved retrieval accuracy, new content is processed with contextual embeddings v2.0.
                            </p>
                        </div>
                        `}
                        
                        <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                            <h5 class="font-semibold text-blue-700 dark:text-blue-300 mb-2">🔍 How Vector Search Works</h5>
                            <div class="text-sm text-gray-700 dark:text-gray-300 space-y-2">
                                <p><strong>1. Query Processing:</strong> Your search terms are converted into a 1,536-dimensional vector using the same embedding model.</p>
                                <p><strong>2. Similarity Calculation:</strong> Qdrant computes cosine similarity between your query vector and all stored chunk vectors.</p>
                                <p><strong>3. Ranking & Retrieval:</strong> Results are ranked by similarity score, with higher scores indicating more relevant content.</p>
                                <p><strong>4. Metadata Filtering:</strong> Additional filters can be applied based on categories, dates, or other chunk properties.</p>
                            </div>
                        </div>
                    </div>
                    
                    ${record.chunkText ? `
                        <div class="mt-6">
                            <dt class="font-medium text-gray-500 dark:text-gray-400 mb-2">Chunk Content</dt>
                            <dd class="mt-1 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 p-4 rounded-md text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">${this.escapeHtml(record.chunkText)}</dd>
                        </div>
                    ` : ''}
                </details>
            </div>
        `;
    }

    getFunnyStatus() {
        const statuses = [
            'Wrangling data llamas...',
            'Herding wild insights...',
            'Shearing fluffy data clouds...',
            'Llama is thinking hard...',
            'Working its llama magic...',
            'Chewing on your documents...',
            'Spitting out pure knowledge...',
            'On a magical data quest...',
            'Grooming the data fleece...',
            'Llama-nating your content...',
            'Just a little llama drama...',
            'Prepping the knowledge spitballs...'
        ];
        return statuses[Math.floor(Math.random() * statuses.length)];
    }

    getRelativeTime(dateString) {
        if (!dateString) return 'a moment ago';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'a moment ago';
        
        const now = new Date();
        const diffMs = now - date;
        const diffSecs = Math.round(diffMs / 1000);

        if (diffSecs < 10) return 'just now';
        if (diffSecs < 60) return `${diffSecs}s ago`;
        
        const diffMins = Math.round(diffSecs / 60);
        if (diffMins < 60) return `${diffMins}m ago`;
        
        const diffHours = Math.round(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        
        const diffDays = Math.round(diffHours / 24);
        if (diffDays === 1) return 'yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        
        const diffWeeks = Math.round(diffDays / 7);
        if (diffWeeks < 4) return `${diffWeeks}w ago`;
        
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        return text.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async downloadPipeline() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/pipeline/download`);
            if (!response.ok) throw new Error(`Download failed: ${response.status}`);
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'autollama_rag_pipeline.py';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Failed to download pipeline:', error);
            alert('Failed to download pipeline. Please try again.');
        }
    }

    async toggleDocumentChunks(url) {
        const containerId = `chunks-${btoa(url).replace(/[+/=]/g, '')}`;
        const container = document.getElementById(containerId);
        const button = container.parentElement.querySelector('.expand-icon');
        
        if (!container) return;
        
        if (container.classList.contains('hidden')) {
            // Show chunks
            container.classList.remove('hidden');
            button.style.transform = 'rotate(180deg)';
            
            // Load chunks if not already loaded
            if (!container.dataset.loaded) {
                await this.loadDocumentChunks(url, containerId);
            }
        } else {
            // Hide chunks
            container.classList.add('hidden');
            button.style.transform = 'rotate(0deg)';
        }
    }

    async loadDocumentChunks(url, containerId) {
        const container = document.getElementById(containerId);
        const loadingEl = container.querySelector('.chunk-loading');
        const contentEl = container.querySelector('.chunk-content');
        
        loadingEl.classList.remove('hidden');
        
        try {
            // Use the proper document chunks endpoint
            const encodedUrl = encodeURIComponent(url);
            const response = await fetch(`${this.apiBaseUrl}/document/${encodedUrl}/chunks?limit=5`);
            if (!response.ok) {
                throw new Error(`Failed to load chunks: ${response.status}`);
            }
            
            const data = await response.json();
            const chunks = data.chunks || [];
            
            if (chunks.length === 0) {
                contentEl.innerHTML = `
                    <div class="text-center py-4 text-gray-500">
                        <p>No chunks found for this document.</p>
                    </div>
                `;
            } else {
                contentEl.innerHTML = chunks.map((chunk, index) => `
                    <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-3 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer transition-colors" onclick="viewManager.showChunkDetail('${chunk.id}')">
                        <div class="flex justify-between items-start mb-2">
                            <h4 class="font-medium text-gray-900 dark:text-white text-sm">${this.escapeHtml(chunk.title)}</h4>
                            <span class="text-xs text-gray-500 ml-2">Chunk ${chunk.chunkIndex || index + 1}</span>
                        </div>
                        <p class="text-gray-600 dark:text-gray-400 text-sm line-clamp-2">${this.escapeHtml(chunk.summary || chunk.chunkText?.substring(0, 150) + '...' || 'No content preview available.')}</p>
                        <div class="flex gap-2 mt-2">
                            ${chunk.sentiment ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">${chunk.sentiment}</span>` : ''}
                            ${chunk.category ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-700 dark:text-blue-200">${chunk.category}</span>` : ''}
                        </div>
                    </div>
                `).join('');
                
                if (data.pagination && data.pagination.totalChunks > chunks.length) {
                    contentEl.innerHTML += `
                        <div class="text-center pt-2">
                            <button class="text-primary-500 hover:text-primary-600 text-sm font-medium" onclick="viewManager.showDocumentDetail('${encodeURIComponent(url)}')">
                                View all ${data.pagination.totalChunks} chunks →
                            </button>
                        </div>
                    `;
                }
            }
            
            container.dataset.loaded = 'true';
        } catch (error) {
            console.error('Failed to load document chunks:', error);
            contentEl.innerHTML = `
                <div class="text-center py-4 text-red-500">
                    <p>Failed to load chunks: ${error.message}</p>
                </div>
            `;
        } finally {
            loadingEl.classList.add('hidden');
        }
    }

    // 🦙 v2.0 UPDATED: Use unified document detail view
    async showDocumentDetail(url) {
        console.log('🔍 showDocumentDetail called with URL:', url);
        // Directly manage view visibility without relying on showView's recordId logic
        document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
        document.getElementById('detail-view').classList.remove('hidden');

        const loadingEl = document.getElementById('detail-loading');
        const contentEl = document.getElementById('detail-content');

        loadingEl.classList.remove('hidden');
        contentEl.innerHTML = '';

        try {
            // The URL is already encoded when passed to this function
            const decodedUrl = decodeURIComponent(url);
            console.log('📡 Loading document data for:', decodedUrl);
            
            // Use the already-encoded URL parameter directly
            const [summaryResponse, chunksResponse] = await Promise.all([
                fetch(`${this.apiBaseUrl}/document/${url}/summary`).then(async r => {
                    if (!r.ok) {
                        const error = await r.json();
                        console.error('Summary API error:', error);
                        return null;
                    }
                    return r.json();
                }),
                fetch(`${this.apiBaseUrl}/document/${url}/chunks?limit=25`).then(r => r.ok ? r.json() : { chunks: [] })
            ]);
            
            console.log('📊 Document summary:', summaryResponse);
            console.log('📚 Document chunks:', chunksResponse);
            
            if (!summaryResponse) {
                throw new Error('Document summary not found');
            }
            
            // 🆕 Use new unified document detail view
            this.displayUnifiedDocumentDetail(summaryResponse, chunksResponse.chunks || []);
        } catch (error) {
            console.error('Failed to load document detail:', error);
            contentEl.innerHTML = `<p class="text-center text-red-500">Failed to load document: ${error.message}</p>`;
        } finally {
            loadingEl.classList.add('hidden');
        }
    }

    // 🦙 v2.0 UPDATED: Use unified chunk detail view
    showChunkDetail(chunkId) {
        console.log('🧩 showChunkDetail called with chunkId:', chunkId);
        this.showDetail(chunkId);
    }

    displayDocumentDetailView(documentSummary, chunks) {
        const contentEl = document.getElementById('detail-content');
        
        const totalChunks = documentSummary.totalChunks || chunks.length;
        const completedChunks = documentSummary.completedChunks || chunks.filter(c => c.processingStatus === 'completed').length;
        const progressPercent = documentSummary.progressPercent || (totalChunks > 0 ? Math.round((completedChunks / totalChunks) * 100) : 100);

        contentEl.innerHTML = `
            <div class="bg-gradient-to-r from-primary-500 to-purple-600 rounded-lg p-6 text-white mb-6">
                <h1 class="text-3xl font-bold mb-2">${this.escapeHtml(documentSummary.title || 'Document')}</h1>
                <div class="text-primary-100 text-sm mb-4 break-all">${this.escapeHtml(documentSummary.url)}</div>
                <div class="flex items-center gap-4 mt-4">
                    <span class="text-primary-100 text-sm">${totalChunks} total chunks</span>
                    <span class="text-primary-100 text-sm">${completedChunks} completed</span>
                    <span class="text-primary-100 text-sm">${progressPercent}% processed</span>
                </div>
                ${progressPercent < 100 ? `
                <div class="mt-4">
                    <div class="w-full bg-primary-400 rounded-full h-2">
                        <div class="bg-white h-2 rounded-full transition-all duration-300" style="width: ${progressPercent}%"></div>
                    </div>
                </div>
                ` : ''}
            </div>

            <div class="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6 mb-6">
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">Document Summary</h2>
                <p class="text-gray-700 dark:text-gray-300 leading-relaxed">${this.escapeHtml(documentSummary.summary || 'No summary available.')}</p>
                
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                    <div class="text-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <div class="text-2xl font-bold text-gray-900 dark:text-white">${documentSummary.category || 'General'}</div>
                        <div class="text-sm text-gray-500">Category</div>
                    </div>
                    <div class="text-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <div class="text-2xl font-bold text-gray-900 dark:text-white">${documentSummary.contentType || 'Article'}</div>
                        <div class="text-sm text-gray-500">Content Type</div>
                    </div>
                    <div class="text-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <div class="text-2xl font-bold text-gray-900 dark:text-white capitalize">${documentSummary.sentiment || 'Neutral'}</div>
                        <div class="text-sm text-gray-500">Overall Sentiment</div>
                    </div>
                </div>
            </div>

            <div class="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-semibold text-gray-900 dark:text-white">All Chunks (${totalChunks})</h2>
                    <div class="text-sm text-gray-500">
                        Showing ${Math.min(chunks.length, 20)} of ${totalChunks} chunks
                    </div>
                </div>
                
                <div class="space-y-4">
                    ${chunks.slice(0, 20).map((chunk, index) => `
                        <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer transition-colors" onclick="viewManager.showChunkDetail('${chunk.id}')">
                            <div class="flex justify-between items-start mb-2">
                                <h3 class="font-medium text-gray-900 dark:text-white">${this.escapeHtml(chunk.title)}</h3>
                                <div class="flex items-center gap-2 text-sm text-gray-500">
                                    <span>Chunk ${chunk.chunkIndex || index + 1}</span>
                                    ${chunk.processingStatus === 'completed' ? 
                                        '<span class="text-green-500">✓</span>' : 
                                        '<span class="text-yellow-500">⟳</span>'
                                    }
                                </div>
                            </div>
                            <p class="text-gray-600 dark:text-gray-400 text-sm line-clamp-3 mb-3">${this.escapeHtml(chunk.summary || chunk.chunkText?.substring(0, 200) + '...' || 'No content preview available.')}</p>
                            <div class="flex flex-wrap gap-2">
                                ${chunk.sentiment ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">${chunk.sentiment}</span>` : ''}
                                ${chunk.category ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-700 dark:text-blue-200">${chunk.category}</span>` : ''}
                                ${chunk.contentType ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-700 dark:text-purple-200">${chunk.contentType}</span>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                ${totalChunks > 20 ? `
                <div class="text-center mt-6">
                    <p class="text-gray-500 text-sm">Showing first 20 chunks. Use explore to find specific content within this document.</p>
                </div>
                ` : ''}
            </div>
        `;
    }

    async loadKnowledgeBaseStats() {
        const statsEl = document.getElementById('knowledge-base-stats');
        if (!statsEl) return;

        try {
            const response = await fetch(`${this.apiBaseUrl}/knowledge-base/stats`);
            const stats = await response.json();

            if (response.ok && stats.success) {
                statsEl.innerHTML = `
                    <div class="flex items-center gap-2 mb-2">
                        <div class="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span><strong>${stats.totalPoints}</strong> content chunks ready for explore</span>
                    </div>
                    <div class="flex items-center gap-2 mb-2">
                        <div class="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <span><strong>${stats.uniqueUrls}</strong> unique URLs processed</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="w-2 h-2 bg-purple-500 rounded-full"></div>
                        <span>Vector database: <strong>Active</strong></span>
                    </div>
                `;
            } else {
                throw new Error(stats.error || 'Failed to load stats');
            }
        } catch (error) {
            console.error('Failed to load knowledge base stats:', error);
            statsEl.innerHTML = `
                <div class="flex items-center gap-2 mb-2">
                    <div class="w-2 h-2 bg-yellow-500 rounded-full"></div>
                    <span>Unable to connect to vector database</span>
                </div>
                <div class="text-xs text-gray-500 mt-2">
                    Check your Qdrant configuration
                </div>
            `;
        }
    }

    async loadPipelineHealthStatus() {
        const statusIndicator = document.getElementById('pipeline-status-indicator');
        const statusText = document.getElementById('pipeline-status-text');
        
        if (!statusIndicator || !statusText) return;

        try {
            const response = await fetch(`${this.apiBaseUrl}/pipeline/health`);
            const health = await response.json();

            if (health.success && health.status === 'healthy') {
                statusIndicator.className = 'w-3 h-3 bg-green-500 rounded-full';
                statusText.textContent = 'AutoLlama RAG Pipeline: Active and healthy';
            } else if (health.success && health.status === 'unhealthy') {
                statusIndicator.className = 'w-3 h-3 bg-yellow-500 rounded-full';
                statusText.textContent = 'AutoLlama RAG Pipeline: Service responding but unhealthy';
            } else {
                statusIndicator.className = 'w-3 h-3 bg-red-500 rounded-full';
                statusText.textContent = 'AutoLlama RAG Pipeline: Service unavailable';
            }
        } catch (error) {
            console.error('Failed to check pipeline health:', error);
            statusIndicator.className = 'w-3 h-3 bg-red-500 rounded-full';
            statusText.textContent = 'AutoLlama RAG Pipeline: Health check failed';
        }

        setTimeout(() => this.loadPipelineHealthStatus(), 30000);
    }

    async loadRecentSubmissions() {
        try {
            console.log('📱 Loading recent submissions...');
            
            // Show loading state
            this.showLoadingState();
            
            // Fetch both completed records and in-progress sessions with timeout for mobile
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            const [recordsResponse, sessionsResponse] = await Promise.all([
                fetch(`${this.apiBaseUrl}/recent-records`, { 
                    signal: controller.signal,
                    cache: 'no-store', // Prevent Safari caching issues
                    headers: {
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Pragma': 'no-cache',
                        'Expires': '0'
                    }
                }),
                fetch(`${this.apiBaseUrl}/in-progress`, { 
                    signal: controller.signal,
                    cache: 'no-store', // Prevent Safari caching issues
                    headers: {
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Pragma': 'no-cache', 
                        'Expires': '0'
                    }
                })
            ]);
            
            clearTimeout(timeoutId);

            if (!recordsResponse.ok) {
                throw new Error(`Records API Error: ${recordsResponse.status} ${recordsResponse.statusText}`);
            }

            const records = await recordsResponse.json();
            let sessions = [];
            
            console.log(`📱 Loaded ${records.length} records`);
            
            // In-progress API might fail, but we should still show completed records
            if (sessionsResponse.ok) {
                sessions = await sessionsResponse.json();
                console.log(`📱 Loaded ${sessions.length} sessions`);
            } else {
                console.warn('📱 Sessions API failed, continuing with records only');
            }

            // 🦙 v2.0: Separate and transform the data
            const separatedData = this.combineRecordsAndSessions(records, sessions);
            this.displayRecentSubmissions(separatedData);
            console.log('📱 Display completed successfully');
            
        } catch (error) {
            console.error('📱 Failed to load recent submissions:', error);
            this.showErrorState(error);
        }
    }

    // 🦙 v2.0 ENHANCED: Separate documents from chunks with smart grouping
    combineRecordsAndSessions(records, sessions) {
        const documents = new Map(); // URL -> document summary
        const chunks = [];

        // Process completed records - all are individual chunks, group them by URL for documents
        records.forEach(record => {
            const isComplete = record.embeddingStatus === 'complete' || 
                             record.embedding_status === 'complete' ||
                             record.processingStatus === 'completed';
            
            // Add to individual chunks list (all records are chunks)
            chunks.push({
                ...record,
                type: 'chunk',
                isPending: false,
                isComplete: isComplete,
                displayTitle: record.title ? `${record.title} (Chunk ${record.chunkIndex || 1})` : `Chunk ${record.chunkIndex || 1}`,
                clickHandler: () => {
                    console.log('Clicked chunk:', record.id, record.title);
                    this.showDetail(record.id);
                },
                createdTime: record.createdTime || record.processedDate
            });

            // Also group chunks by URL to create document entries
            const url = record.url;
            if (!documents.has(url)) {
                // Create document entry from first chunk of this URL
                documents.set(url, {
                    id: `doc-${url}`,  // Synthetic document ID
                    title: record.title || 'Untitled Document',
                    url: record.url,
                    type: 'document',
                    isPending: false,
                    isComplete: isComplete,
                    displayTitle: record.title || 'Untitled Document',
                    chunkCount: 1,
                    clickHandler: () => {
                        console.log('Clicked document:', record.url, record.title);
                        this.showDocumentDetail(encodeURIComponent(record.url));
                    },
                    createdTime: record.createdTime || record.processedDate,
                    // Copy metadata from the chunk for document display
                    category: record.category,
                    contentType: record.contentType,
                    sentiment: record.sentiment,
                    source: record.source
                });
            } else {
                // Update existing document entry
                const doc = documents.get(url);
                doc.chunkCount = (doc.chunkCount || 1) + 1;
                // Document is only complete if ALL chunks are complete
                doc.isComplete = doc.isComplete && isComplete;
                // Update to latest creation time
                if (new Date(record.createdTime || record.processedDate) > new Date(doc.createdTime)) {
                    doc.createdTime = record.createdTime || record.processedDate;
                }
            }
        });

        // Process in-progress sessions
        sessions.forEach(session => {
            const url = session.url;
            if (documents.has(url)) {
                // Update existing document to show it's processing
                const doc = documents.get(url);
                doc.isPending = true;
                doc.isComplete = false;
                doc.displayTitle = session.title || session.filename || doc.displayTitle;
            } else {
                // New processing document
                documents.set(url, {
                    id: session.id,
                    title: session.title || session.filename || 'Processing...',
                    url: session.url,
                    type: 'document',
                    isPending: true,
                    isComplete: false,
                    displayTitle: session.title || session.filename || 'Processing...',
                    chunkCount: session.totalChunks || 1,
                    clickHandler: () => this.showInProgressDetail(session.id),
                    createdTime: session.createdAt || session.lastActivity
                });
            }
        });

        // Convert documents map to array and combine with chunks
        const documentArray = Array.from(documents.values());
        
        // Sort each type by creation time (newest first)
        documentArray.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
        chunks.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));

        return { documents: documentArray, chunks };
    }

    // 🦙 v2.0 ENHANCED: Display separated documents and chunks with color coding
    displayRecentSubmissions(data) {
        const recentSubmissionsContainer = document.getElementById('recent-submissions-container');
        recentSubmissionsContainer.innerHTML = '';

        const { documents, chunks } = data;

        // Group documents and chunks by time
        const groupedDocuments = this.groupRecordsByTime(documents);
        const groupedChunks = this.groupRecordsByTime(chunks);

        // Helper function to create section
        const createSection = (title, icon, groupedItems, isDocument = false) => {
            if (Object.keys(groupedItems).some(group => groupedItems[group].length > 0)) {
                // Section header
                const sectionHeaderEl = document.createElement('div');
                sectionHeaderEl.innerHTML = `
                    <h3 class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-3 mt-6 mb-3 flex items-center">
                        ${icon} ${title}
                    </h3>
                `;
                recentSubmissionsContainer.appendChild(sectionHeaderEl);

                // Time groups within section
                for (const group in groupedItems) {
                    if (groupedItems[group].length > 0) {
                        const groupEl = document.createElement('div');
                        groupEl.innerHTML = `<h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mt-4 mb-2">${group}</h4>`;
                        const listEl = document.createElement('div');
                        listEl.className = 'space-y-1';
                        
                        groupedItems[group].forEach(record => {
                            // Color coding: Documents = purple/yellow, Chunks = green
                            let statusColor;
                            if (isDocument) {
                                statusColor = record.isPending ? 'bg-yellow-500' : 'bg-purple-500';
                            } else {
                                statusColor = 'bg-green-500'; // Chunks are always green (available)
                            }
                            
                            const itemEl = document.createElement('button');
                            itemEl.className = 'w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors';
                            
                            // Use the clickHandler from the record data
                            itemEl.onclick = (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                record.clickHandler();
                            };
                            
                            // Enhanced display with chunk count for documents
                            const extraInfo = isDocument && record.chunkCount > 1 ? 
                                `<span class="text-xs text-gray-500 ml-auto">${record.chunkCount} chunks</span>` : '';
                            
                            itemEl.innerHTML = `
                                <span class="w-2 h-2 ${statusColor} rounded-full flex-shrink-0"></span>
                                <span class="text-sm font-medium truncate flex-1">${this.escapeHtml(record.displayTitle)}</span>
                                ${extraInfo}
                            `;
                            listEl.appendChild(itemEl);
                        });

                        groupEl.appendChild(listEl);
                        recentSubmissionsContainer.appendChild(groupEl);
                    }
                }
            }
        };

        // Create sections with proper icons and color coding
        createSection('Documents', '📄', groupedDocuments, true);
        
        // Add divider between documents and chunks if both have content
        if (Object.keys(groupedDocuments).some(g => groupedDocuments[g].length > 0) && 
            Object.keys(groupedChunks).some(g => groupedChunks[g].length > 0)) {
            const dividerEl = document.createElement('div');
            dividerEl.innerHTML = `<hr class="my-4 border-gray-200 dark:border-gray-700">`;
            recentSubmissionsContainer.appendChild(dividerEl);
        }
        
        createSection('Chunks', '🧩', groupedChunks, false);

        // If no content at all, show friendly message
        if (documents.length === 0 && chunks.length === 0) {
            recentSubmissionsContainer.innerHTML = `
                <div class="text-center text-gray-500 dark:text-gray-400 py-8">
                    <div class="text-4xl mb-2">🦙</div>
                    <p class="text-sm">No content processed yet.</p>
                    <p class="text-xs">Start by submitting a URL or file!</p>
                </div>
            `;
        }
    }

    groupRecordsByTime(records) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const lastWeek = new Date(today);
        lastWeek.setDate(lastWeek.getDate() - 7);
        const last30Days = new Date(today);
        last30Days.setDate(last30Days.getDate() - 30);

        const groups = {
            Today: [],
            Yesterday: [],
            'Last Week': [],
            'Previous 30 Days': [],
            Older: []
        };

        records.forEach(record => {
            const recordDate = new Date(record.createdTime);
            if (recordDate >= today) {
                groups.Today.push(record);
            } else if (recordDate >= yesterday) {
                groups.Yesterday.push(record);
            } else if (recordDate >= lastWeek) {
                groups['Last Week'].push(record);
            } else if (recordDate >= last30Days) {
                groups['Previous 30 Days'].push(record);
            } else {
                groups.Older.push(record);
            }
        });

        return groups;
    }

    // 📱 Mobile Safari Compatibility: Loading and Error States
    showLoadingState() {
        const recentSubmissionsContainer = document.getElementById('recent-submissions-container');
        const searchList = document.getElementById('search-list');
        const searchLoading = document.getElementById('search-loading');
        
        // Show loading in sidebar
        if (recentSubmissionsContainer) {
            recentSubmissionsContainer.innerHTML = `
                <div class="flex items-center justify-center py-8">
                    <div class="text-center">
                        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto mb-4"></div>
                        <p class="text-sm text-gray-500 dark:text-gray-400">Loading your content...</p>
                    </div>
                </div>
            `;
        }
        
        // Show loading in main search area if visible
        if (searchLoading && !searchLoading.classList.contains('hidden')) {
            searchLoading.style.display = 'block';
        }
        
        if (searchList) {
            searchList.innerHTML = '';
        }
    }

    showErrorState(error) {
        const recentSubmissionsContainer = document.getElementById('recent-submissions-container');
        const searchList = document.getElementById('search-list');
        const searchLoading = document.getElementById('search-loading');
        
        // Hide loading indicators
        if (searchLoading) {
            searchLoading.style.display = 'none';
        }
        
        const errorMessage = error.name === 'AbortError' ? 
            'Request timed out. Please check your connection.' :
            `Failed to load content: ${error.message}`;
        
        const errorHtml = `
            <div class="flex items-center justify-center py-8">
                <div class="text-center max-w-sm">
                    <svg class="mx-auto h-12 w-12 text-red-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                    </svg>
                    <h3 class="text-sm font-medium text-gray-900 dark:text-white mb-2">Connection Issue</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">${errorMessage}</p>
                    <button onclick="window.viewManager.loadRecentSubmissions()" class="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                        </svg>
                        Retry
                    </button>
                </div>
            </div>
        `;
        
        // Show error in sidebar
        if (recentSubmissionsContainer) {
            recentSubmissionsContainer.innerHTML = errorHtml;
        }
        
        // Show error in main search area if no sidebar content
        if (searchList && (!recentSubmissionsContainer || recentSubmissionsContainer.innerHTML === '')) {
            searchList.innerHTML = errorHtml;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.viewManager = new AutoLlamaViewManager();
});
