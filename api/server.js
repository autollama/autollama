const express = require('express');
const axios = require('axios');
const https = require('https');
const TurndownService = require('turndown');
const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
const cheerio = require('cheerio');
const pdfParse = require('pdf-parse');
const Busboy = require('busboy');
const connectBusboy = require('connect-busboy');
const mammoth = require('mammoth');
const epub = require('epub');
const { parse: csvParse } = require('csv-parse');
const tmp = require('tmp');
const WebSocket = require('ws');


// Import the new PostgreSQL database layer
const db = require('./database');

// Import new service container for complete architecture
const { initializeServices } = require('./src/services');

// Initialize new service container (replaces legacy AI and storage services)
let services = null;

// Memory monitoring and optimization
const memoryMonitor = {
    startTime: Date.now(),
    initialMemory: process.memoryUsage(),
    peakMemory: { rss: 0, heapUsed: 0, heapTotal: 0, external: 0 },
    lastGC: Date.now(),
    
    getStats() {
        const current = process.memoryUsage();
        const uptime = Date.now() - this.startTime;
        
        // Track peak usage
        if (current.rss > this.peakMemory.rss) this.peakMemory.rss = current.rss;
        if (current.heapUsed > this.peakMemory.heapUsed) this.peakMemory.heapUsed = current.heapUsed;
        if (current.heapTotal > this.peakMemory.heapTotal) this.peakMemory.heapTotal = current.heapTotal;
        if (current.external > this.peakMemory.external) this.peakMemory.external = current.external;
        
        return {
            current: {
                rss: Math.round(current.rss / 1024 / 1024) + 'MB',
                heapUsed: Math.round(current.heapUsed / 1024 / 1024) + 'MB',
                heapTotal: Math.round(current.heapTotal / 1024 / 1024) + 'MB',
                external: Math.round(current.external / 1024 / 1024) + 'MB'
            },
            peak: {
                rss: Math.round(this.peakMemory.rss / 1024 / 1024) + 'MB',
                heapUsed: Math.round(this.peakMemory.heapUsed / 1024 / 1024) + 'MB',
                heapTotal: Math.round(this.peakMemory.heapTotal / 1024 / 1024) + 'MB',
                external: Math.round(this.peakMemory.external / 1024 / 1024) + 'MB'
            },
            uptime: Math.round(uptime / 1000 / 60) + 'm',
            timeSinceLastGC: Date.now() - this.lastGC
        };
    },
    
    forceGC() {
        if (global.gc) {
            global.gc();
            this.lastGC = Date.now();
            console.log('🧹 Forced garbage collection completed');
            return true;
        }
        return false;
    },
    
    checkMemoryPressure() {
        const current = process.memoryUsage();
        const memoryPressure = current.heapUsed / current.heapTotal;
        
        if (memoryPressure > 0.85) { // 85% heap usage
            console.warn('⚠️ High memory pressure detected:', {
                pressure: Math.round(memoryPressure * 100) + '%',
                heapUsed: Math.round(current.heapUsed / 1024 / 1024) + 'MB',
                heapTotal: Math.round(current.heapTotal / 1024 / 1024) + 'MB'
            });
            return 'high';
        } else if (memoryPressure > 0.7) { // 70% heap usage
            return 'moderate';
        }
        return 'low';
    }
};

// Periodic memory monitoring (every 5 minutes)
setInterval(() => {
    const pressure = memoryMonitor.checkMemoryPressure();
    const stats = memoryMonitor.getStats();
    
    if (pressure === 'high') {
        console.log('📊 Memory Stats (HIGH PRESSURE):', stats);
        memoryMonitor.forceGC(); // Force GC under high pressure
    } else if (pressure === 'moderate') {
        console.log('📊 Memory Stats (MODERATE):', stats.current);
    }
    // Only log during high/moderate pressure to reduce noise
}, 300000); // 5 minutes

const app = express();
const PORT = process.env.PORT || 3001;
const WS_PORT = parseInt(process.env.WS_PORT || '3003');

console.log('🚀 AutoLlama API server starting up with new CORS middleware...');

// Import new route system for gradual migration - PARTIAL ENABLE FOR SSE
const { setupRoutes } = require('./src/routes');
let routesEnabled = true;

// Import new CORS middleware system
const { createCorsMiddleware, routeSpecificCors } = require('./src/middleware/cors.middleware');

// Apply new CORS middleware with EventSource/SSE support
app.use(createCorsMiddleware({
  // Use streaming-specific CORS config for EventSource compatibility
  ...routeSpecificCors.streaming,
  origin: '*', // Allow all origins for development
  credentials: false,
  allowedHeaders: '*' // Allow all headers for EventSource
}));

// Configure express.json to only process application/json, not multipart/form-data
app.use(express.json({ 
  type: ['application/json', 'text/json']
}));
// Removed global connect-busboy middleware to prevent conflicts with manual busboy setup in upload endpoints

// Use existing WebSocket/SSE infrastructure instead of better-sse
console.log('Using existing SSE infrastructure (Node 18 compatible)');

// BullMQ requires Redis - using direct processing for now
console.log('Using direct processing (no Redis dependency)');

// WebSocket server variables
let wss;
const connectedClients = new Set();

// RAG activity tracking with Qdrant telemetry
let lastRagActivity = null;
let lastQdrantSearchCount = null;

// Function to get actual Qdrant search activity from telemetry
async function getQdrantSearchActivity() {
    try {
        const response = await axios.get(`${QDRANT_URL}/telemetry`, {
            headers: {
                'api-key': QDRANT_API_KEY
            },
            timeout: 5000
        });
        
        const telemetry = response.data.result;
        const restResponses = telemetry.requests?.rest?.responses || {};
        
        // Track search and query endpoints that indicate RAG activity
        const searchEndpoints = [
            'POST /collections/{name}/points/search',
            'POST /collections/{name}/points/query'
        ];
        
        let totalSearches = 0;
        let lastSearchActivity = null;
        
        for (const endpoint of searchEndpoints) {
            const endpointData = restResponses[endpoint];
            if (endpointData && endpointData['200']) {
                totalSearches += endpointData['200'].count || 0;
            }
        }
        
        // If search count increased, update activity timestamp
        if (lastQdrantSearchCount !== null && totalSearches > lastQdrantSearchCount) {
            lastSearchActivity = new Date();
        }
        
        lastQdrantSearchCount = totalSearches;
        
        return {
            totalSearches,
            lastSearchActivity,
            telemetryTimestamp: new Date(),
            qdrantStatus: 'active'
        };
        
    } catch (error) {
        console.error('❌ Error fetching Qdrant telemetry:', error.message);
        return {
            totalSearches: 0,
            lastSearchActivity: null,
            telemetryTimestamp: new Date(),
            qdrantStatus: 'error',
            error: error.message
        };
    }
}

// Function to initialize WebSocket server
function initializeWebSocket() {
    console.log(`🔌 Attempting to start WebSocket server on port ${WS_PORT}`);
    
    try {
        wss = new WebSocket.Server({ port: WS_PORT });
        console.log(`✅ WebSocket server started successfully on port ${WS_PORT}`);
        
        wss.on('connection', (ws) => {
            console.log('New WebSocket client connected');
            connectedClients.add(ws);
            
            // Send initial connection confirmation
            ws.send(JSON.stringify({
                type: 'connection',
                status: 'connected',
                timestamp: new Date().toISOString()
            }));
            
            ws.on('close', () => {
                console.log('WebSocket client disconnected');
                connectedClients.delete(ws);
            });
            
            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
                connectedClients.delete(ws);
            });
        });
        
        return true;
    } catch (error) {
        console.error(`❌ Failed to start WebSocket server on port ${WS_PORT}:`, error);
        return false;
    }
}

// Function to broadcast pipeline updates to all connected WebSocket clients
function broadcastPipelineUpdate(updateData) {
    if (!wss) return;
    
    const message = JSON.stringify({
        type: 'pipeline_update',
        data: updateData,
        timestamp: new Date().toISOString()
    });
    
    connectedClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
            } catch (error) {
                console.error('Failed to send WebSocket message:', error);
                connectedClients.delete(client);
            }
        }
    });
}

// BM25 Service Integration
const BM25_SERVICE_URL = 'http://localhost:3002';

async function storeBM25Index(chunks, filename) {
    // Use new storage services if available, fallback to original implementation
    if (storageServices && storageServices.bm25Service) {
        try {
            return await storageServices.bm25Service.storeBM25Index(chunks, filename);
        } catch (error) {
            console.warn('New BM25 service failed, falling back to original:', error.message);
        }
    }

    // Original implementation as fallback
    try {
        
        // Prepare chunks for BM25 service
        const bm25Chunks = chunks.map(chunk => ({
            id: chunk.chunk_id,
            text: chunk.chunk_text,
            metadata: {
                chunk_index: chunk.chunk_index,
                url: chunk.original_url,
                title: chunk.title || ''
            }
        }));
        
        const response = await axios.post(`${BM25_SERVICE_URL}/index/${encodeURIComponent(filename)}`, {
            chunks: bm25Chunks,
            filename: filename,
            replace_existing: true
        });
        
        console.log(`✅ BM25 index created: ${response.data.chunks} chunks indexed in ${response.data.processing_time_seconds}s`);
        return response.data;
        
    } catch (error) {
        console.error('❌ BM25 indexing failed:', error.message);
        throw new Error(`BM25 indexing failed: ${error.message}`);
    }
}

// Initialize services
const turndownService = new TurndownService();
// Initialize OpenAI client - API key must be provided via environment variable
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// This will be reassigned when configuration is loaded from database
let openaiClient = openai;

// Configuration
// Airtable configuration removed - system now uses PostgreSQL database exclusively
const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;

// Contextual Embeddings Configuration
const ENABLE_CONTEXTUAL_EMBEDDINGS = process.env.ENABLE_CONTEXTUAL_EMBEDDINGS === 'true';
const CONTEXTUAL_EMBEDDING_MODEL = process.env.CONTEXTUAL_EMBEDDING_MODEL || 'gpt-4o-mini';
const CONTEXT_GENERATION_BATCH_SIZE = parseInt(process.env.CONTEXT_GENERATION_BATCH_SIZE || '5');

// Dynamic configuration loading from database
async function initializeApiConfiguration() {
    try {
        console.log('🔧 Initializing API configuration from database...');
        const dbSettings = await db.getApiSettings();
        
        // Check if we have a valid OpenAI API key in database
        const dbOpenAIKey = dbSettings.openai_api_key;
        if (dbOpenAIKey && dbOpenAIKey.trim() !== '' && dbOpenAIKey !== 'your_openai_api_key_here') {
            console.log('✅ Found OpenAI API key in database, reinitializing client...');
            
            // Reinitialize OpenAI client with environment key
            const { OpenAI } = require('openai');
            openaiClient = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });
            
            console.log('✅ OpenAI client successfully initialized with database settings');
            return true;
        } else {
            console.log('⚠️ No valid OpenAI API key found in database');
            if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
                console.log('❌ No valid OpenAI API key in environment either - service will have limited functionality');
                return false;
            } else {
                console.log('✅ Using OpenAI API key from environment variables');
                return true;
            }
        }
    } catch (error) {
        console.error('❌ Error initializing API configuration:', error.message);
        return false;
    }
}

// In-memory tracking for active processing sessions
const activeProcessingSessions = new Map();
// Make activeProcessingSessions available globally for new route system
global.activeProcessingSessions = activeProcessingSessions;

// Simple cache for Airtable records
const recordsCache = {
    data: null,
    timestamp: null,
    ttl: 3600000 // 1 hour cache
};

// User agents for rotation
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
];

// Legacy processing functions removed - functionality moved to ContentProcessor service

// Helper function to generate document summary
async function generateDocumentSummary(content, url) {
    // Use new AI services if available, fallback to original implementation
    if (aiServices && aiServices.analysisService) {
        try {
            return await aiServices.analysisService.generateDocumentSummary(content, {
                maxTokens: 150,
                temperature: 0.5,
                maxContentLength: 2000
            });
        } catch (error) {
            console.warn('New summary service failed, falling back to original:', error.message);
        }
    }

    // Original implementation as fallback
    try {
        // Use first 2000 characters for summary generation
        const preview = content.substring(0, 2000);
        
        const response = await openaiClient.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "Generate a concise 2-3 sentence summary of this document."
                },
                {
                    role: "user",
                    content: preview
                }
            ],
            temperature: 0.5,
            max_tokens: 150
        });
        
        return response.choices[0].message.content.trim();
    } catch (error) {
        console.error('Error generating document summary:', error);
        return 'Document summary unavailable';
    }
}

async function fetchWebContent(url, retryCount = 0) {
    console.log(`[1/3] Fetching content from: ${url}`);
    const maxRetries = 2;
    const userAgent = USER_AGENTS[retryCount % USER_AGENTS.length];
    
    try {
        // Add random delay to appear more human-like
        if (retryCount > 0) {
            await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
        }
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                'Connection': 'keep-alive'
            },
            timeout: 30000,
            responseType: 'arraybuffer',  // Get response as buffer to handle both HTML and PDF
            httpsAgent: new https.Agent({
                rejectUnauthorized: false  // Allow self-signed certificates for academic/research sites
            })
        });
        
        console.log('✅ Fetch successful. Status:', response.status);
        const contentType = response.headers['content-type'] || '';
        
        // Check if it's a PDF
        if (contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
            console.log('Detected PDF content, extracting text...');
            const pdfData = await pdfParse(response.data);
            return { 
                content: pdfData.text, 
                type: 'pdf',
                metadata: {
                    pages: pdfData.numpages,
                    info: pdfData.info
                }
            };
        } else {
            // Convert buffer back to string for HTML content
            const htmlContent = response.data.toString('utf-8');
            console.log('-- HTML Content --');
            console.log(htmlContent.substring(0, 1000));
            console.log('-- End HTML Content --');
            return { 
                content: htmlContent, 
                type: 'html' 
            };
        }
    } catch (error) {
        // Check if it's a 403 and we haven't exhausted retries
        if (error.response?.status === 403 && retryCount < maxRetries) {
            console.log(`Attempt ${retryCount + 1} failed with 403, retrying with different user agent...`);
            return fetchWebContent(url, retryCount + 1);
        }
        
        // Provide more helpful error messages
        if (error.response?.status === 403) {
            throw new Error(`Access denied (403): This website blocks automated access. The site may require JavaScript, have CAPTCHA protection, or block all automated requests. Try using a different URL or accessing the content manually.`);
        } else if (error.response?.status === 404) {
            throw new Error(`Page not found (404): The URL doesn't exist or has been moved.`);
        } else if (error.response?.status >= 500) {
            throw new Error(`Server error (${error.response.status}): The website is experiencing issues.`);
        } else {
            throw new Error(`Failed to fetch URL: ${error.message}`);
        }
    }
}

function htmlToMarkdown(html) {
    console.log('\n[2/3] Converting HTML to Markdown...');
    const $ = cheerio.load(html);
    console.log('  - Loaded HTML into cheerio');
    // Remove script and style elements
    $('script, style, nav, footer, aside').remove();
    console.log('  - Removed script and style elements');
    // Get main content (try common content selectors)
    const contentSelectors = ['main', 'article', '.content', '.post', '#content', '.entry-content'];
    let content = '';
    
    for (const selector of contentSelectors) {
        console.log(`  - Trying selector: ${selector}`);
        const element = $(selector);
        if (element.length > 0 && element.text().trim().length > 100) {
            console.log(`    - Found element with selector: ${selector}`);
            content = element.html();
            break;
        }
    }
    
    // If no main content found, use body but clean it up
    if (!content) {
        console.log('  - No main content found, using body');
        $('header, nav, footer, aside, .sidebar, .menu, .navigation').remove();
        content = $('body').html() || html;
    }
    
    const markdown = turndownService.turndown(content);
    console.log(`✅ Conversion successful. Markdown length: ${markdown.length}`);
    return markdown;
}

function chunkText(content, url, chunkSize = 2000, overlap = 200) {
    if (!content || content.length === 0) {
        throw new Error('No content to chunk');
    }
    
    const cleanContent = content.replace(/\s+/g, ' ').trim();
    
    // Adaptive chunking for large files
    let adaptiveChunkSize = chunkSize;
    let adaptiveOverlap = overlap;
    
    // For large files (>1MB text), use larger chunks to reduce processing load
    if (cleanContent.length > 1000000) {
        adaptiveChunkSize = Math.min(2400, chunkSize * 2); // Max 2400 chars
        adaptiveOverlap = Math.min(400, overlap * 2);      // Max 400 chars overlap
    }
    
    const chunks = [];
    const totalChunks = Math.ceil(cleanContent.length / (adaptiveChunkSize - adaptiveOverlap));
    
    for (let i = 0; i < cleanContent.length; i += adaptiveChunkSize - adaptiveOverlap) {
        const chunk = cleanContent.slice(i, i + adaptiveChunkSize);
        const chunkId = uuidv4();
        
        chunks.push({
            chunk_text: chunk.trim(),
            chunk_id: chunkId,
            chunk_index: Math.floor(i / (adaptiveChunkSize - adaptiveOverlap)),
            original_url: url,
            total_chunks: totalChunks,
            chunk_size_used: adaptiveChunkSize,
            overlap_used: adaptiveOverlap
        });
    }
    
    console.log(`✂️ Created ${chunks.length} chunks from ${Math.round(cleanContent.length/1000)}K characters`);
    return chunks;
}

// analyzeChunk function removed - functionality moved to AnalysisService

async function generateChunkContext(fullDocument, chunkText) {
    // Use new AI services if available, fallback to original implementation
    if (aiServices && aiServices.analysisService) {
        try {
            return await aiServices.analysisService.generateChunkContext(fullDocument, chunkText);
        } catch (error) {
            console.warn('New context generation service failed, falling back to original:', error.message);
        }
    }

    // Original implementation as fallback
    const prompt = `Here is the full document content:

<document>
${fullDocument.substring(0, 8000)}${fullDocument.length > 8000 ? '...[truncated]' : ''}
</document>

Here is the chunk we want to situate within the whole document:
<chunk>
${chunkText}
</chunk>

Please give a short succinct context (1-2 sentences) to situate this chunk within the overall document for better retrieval.`;

    try {
        const response = await openaiClient.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'You are a helpful assistant that provides contextual summaries for document chunks to improve retrieval.' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 100,
            temperature: 0.3
        });
        
        return response.choices[0].message.content.trim();
    } catch (error) {
        console.warn(`Context generation failed: ${error.message}`);
        return null; // Fall back to non-contextual embedding
    }
}

async function generateEmbedding(text, context = null) {
    // Use new AI services if available, fallback to original implementation
    if (aiServices && aiServices.embeddingService) {
        try {
            return await aiServices.embeddingService.generateEmbedding(text, context);
        } catch (error) {
            console.warn('New embedding service failed, falling back to original:', error.message);
        }
    }

    // Original implementation as fallback
    try {
        // Combine context with chunk text if context is provided
        const enhancedText = context ? `${context}\n\n${text}` : text;
        
        const response = await openaiClient.embeddings.create({
            model: 'text-embedding-3-small',
            input: enhancedText
        });
        
        return response.data[0].embedding;
    } catch (error) {
        throw new Error(`Failed to generate embedding: ${error.message}`);
    }
}

async function storeInQdrant(chunkData, embedding, analysis, contextualSummary = null) {
    // Use new storage services if available, fallback to original implementation
    if (storageServices && storageServices.vectorService) {
        try {
            return await storageServices.vectorService.storeInQdrant(chunkData, embedding, analysis, contextualSummary);
        } catch (error) {
            console.warn('New vector service failed, falling back to original:', error.message);
        }
    }

    // Original implementation as fallback
    try {
        // 🔍 Debug logging for contextual embeddings
        console.log('🧠 Qdrant Storage Debug:');
        console.log('  Chunk ID:', chunkData.chunk_id);
        console.log('  Has contextual summary:', contextualSummary ? 'YES' : 'NO');
        console.log('  Uses contextual embedding:', contextualSummary !== null);
        if (contextualSummary) {
            console.log('  Contextual summary preview:', contextualSummary.substring(0, 100) + '...');
        }

        const payload = {
            url: chunkData.original_url,
            title: analysis.title,
            chunk_text: chunkData.chunk_text,
            chunk_id: chunkData.chunk_id, // 🐛 FIX: Add missing chunk_id to payload
            chunk_index: chunkData.chunk_index,
            summary: analysis.summary,
            category: analysis.category,
            tags: analysis.tags,
            key_concepts: analysis.key_concepts,
            content_type: analysis.content_type,
            technical_level: analysis.technical_level,
            contextual_summary: contextualSummary,
            uses_contextual_embedding: contextualSummary !== null,
            processed_date: new Date().toISOString()
        };
        
        // 🔍 Log the full payload being sent to Qdrant
        console.log('  Qdrant payload keys:', Object.keys(payload));
        console.log('  Payload contextual fields:', {
            contextual_summary: payload.contextual_summary ? 'present' : 'null',
            uses_contextual_embedding: payload.uses_contextual_embedding,
            chunk_id: payload.chunk_id
        });

        const response = await axios.put(
            `${QDRANT_URL}/collections/autollama-content/points`,
            {
                points: [{
                    id: chunkData.chunk_id,
                    vector: embedding,
                    payload: payload
                }]
            },
            {
                headers: {
                    'api-key': QDRANT_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        // 🔍 Log Qdrant response
        console.log('  Qdrant response status:', response.status);
        console.log('  Qdrant operation result:', response.data.result?.operation_id || 'success');
        
        return response.data;
    } catch (error) {
        console.error('❌ Qdrant storage failed:', error.message);
        console.error('   Response data:', error.response?.data);
        throw new Error(`Failed to store in Qdrant: ${error.message}`);
    }
}

async function storeInPostgreSQL(chunkData, analysis, embeddingStatus = 'unknown', sessionId = null, contextualSummary = null, uploadSource = 'user', parentDocumentId = null) {
    try {
        console.log('Storing in PostgreSQL with analysis:', analysis?.title || 'No title');
        
        // Ensure analysis has required fields
        if (!analysis || !analysis.title || !analysis.summary) {
            throw new Error('Analysis object missing required fields');
        }
        
        // Helper function to map embedding status
        const mapEmbeddingStatus = (status) => {
            const statusMap = {
                'success': 'complete',
                'failed': 'error',
                'pending': 'pending'
            };
            return statusMap[status] || 'pending';
        };

        // Build PostgreSQL data structure
        const contentData = {
            url: chunkData.original_url,
            title: analysis.title || 'Untitled',
            summary: analysis.summary || 'No summary available',
            chunk_text: chunkData.chunk_text,
            chunk_id: chunkData.chunk_id,
            chunk_index: chunkData.chunk_index || 0,
            sentiment: analysis.sentiment || null,
            emotions: analysis.emotions || [],
            category: analysis.category || null,
            content_type: analysis.content_type || 'article',
            technical_level: analysis.technical_level || 'intermediate',
            main_topics: analysis.main_topics || [],
            key_concepts: analysis.key_concepts || [],
            tags: Array.isArray(analysis.tags) ? analysis.tags.join(', ') : (analysis.tags || ''),
            key_entities: analysis.key_entities || {},
            embedding_status: mapEmbeddingStatus(embeddingStatus),
            processing_status: 'completed',
            contextual_summary: contextualSummary,
            uses_contextual_embedding: contextualSummary !== null,
            upload_source: uploadSource,
            record_type: 'chunk', // This is a chunk, not a document
            parent_document_id: parentDocumentId // Link to parent document
        };
        
        console.log('PostgreSQL payload:', contentData);
        
        const result = await db.addContentRecord(contentData);
        console.log('PostgreSQL storage successful!', result.id);
        return { id: result.id, status: 'success' };
    } catch (error) {
        console.error('POSTGRESQL STORAGE ERROR:');
        console.error('Error message:', error.message);
        console.error('Error details:', error);
        
        throw new Error(`Failed to store in PostgreSQL: ${error.message}`);
    }
}

// Upload session management functions
async function createUploadSession(filename, totalChunks, filePath, uploadSource = 'user') {
    try {
        const sessionId = uuidv4();
        const sessionData = {
            sessionId: sessionId,
            filename: filename,
            totalChunks: totalChunks,
            filePath: filePath,
            upload_source: uploadSource
        };
        
        const session = await db.createUploadSession(sessionData);
        console.log(`Upload session created: ${session.sessionId} (source: ${uploadSource})`);
        return { id: session.id, sessionId: session.sessionId };
    } catch (error) {
        console.error('Failed to create upload session:', error.message);
        throw new Error(`Failed to create upload session: ${error.message}`);
    }
}

async function updateUploadSession(sessionId, completedChunks, status = null) {
    try {
        const updateData = {
            completed_chunks: completedChunks
        };
        
        if (status) {
            updateData.status = status.toLowerCase();
        }
        
        const result = await db.updateUploadSession(sessionId, updateData);
        return result;
    } catch (error) {
        console.error('Failed to update upload session:', error.message);
        throw new Error(`Failed to update upload session: ${error.message}`);
    }
}

async function getUploadSession(sessionId) {
    try {
        // Query PostgreSQL directly for upload session
        const result = await db.pool.query(
            'SELECT * FROM upload_sessions WHERE session_id = $1',
            [sessionId]
        );
        
        if (result.rows.length > 0) {
            const session = result.rows[0];
            return {
                id: session.id,
                fields: {
                    'Session ID': session.session_id,
                    'Filename': session.filename,
                    'Total Chunks': session.total_chunks,
                    'Completed Chunks': session.completed_chunks,
                    'Status': session.status,
                    'File Path': session.file_path,
                    'Created At': session.created_at,
                    'Updated At': session.updated_at
                }
            };
        }
        return null;
    } catch (error) {
        console.error('Failed to get upload session:', error.message);
        throw new Error(`Failed to get upload session: ${error.message}`);
    }
}

async function getProcessedChunksForSession(sessionId) {
    try {
        // Get processed chunks from PostgreSQL by session ID
        const result = await db.pool.query(
            'SELECT chunk_id, chunk_index, processing_status FROM processed_content WHERE url LIKE $1',
            [`%session=${sessionId}%`]
        );
        
        return result.rows.map(row => ({
            chunkIndex: row.chunk_index,
            chunkId: row.chunk_id,
            status: row.processing_status || 'completed'
        }));
    } catch (error) {
        console.error('Failed to get processed chunks:', error.message);
        return [];
    }
}

// Enhanced SSE function for pipeline visualization
function sendSSEUpdate(res, step, message, progress = null, chunkData = null) {
    const data = {
        step,
        message,
        progress,
        timestamp: new Date().toISOString(),
        // Pipeline visualization data
        chunkId: chunkData?.chunkId,
        stage: step, // queue, fetch, convert, chunk, analyze, context, embed, bm25, store, complete
        filename: chunkData?.filename,
        position: chunkData?.position, // For animation positioning
        metadata: chunkData?.preview, // First 200 chars for preview
        sessionId: chunkData?.sessionId,
        totalChunks: chunkData?.totalChunks,
        currentChunk: chunkData?.currentChunk,
        chunkData: chunkData // Include full chunk data for Flow View
    };
    
    // Send to the specific processing stream
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    
    // Broadcast to all global SSE clients (for Flow View)
    broadcastToSSEClients(data);
}

// Legacy routes removed - functionality moved to modular route system

// Deprecated file processing wrapper functions removed - use ContentProcessor service instead

async function processContentChunks(content, url, sseCallback = null, uploadSession = null) {
    let processedChunks = 0;
    let qdrantStored = 0;
    let airtableStored = 0;
    let documentRecord = null;
    
    // Generate session ID for tracking - use session tracker for orphan prevention
    let sessionId;
    let trackedUploadSession = uploadSession;
    
    try {
        // Step 1: Chunk the text first to get count
        console.log('Chunking text...');
        const chunks = chunkText(content, url);
        console.log(`Created ${chunks.length} chunks`);
        
        if (!trackedUploadSession) {
            // CRITICAL: Create tracked session instead of fallback UUID to prevent orphans
            try {
                const filename = url.split('/').pop() || 'unknown';
                
                if (services && services.sessionTracker) {
                    trackedUploadSession = await services.sessionTracker.createTrackedSession(
                        filename, 
                        chunks.length, 
                        url, 
                        'url_processing'
                    );
                    sessionId = trackedUploadSession.session_id;
                    console.log('✅ Created tracked session for URL processing:', sessionId);
                } else {
                    // Fallback to legacy session creation
                    trackedUploadSession = await createUploadSession(filename, chunks.length, url, 'url_processing');
                    sessionId = trackedUploadSession.sessionId;
                    console.log('⚠️ Using legacy session for URL processing');
                }
            } catch (sessionError) {
                console.error('❌ Failed to create processing session:', sessionError);
                
                // CRITICAL: Do not create orphaned processing - abort instead
                throw new Error(`Processing aborted: Failed to create session - ${sessionError.message}`);
            }
        } else {
            sessionId = trackedUploadSession.session_id || trackedUploadSession.sessionId;
        }
        
        // Track this processing session in memory or update existing session
        const existingSession = activeProcessingSessions.get(sessionId);
        if (existingSession) {
            // Update existing session with chunk count
            existingSession.totalChunks = chunks.length;
            existingSession.lastUpdate = new Date();
            activeProcessingSessions.set(sessionId, existingSession);
        } else {
            // Create new session for URL processing
            activeProcessingSessions.set(sessionId, {
                id: sessionId,
                url: url,
                filename: url.split('/').pop() || 'Unknown File',
                totalChunks: chunks.length,
                processedChunks: 0,
                startTime: new Date(),
                lastUpdate: new Date(),
                status: 'processing'
            });
        }
        
        // Create database session for URL processing (same as file uploads)
        if (!uploadSession) {
            try {
                const filename = url.split('/').pop() || 'Unknown URL';
                uploadSession = await createUploadSession(filename, chunks.length, url, 'user');
                console.log('Created upload session:', uploadSession.sessionId);
            } catch (error) {
                console.error('Error creating upload session:', error);
            }
        }
        
        // IMPORTANT: Create a document record first
        try {
            // Extract title and summary from content
            const title = extractTitle(content, url);
            let summary = 'Content processed'; // Default summary
            
            try {
                summary = await generateDocumentSummary(content, url);
            } catch (summaryError) {
                console.warn('Failed to generate AI summary, using default:', summaryError.message);
                // Continue processing without AI summary to prevent hanging
            }
            
            documentRecord = await db.createDocumentRecord({
                url: url,
                title: title,
                summary: summary,
                full_content: content.substring(0, 5000), // Store first 5000 chars as preview
                upload_source: 'user',
                metadata: {
                    total_chunks: chunks.length,
                    content_length: content.length
                }
            });
            
            console.log('📄 Created document record:', documentRecord.id, 'URL:', url, 'Title:', title);
            
            if (sseCallback) {
                sseCallback('document_created', {
                    documentId: documentRecord.id,
                    title: title,
                    totalChunks: chunks.length
                });
            }
            
            // Always broadcast document creation to all SSE clients for dashboard refresh
            console.log('📡 Broadcasting document_created SSE event:', documentRecord.id);
            broadcastToSSEClients({
                step: 'document_created',
                message: `📄 New document created: ${title}`,
                data: {
                    documentId: documentRecord.id,
                    title: title,
                    totalChunks: chunks.length
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error creating document record:', error);
            // Continue processing even if document creation fails
        }
        
        // Step 2: Process chunks with contextual embeddings
        // Adaptive concurrency: reduce parallel processing for large files to prevent resource exhaustion
        let concurrencyLimit = 3;
        if (chunks.length > 100) {
            concurrencyLimit = 2; // Reduce for files with 100+ chunks
        } else if (chunks.length > 500) {
            concurrencyLimit = 1; // Serial processing for very large files
        }
        
        for (let i = 0; i < chunks.length; i += concurrencyLimit) {
            const batch = chunks.slice(i, i + concurrencyLimit);
            
            const batchPromises = batch.map(async (chunk) => {
                try {
                    const progress = Math.round(((chunk.chunk_index + 1) / chunks.length) * 100);
                    console.log(`Processing chunk ${chunk.chunk_index + 1}/${chunks.length} (${progress}%) in session ${sessionId}`);
                    
                    // Enhanced chunk data for Flow View
                    const chunkData = {
                        chunkId: chunk.chunk_id,
                        sessionId: sessionId,
                        currentChunk: chunk.chunk_index + 1,
                        totalChunks: chunks.length,
                        title: chunk.title || `Chunk ${chunk.chunk_index + 1}`,
                        preview: chunk.chunk_text?.substring(0, 200) + '...',
                        filename: chunk.url || filename || 'unknown',
                        position: chunk.chunk_index / chunks.length
                    };
                    
                    // Send chunk processing start event for Flow View
                    if (sseCallback) {
                        sseCallback('chunk_processing_start', { 
                            message: `🤖 Processing chunk ${chunk.chunk_index + 1}/${chunks.length}`,
                            sessionId: sessionId,
                            chunkData: chunkData,
                            progress: progress
                        });
                    }
                    
                    // Analyze chunk with GPT-4o-mini
                    if (sseCallback) {
                        sseCallback('analyze', { 
                            message: `🧠 Analyzing chunk ${chunk.chunk_index + 1}...`,
                            sessionId: sessionId,
                            chunkData: chunkData
                        });
                    }
                    
                    // Analyze chunk with timeout and error handling
                    let analysis;
                    try {
                        analysis = await Promise.race([
                            analyzeChunk(chunk.chunk_text),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('Analysis timeout')), 30000))
                        ]);
                    } catch (analysisError) {
                        console.warn(`Analysis failed for chunk ${chunk.chunk_index + 1}, using defaults:`, analysisError.message);
                        analysis = {
                            title: 'Content chunk',
                            summary: chunk.chunk_text.substring(0, 100) + '...',
                            sentiment: 'neutral',
                            emotions: [],
                            category: 'other',
                            content_type: 'article',
                            technical_level: 'general',
                            main_topics: [],
                            key_concepts: [],
                            tags: '',
                            key_entities: {}
                        };
                    }
                    
                    if (sseCallback) {
                        sseCallback('analyze_complete', { 
                            message: `✅ Analyzed chunk ${chunk.chunk_index + 1}: ${analysis.sentiment || 'neutral'}`,
                            sessionId: sessionId,
                            chunkData: chunkData
                        });
                    }
                    
                    // Generate contextual summary if enabled
                    let contextualSummary = null;
                    if (ENABLE_CONTEXTUAL_EMBEDDINGS) {
                        if (sseCallback) {
                            sseCallback('context_generate', { 
                                message: `📝 Generating contextual summary for chunk ${chunk.chunk_index + 1}/${chunks.length}...`,
                                sessionId: sessionId,
                                chunkData: chunkData
                            });
                        }
                        contextualSummary = await generateChunkContext(content, chunk.chunk_text);
                        
                        if (sseCallback) {
                            sseCallback('context_complete', { 
                                message: `✅ Generated context for chunk ${chunk.chunk_index + 1}`,
                                sessionId: sessionId,
                                chunkData: chunkData
                            });
                        }
                    }
                    
                    // Generate embedding (with context if available)
                    if (sseCallback) {
                        sseCallback('embedding', { 
                            message: `🔗 Creating ${contextualSummary ? 'contextual ' : ''}embeddings for chunk ${chunk.chunk_index + 1}...`,
                            sessionId: sessionId,
                            chunkData: chunkData
                        });
                    }
                    const embedding = await generateEmbedding(chunk.chunk_text, contextualSummary);
                    
                    // Store in Qdrant
                    let embeddingStatus = 'pending';
                    try {
                        if (sseCallback) {
                            sseCallback('embed_storing', { 
                                message: `💾 Storing chunk ${chunk.chunk_index + 1} in vector database...`,
                                sessionId: sessionId,
                                chunkData: chunkData
                            });
                        }
                        await storeInQdrant(chunk, embedding, analysis, contextualSummary);
                        qdrantStored++;
                        embeddingStatus = 'success';
                        
                        if (sseCallback) {
                            sseCallback('embed_complete', { 
                                message: `✅ Stored chunk ${chunk.chunk_index + 1} in vector database`,
                                sessionId: sessionId,
                                chunkData: chunkData
                            });
                        }
                    } catch (qdrantError) {
                        console.error('Qdrant storage failed:', qdrantError);
                        embeddingStatus = 'failed';
                        
                        if (sseCallback) {
                            sseCallback('embed_error', { 
                                message: `⚠️ Vector storage failed for chunk ${chunk.chunk_index + 1}: ${qdrantError.message}`,
                                sessionId: sessionId,
                                chunkData: chunkData
                            });
                        }
                    }
                    
                    // Store in PostgreSQL with session ID and contextual summary
                    try {
                        if (sseCallback) {
                            sseCallback('storing', { 
                                message: `💾 Storing chunk ${chunk.chunk_index + 1} metadata...`,
                                sessionId: sessionId,
                                chunkData: chunkData
                            });
                        }
                        await storeInPostgreSQL(chunk, analysis, embeddingStatus, sessionId, contextualSummary, 'user', documentRecord ? documentRecord.id : null);
                        airtableStored++;
                        
                        // Update session activity
                        if (services && services.sessionTracker && sessionId) {
                            await services.sessionTracker.updateSessionActivity(
                                sessionId, 
                                chunk.chunk_index + 1,
                                { currentChunk: chunk.chunk_index + 1, totalChunks: chunks.length }
                            );
                        }
                        
                        if (sseCallback) {
                            sseCallback('store_complete', { 
                                message: `✅ Stored chunk ${chunk.chunk_index + 1} metadata`,
                                sessionId: sessionId,
                                chunkData: chunkData
                            });
                        }
                    } catch (airtableError) {
                        console.error('PostgreSQL storage failed:', airtableError);
                        
                        if (sseCallback) {
                            sseCallback('store_error', { 
                                message: `⚠️ Metadata storage failed for chunk ${chunk.chunk_index + 1}: ${airtableError.message}`,
                                sessionId: sessionId,
                                chunkData: chunkData
                            });
                        }
                    }
                    
                    processedChunks++;
                    
                    // Update active session with processed chunk count
                    const session = activeProcessingSessions.get(sessionId);
                    if (session) {
                        session.processedChunks = processedChunks;
                        session.lastUpdate = new Date();
                        activeProcessingSessions.set(sessionId, session);
                    }
                    
                    // Send chunk processing complete event for Flow View
                    if (sseCallback) {
                        sseCallback('chunk_processing_complete', { 
                            message: `🎉 Completed chunk ${chunk.chunk_index + 1}/${chunks.length}`,
                            sessionId: sessionId,
                            chunkData: chunkData,
                            progress: Math.round(((chunk.chunk_index + 1) / chunks.length) * 100)
                        });
                    }
                    
                    // Update session progress
                    if (uploadSession.id) {
                        try {
                            await updateUploadSession(uploadSession.id, processedChunks);
                        } catch (updateError) {
                            console.error('Failed to update session progress:', updateError);
                        }
                    }
                    
                    // Update progress
                    if (sseCallback) {
                        const progress = 65 + Math.round((processedChunks / chunks.length) * 25);
                        sseCallback('analyze', { 
                            progress, 
                            message: `Processed ${processedChunks}/${chunks.length} chunks`,
                            current: processedChunks,
                            total: chunks.length,
                            sessionId: sessionId
                        });
                    }
                    
                    return { success: true, chunkIndex: chunk.chunk_index };
                    
                } catch (chunkError) {
                    console.error(`Error processing chunk ${chunk.chunk_index + 1}:`, chunkError);
                    return { success: false, chunkIndex: chunk.chunk_index, error: chunkError.message };
                }
            });
            
            // Wait for this batch to complete before starting the next
            await Promise.all(batchPromises);
            
            // Small delay between batches to prevent overwhelming APIs
            if (i + concurrencyLimit < chunks.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        // Mark session as completed
        if (uploadSession.id) {
            try {
                await updateUploadSession(uploadSession.id, processedChunks, 'Completed');
            } catch (updateError) {
                console.error('Failed to mark session as completed:', updateError);
            }
        }
        
        console.log(`Session ${sessionId} completed: ${processedChunks} chunks processed, ${qdrantStored} stored in Qdrant, ${airtableStored} stored in Airtable`);
        
        // Mark session as completed and remove from active sessions
        const session = activeProcessingSessions.get(sessionId);
        if (session) {
            session.status = 'completed';
            session.completedAt = new Date();
            activeProcessingSessions.delete(sessionId);
            console.log(`Session ${sessionId} completed and removed from active tracking`);
        }
        
        // Complete session tracking
        if (services && services.sessionTracker && sessionId) {
            await services.sessionTracker.completeSession(sessionId, {
                processed_chunks: processedChunks,
                qdrant_stored: qdrantStored,
                airtable_stored: airtableStored,
                url: url
            });
        }

        return {
            url,
            chunks: chunks.length,
            processedChunks,
            qdrantStored,
            airtableStored,
            sessionId: sessionId
        };
        
    } catch (error) {
        console.error('Error in processContentChunks:', error);
        
        // Mark session as failed in session tracker
        if (services && services.sessionTracker && sessionId) {
            await services.sessionTracker.markSessionFailed(
                sessionId,
                error.message,
                {
                    error_type: 'processing_error',
                    endpoint: 'processContentChunks',
                    stack: error.stack?.split('\n').slice(0, 3).join('\n')
                }
            );
        }
        
        // Mark session as failed and remove from active sessions
        const session = activeProcessingSessions.get(sessionId);
        if (session) {
            session.status = 'failed';
            session.error = error.message;
            session.completedAt = new Date();
            activeProcessingSessions.delete(sessionId);
            console.log(`Session ${sessionId} failed and removed from active tracking`);
        }
        
        // Mark session as failed
        if (uploadSession.id) {
            try {
                await updateUploadSession(uploadSession.id, processedChunks, 'Failed');
            } catch (updateError) {
                console.error('Failed to mark session as failed:', updateError);
            }
        }
        
        throw error;
    }
}

// Duplicate function removed - using the main processContentChunks function above that accepts uploadSession parameter

// Legacy upload route removed for memory optimization

// Function to broadcast processing events to all SSE clients
function broadcastToSSEClients(eventData) {
    if (globalSSEClients.size > 0) {
        console.log(`📡 Broadcasting to ${globalSSEClients.size} SSE clients:`, eventData.step);
    }
    globalSSEClients.forEach(client => {
        if (!client.destroyed) {
            try {
                client.write(`data: ${JSON.stringify(eventData)}\n\n`);
            } catch (error) {
                console.error('Failed to broadcast to SSE client:', error);
                globalSSEClients.delete(client);
            }
        } else {
            globalSSEClients.delete(client);
        }
    });
}

// Special SSE callback for file processing that broadcasts in the right format
function createSSEBroadcastCallback(res) {
    return (step, data) => {
        
        // Create the event data in the expected format
        const eventData = {
            step,
            message: data.message || '',
            progress: data.progress || null,
            timestamp: new Date().toISOString(),
            sessionId: data.sessionId,
            chunkData: data.chunkData || null
        };
        
        // Send to the specific processing stream
        res.write(`data: ${JSON.stringify({event: step, data})}\n\n`);
        
        // Broadcast to all global SSE clients (for Flow View)
        broadcastToSSEClients(eventData);
    };
}

// Legacy upload route removed for memory optimization

// Legacy cleanup and utility routes removed - handled by modular route system

// Error classification and recovery system
function classifyError(error) {
    const message = error.message?.toLowerCase() || '';
    const stack = error.stack?.toLowerCase() || '';
    
    // Network/connection errors
    if (message.includes('timeout') || message.includes('econnreset') || message.includes('enotfound')) {
        return 'network';
    }
    
    // Database errors
    if (message.includes('connection') && (message.includes('database') || message.includes('postgres'))) {
        return 'database';
    }
    
    // Qdrant/vector database errors  
    if (message.includes('qdrant') || message.includes('vector') || stack.includes('qdrant')) {
        return 'vector_db';
    }
    
    // File parsing errors
    if (message.includes('parse') || message.includes('invalid file') || message.includes('corrupt')) {
        return 'file_format';
    }
    
    // Memory/resource errors
    if (message.includes('out of memory') || message.includes('heap') || message.includes('maximum call stack')) {
        return 'resource';
    }
    
    // API/OpenAI errors
    if (message.includes('openai') || message.includes('api key') || message.includes('rate limit')) {
        return 'api';
    }
    
    // Timeout errors
    if (message.includes('timeout') || message.includes('abort')) {
        return 'timeout';
    }
    
    return 'unknown';
}

function getRecoverySuggestions(errorType, error) {
    const suggestions = {
        network: [
            'Check your internet connection',
            'Try uploading again in a few moments',
            'Ensure the file is not corrupted'
        ],
        database: [
            'System temporarily unavailable - please try again',
            'Contact support if the issue persists'
        ],
        vector_db: [
            'Vector database temporarily unavailable',
            'Try again in a few minutes',
            'Your file content was preserved and can be retried'
        ],
        file_format: [
            'Check that your file is not corrupted',
            'Ensure the file format is supported (PDF, EPUB, DOCX, TXT, CSV)',
            'Try saving the file in a different format'
        ],
        resource: [
            'File may be too large or complex',
            'Try splitting large files into smaller sections',
            'Wait a moment for system resources to become available'
        ],
        api: [
            'AI processing service temporarily unavailable',
            'Try again in a few minutes',
            'Check if API keys are properly configured'
        ],
        timeout: [
            'Processing took too long - this may be due to a large file',
            'Try uploading a smaller file first',
            'Wait a moment and try again'
        ],
        temporary: [
            'Temporary system issue',
            'Try uploading again in a few moments'
        ],
        unknown: [
            'An unexpected error occurred',
            'Try uploading again',
            'Contact support if the issue continues'
        ]
    };
    
    return suggestions[errorType] || suggestions.unknown;
}

// System health check function
async function checkSystemHealth() {
    const health = {
        database: false,
        qdrant: false
    };
    
    try {
        // Check database connection
        const dbResult = await db.pool.query('SELECT 1');
        health.database = true;
    } catch (error) {
        console.error('Database health check failed:', error.message);
    }
    
    try {
        // Check Qdrant connection
        const qdrantResponse = await axios.get(`${QDRANT_URL}/health`, {
            headers: { 'api-key': QDRANT_API_KEY },
            timeout: 3000
        });
        health.qdrant = qdrantResponse.status === 200;
    } catch (error) {
        console.error('Qdrant health check failed:', error.message);
    }
    
    return health;
}

// Enhanced session cleanup with comprehensive health monitoring
async function advancedSessionCleanup(options = {}) {
    const {
        thresholdMinutes = null,
        enableHealthCheck = true,
        enableOrphanCleanup = true,
        enableMemoryCleanup = true
    } = options;

    const client = await db.pool.connect();
    const cleanupResults = {
        timestamp: new Date().toISOString(),
        sessions_cleaned: 0,
        chunks_recovered: 0,
        memory_freed: false,
        health_issues: [],
        performance_metrics: {}
    };

    try {
        const startTime = Date.now();
        await client.query('BEGIN');

        // 1. HEARTBEAT-BASED HEALTH MONITORING
        if (enableHealthCheck) {
            console.log('🩺 Running health check and heartbeat monitoring...');
            
            // Mark sessions without heartbeat as failed (90 second threshold)
            const heartbeatResult = await client.query(`
                UPDATE upload_sessions 
                SET status = 'failed', 
                    error_message = 'Health check timeout - no heartbeat detected',
                    completed_at = NOW()
                WHERE status = 'processing' 
                  AND last_activity < NOW() - INTERVAL '90 seconds'
                RETURNING session_id, filename, last_activity
            `);

            cleanupResults.sessions_cleaned += heartbeatResult.rowCount;
            
            if (heartbeatResult.rowCount > 0) {
                console.log(`💗 Heartbeat cleanup: ${heartbeatResult.rowCount} sessions without heartbeat`);
                heartbeatResult.rows.forEach(row => {
                    const stuckDuration = Math.round((Date.now() - new Date(row.last_activity).getTime()) / 1000);
                    console.log(`   └── Session ${row.session_id} (${row.filename}) stuck for ${stuckDuration}s`);
                });
            }
        }

        // 2. PROCESS TIMEOUT RECOVERY
        const threshold = thresholdMinutes || parseInt(process.env.SESSION_CLEANUP_THRESHOLD || '8');
        const timeoutResult = await client.query(`
            UPDATE upload_sessions 
            SET status = 'failed',
                error_message = $2,
                completed_at = NOW()
            WHERE status = 'processing' 
              AND created_at < NOW() - INTERVAL '1 minute' * $1
            RETURNING session_id, filename, created_at
        `, [threshold, `Process timeout - stuck for ${threshold}+ minutes`]);

        cleanupResults.sessions_cleaned += timeoutResult.rowCount;

        if (timeoutResult.rowCount > 0) {
            console.log(`⏰ Timeout cleanup: ${timeoutResult.rowCount} sessions exceeded ${threshold}m limit`);
            timeoutResult.rows.forEach(row => {
                const totalDuration = Math.round((Date.now() - new Date(row.created_at).getTime()) / 1000 / 60);
                console.log(`   └── Session ${row.session_id} (${row.filename}) ran for ${totalDuration}m`);
            });
        }

        // 3. ORPHANED CHUNK RECOVERY
        if (enableOrphanCleanup) {
            const orphanResult = await client.query(`
                UPDATE processed_content 
                SET processing_status = 'failed',
                    processed_date = NOW()
                WHERE processing_status = 'processing' 
                  AND processed_date < NOW() - INTERVAL '10 minutes'
                RETURNING url
            `);

            cleanupResults.chunks_recovered = orphanResult.rowCount;
            
            if (orphanResult.rowCount > 0) {
                console.log(`🔄 Orphan recovery: ${orphanResult.rowCount} stuck chunks recovered`);
                console.log(`   └── URLs affected: ${[...new Set(orphanResult.rows.map(r => r.url))].length} unique URLs`);
            }
        }

        // 4. IN-MEMORY SESSION CLEANUP
        if (enableMemoryCleanup) {
            let memoryCleanedCount = 0;
            for (const [sessionId, session] of activeProcessingSessions.entries()) {
                const timeSinceLastUpdate = Date.now() - (session.lastUpdate?.getTime() || 0);
                
                // Remove sessions stuck for more than 5 minutes from memory
                if (timeSinceLastUpdate > 300000) {
                    activeProcessingSessions.delete(sessionId);
                    memoryCleanedCount++;
                }
            }
            
            if (memoryCleanedCount > 0) {
                console.log(`🧠 Memory cleanup: ${memoryCleanedCount} sessions removed from active tracking`);
                cleanupResults.memory_freed = true;
            }
        }

        // 5. SYSTEM HEALTH DIAGNOSTICS (separate from transaction)
        // Commit transaction first to avoid issues with complex queries
        await client.query('COMMIT');
        
        try {
            const healthCheck = await Promise.allSettled([
                // Database connection health  
                db.pool.query('SELECT NOW() as db_time'),
                
                // Active sessions analysis
                db.pool.query(`
                    SELECT 
                        status,
                        COUNT(*) as count,
                        AVG(EXTRACT(EPOCH FROM (NOW() - created_at))/60)::int as avg_duration_minutes,
                        MAX(EXTRACT(EPOCH FROM (NOW() - created_at))/60)::int as max_duration_minutes
                    FROM upload_sessions 
                    WHERE created_at > NOW() - INTERVAL '24 hours'
                    GROUP BY status
                `),
                
                // Recent failure analysis
                db.pool.query(`
                    SELECT 
                        LEFT(error_message, 50) as error_type,
                        COUNT(*) as error_count
                    FROM upload_sessions 
                    WHERE status = 'failed' 
                      AND updated_at > NOW() - INTERVAL '1 hour'
                      AND error_message IS NOT NULL
                    GROUP BY LEFT(error_message, 50)
                    ORDER BY error_count DESC
                    LIMIT 5
                `)
            ]);

            // Process health check results
            if (healthCheck[0].status === 'fulfilled') {
                cleanupResults.performance_metrics.database = {
                    response_time_ms: Date.now() - startTime,
                    status: 'healthy'
                };
            }

            if (healthCheck[1].status === 'fulfilled') {
                cleanupResults.performance_metrics.sessions = healthCheck[1].value.rows.reduce((acc, row) => {
                    acc[row.status] = {
                        count: parseInt(row.count),
                        avg_duration_minutes: parseFloat(row.avg_duration_minutes || 0),
                        max_duration_minutes: parseFloat(row.max_duration_minutes || 0)
                    };
                    return acc;
                }, {});
            }

            if (healthCheck[2].status === 'fulfilled') {
                cleanupResults.health_issues = healthCheck[2].value.rows;
            }
        } catch (healthError) {
            console.warn('Health diagnostics failed:', healthError.message);
            cleanupResults.health_issues.push({
                error_type: 'health_diagnostics_failure',
                error_count: 1,
                message: healthError.message
            });
        }
        
        // Log comprehensive results
        if (cleanupResults.sessions_cleaned > 0 || cleanupResults.chunks_recovered > 0) {
            console.log(`🧹 Enhanced cleanup completed:`, {
                sessions_cleaned: cleanupResults.sessions_cleaned,
                chunks_recovered: cleanupResults.chunks_recovered,
                total_time_ms: Date.now() - startTime,
                threshold_minutes: threshold
            });
        }

        return cleanupResults;

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Advanced cleanup failed:', error.message);
        cleanupResults.health_issues.push({
            error_type: 'cleanup_failure',
            error_count: 1,
            message: error.message
        });
        return cleanupResults;
    } finally {
        client.release();
    }
}

// Legacy wrapper for compatibility
async function cleanupStuckSessions(thresholdMinutes = null) {
    const results = await advancedSessionCleanup({ thresholdMinutes });
    return results.sessions_cleaned;
}

function startAutomaticSessionCleanup() {
    // Enhanced cleanup with health monitoring
    const CLEANUP_INTERVAL = parseInt(process.env.SESSION_CLEANUP_INTERVAL || '60') * 1000; // Default: 1 minute (more aggressive)
    const HEALTH_CHECK_INTERVAL = 30000; // Health checks every 30 seconds
    const EMERGENCY_CLEANUP_INTERVAL = 15000; // Emergency cleanup every 15 seconds
    
    console.log(`🧹 Starting enhanced session cleanup system:`);
    console.log(`   📊 Health monitoring: every ${HEALTH_CHECK_INTERVAL/1000}s`);
    console.log(`   🧹 Regular cleanup: every ${CLEANUP_INTERVAL/60000}m`);
    console.log(`   🚨 Emergency cleanup: every ${EMERGENCY_CLEANUP_INTERVAL/1000}s`);
    
    // Initial comprehensive cleanup after startup
    setTimeout(async () => {
        console.log('🚀 Running initial comprehensive cleanup...');
        const results = await advancedSessionCleanup({ 
            thresholdMinutes: 5,  // Aggressive startup cleanup
            enableHealthCheck: true,
            enableOrphanCleanup: true,
            enableMemoryCleanup: true 
        });
        
        console.log(`✅ Startup cleanup complete:`, {
            sessions_cleaned: results.sessions_cleaned,
            chunks_recovered: results.chunks_recovered,
            memory_freed: results.memory_freed
        });
    }, 10000); // Wait 10s after startup
    
    // Main enhanced cleanup interval 
    setInterval(async () => {
        try {
            const results = await advancedSessionCleanup();
            
            // Log detailed results for monitoring
            if (results.sessions_cleaned > 0 || results.chunks_recovered > 0 || results.health_issues.length > 0) {
                console.log(`🔍 Health monitoring results:`, {
                    timestamp: results.timestamp,
                    sessions_cleaned: results.sessions_cleaned,
                    chunks_recovered: results.chunks_recovered,
                    health_issues: results.health_issues.length,
                    database_response_ms: results.performance_metrics.database?.response_time_ms
                });
                
                // Alert on significant issues
                if (results.health_issues.length > 0) {
                    console.warn(`⚠️ Health issues detected:`, results.health_issues);
                }
            }
        } catch (error) {
            console.error('❌ Enhanced cleanup failed:', error.message);
        }
    }, CLEANUP_INTERVAL);
    
    // Emergency cleanup for critical stuck sessions (heartbeat-only)
    setInterval(async () => {
        try {
            const results = await advancedSessionCleanup({ 
                enableHealthCheck: true,  // Only heartbeat monitoring
                enableOrphanCleanup: false,
                enableMemoryCleanup: false,
                thresholdMinutes: 2  // Very short threshold for emergency
            });
            
            if (results.sessions_cleaned > 0) {
                console.log(`🚨 Emergency cleanup: ${results.sessions_cleaned} critical sessions recovered`);
            }
        } catch (error) {
            console.error('❌ Emergency cleanup failed:', error.message);
        }
    }, EMERGENCY_CLEANUP_INTERVAL);
}

// Initialize database and start server
async function startServer() {
    console.log('🚀 Starting AutoLlama API server with real-time PostgreSQL...');
    
    // Initialize database connection
    const dbReady = await db.initializeDatabase();
    if (!dbReady) {
        console.error('❌ Failed to initialize database. Exiting...');
        process.exit(1);
    }
    
    console.log('🔧 Database initialization completed, proceeding to API configuration...');
    
    // Always setup documentation routes (they don't depend on external services)
    try {
        console.log('📚 Setting up API documentation routes...');
        const docsRoutes = require('./src/routes/docs.routes');
        app.use('/', docsRoutes);
        console.log('✅ API documentation routes enabled successfully');
    } catch (error) {
        console.warn('⚠️ Documentation routes setup failed:', error.message);
    }

    // Register critical server.js routes BEFORE service initialization
    // This ensures routes are available even if service initialization fails
    console.log('📋 Registering critical SERVER.JS routes before service initialization...');
    
    // NEW: Get all chunks for a specific document by URL with pagination (moved before documentId to avoid conflicts)
    // NEW: Document chunks API that properly handles URLs with query parameters (fixes encoding issues)
    console.log('📋 Registering SERVER.JS route: GET /api/document-chunks');
    app.get('/api/document-chunks', async (req, res) => {  
        console.log('🟢 SERVER.JS route handling /api/document-chunks');
        try {
            const url = req.query.url;
            const chunkIndex = req.query.index ? parseInt(req.query.index) : null;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 100;
            
            if (!url) {
                return res.status(400).json({ 
                    error: 'Missing required parameter',
                    message: 'URL parameter is required'
                });
            }
            
            // If index is specified, get that specific chunk
            if (chunkIndex !== null && !isNaN(chunkIndex)) {
                console.log(`   URL: ${url}`);
                console.log(`   Index: ${chunkIndex}`);
                const startTime = Date.now();
                
                // Get the specific chunk by index, handling duplicates by taking the first one
                const query = `
                    SELECT 
                        id, chunk_id, chunk_index, title, summary, chunk_text,
                        sentiment, emotions, category, content_type, technical_level,
                        main_topics, key_concepts, tags, key_entities,
                        embedding_status, processing_status, created_time, processed_date,
                        contextual_summary, uses_contextual_embedding
                    FROM processed_content
                    WHERE url = $1 AND chunk_index = $2
                    ORDER BY created_time ASC
                    LIMIT 1
                `;
                
                const result = await db.pool.query(query, [url, chunkIndex]);
                const responseTime = Date.now() - startTime;
                
                if (result.rows.length === 0) {
                    console.log(`❌ Chunk ${chunkIndex} not found for document`);
                    return res.status(404).json({ 
                        error: 'Chunk not found',
                        message: `Chunk with index ${chunkIndex} not found for this document`
                    });
                }
                
                const chunk = result.rows[0];
                const formattedChunk = {
                    id: chunk.id,
                    chunkId: chunk.chunk_id,
                    chunkIndex: chunk.chunk_index,
                    title: chunk.title,
                    summary: chunk.summary,
                    chunkText: chunk.chunk_text,
                    sentiment: chunk.sentiment,
                    emotions: chunk.emotions,
                    category: chunk.category,
                    contentType: chunk.content_type,
                    technicalLevel: chunk.technical_level,
                    mainTopics: chunk.main_topics,
                    keyConcepts: chunk.key_concepts,
                    tags: chunk.tags,
                    keyEntities: chunk.key_entities,
                    embeddingStatus: chunk.embedding_status,
                    processingStatus: chunk.processing_status,
                    createdTime: chunk.created_time,
                    processedDate: chunk.processed_date,
                    contextualSummary: chunk.contextual_summary,
                    usesContextualEmbedding: chunk.uses_contextual_embedding
                };
                
                console.log(`✅ Chunk by index API completed in ${responseTime}ms`);
                console.log(`   Found chunk: ${chunk.chunk_id} with ${chunk.chunk_text ? chunk.chunk_text.length : 0} chars`);
                
                return res.json({ chunk: formattedChunk });
            }
            
            // Otherwise, use normal pagination
            console.log(`🧩 Document chunks API called (query-based):`);
            console.log(`   URL: ${url}`);
            console.log(`   Page: ${page}, Limit: ${limit}`);
            const startTime = Date.now();
            
            // Debug database availability
            console.log('🔍 Database object keys:', Object.keys(db));
            console.log('🔍 getDocumentChunks function available:', typeof db.getDocumentChunks);
            
            // Use direct import as fallback
            let result;
            if (!db.getDocumentChunks) {
                console.log('🔄 Using direct database import');
                const dbModule = require('./database');
                console.log('🔍 Database module keys:', Object.keys(dbModule));
                result = await dbModule.getDocumentChunks(url, page, limit);
            } else {
                result = await db.getDocumentChunks(url, page, limit);
            }
            
            const responseTime = Date.now() - startTime;
            
            console.log(`✅ Document chunks API completed in ${responseTime}ms`);
            console.log(`   Found ${result.chunks.length} chunks (page ${result.pagination.currentPage}/${result.pagination.totalPages})`);
            
            res.json(result);
        } catch (error) {
            console.error('Error fetching document chunks:', error);
            res.status(500).json({ 
                error: 'Failed to fetch chunks',
                message: error.message 
            });
        }
    });

    console.log('✅ Critical SERVER.JS routes registered successfully');

    // Initialize new service container architecture (Phase 2 - Complete)
    try {
        console.log('🔧 Initializing new service container architecture...');
        
        // Initialize all services with proper dependency injection
        services = await initializeServices();
        console.log('✅ Service container initialized with', Object.keys(services).length, 'services');
        
        // Enable new route system with background processing
        setupRoutes(app, services);
        routesEnabled = true;
        console.log('✅ New route system enabled with background processing');
        console.log('✅ All processing now runs independently of user connections');
        
    } catch (error) {
        console.error('❌ New service container initialization failed:', error.message);
        console.error('Stack:', error.stack);
        
        // Fallback to database-only mode
        console.log('🔧 Falling back to basic database-only mode...');
        const fallbackServices = {
            database: db 
        };
        try {
            setupRoutes(app, fallbackServices);
            console.log('⚠️ Fallback route system enabled (limited functionality)');
        } catch (fallbackError) {
            console.error('❌ Fallback route system also failed:', fallbackError.message);
        }
    }
    
    // Initialize API configuration from database
    console.log('🔧 About to initialize API configuration...');
    const configReady = await initializeApiConfiguration();
    console.log(`🔧 API configuration result: ${configReady}`);
    
    console.log('🔧 Configuration completed, proceeding to WebSocket...');
    
    // WebSocket server is now handled by the service container
    console.log('✅ WebSocket services managed by service container');
    
    // Add working file upload route with busboy (already available)
    app.post('/api/process-file-stream', async (req, res) => {
        console.log('🚀 Working file upload route called!');
        console.log('Headers:', req.headers);
        console.log('Content-Type:', req.get('content-type'));
        
        // Use busboy to parse multipart data
        const busboy = Busboy({ headers: req.headers });
        let fileBuffer = null;
        let filename = null;
        let mimetype = null;
        
        busboy.on('file', (fieldname, file, info) => {
            console.log('📁 File field received:', fieldname);
            console.log('📁 File info:', info);
            filename = info.filename;
            mimetype = info.mimeType;
            
            const chunks = [];
            file.on('data', (chunk) => {
                chunks.push(chunk);
            });
            
            file.on('end', () => {
                fileBuffer = Buffer.concat(chunks);
                console.log('📁 File buffer created, size:', fileBuffer.length);
            });
        });
        
        busboy.on('finish', async () => {
            console.log('🎯 Busboy parsing finished');
            
            if (!fileBuffer) {
                return res.status(400).json({
                    success: false,
                    error: 'File is required'
                });
            }
        
        try {
            // Get services for background processing
            if (services && services.backgroundQueue) {
                const fileData = {
                    buffer: fileBuffer,
                    originalname: filename,
                    mimetype: mimetype,
                    size: fileBuffer.length
                };
                
                const { jobId, sessionId } = await services.backgroundQueue.addFileJob(fileData, {
                    chunkSize: 1000,
                    overlap: 100,
                    enableContextualEmbeddings: true,
                    priority: 3
                });
                
                // Setup SSE response
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Cache-Control'
                });
                
                res.write(`data: ${JSON.stringify({
                    event: 'queued',
                    data: {
                        sessionId,
                        jobId,
                        filename: filename,
                        message: 'File uploaded successfully - processing in background',
                        canCloseTab: true,
                        processingIndependent: true
                    },
                    timestamp: new Date().toISOString()
                })}\\n\\n`);
                
                console.log('🎉 File uploaded successfully, background processing started');
                console.log('Job ID:', jobId);
                console.log('Session ID:', sessionId);
                
            } else {
                res.json({
                    success: true,
                    message: 'File uploaded successfully - background processing service not available',
                    filename: filename,
                    size: fileBuffer.length,
                    timestamp: new Date().toISOString()
                });
            }
            
        } catch (error) {
            console.error('❌ File processing error:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
        });
        
        busboy.on('error', (err) => {
            console.error('❌ Busboy error:', err);
            res.status(500).json({
                success: false,
                error: 'File upload parsing error',
                timestamp: new Date().toISOString()
            });
        });
        
        req.pipe(busboy);
    });
    
    // Validate required environment variables before starting server
    function validateEnvironment() {
        // Critical startup variables - cannot proceed without these
        const critical = ['DATABASE_URL'];
        const missing = critical.filter(key => !process.env[key] || process.env[key].trim() === '');
        
        if (missing.length > 0) {
            console.error('❌ STARTUP ERROR: Missing critical environment variables:');
            missing.forEach(key => console.error(`   - ${key}`));
            console.error('');
            console.error('Please set these environment variables before starting the server.');
            console.error('See .env.example for configuration guidance.');
            process.exit(1);
        }
        
        // Optional variables that can be configured via Settings UI
        const optional = ['OPENAI_API_KEY', 'QDRANT_URL', 'QDRANT_API_KEY'];
        const missingOptional = optional.filter(key => !process.env[key] || process.env[key].trim() === '');
        
        if (missingOptional.length > 0) {
            console.log('⚠️  Optional environment variables not set (can be configured via Settings UI):');
            missingOptional.forEach(key => console.log(`   - ${key}`));
            console.log('');
        }
        
        console.log('✅ Environment validation passed - server can start');
    }
    
    // Validate environment before starting
    validateEnvironment();
    
    // Start the Express server
    app.listen(PORT, () => {
        console.log(`AutoLlama API server running on port ${PORT}`);
        console.log(`🔌 Database: PostgreSQL with hybrid caching`);
        console.log(`📋 Endpoints:`);
        console.log(`   GET /api/recent-records - Smart content mix (real-time + cached)`);
        console.log(`   GET /api/in-progress - Real-time active sessions`);
        console.log(`   GET /health - Health check with database status`);
        console.log('✅ Server ready for real-time performance!');
        
        // Start automatic session cleanup
        startAutomaticSessionCleanup();
    });
}

startServer().catch(error => {
    console.error('💥 Failed to start server:', error);
    process.exit(1);
});