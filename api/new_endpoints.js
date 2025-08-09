/**
 * New PostgreSQL-powered API endpoints for AutoLlama
 * These replace the slow Airtable-based endpoints with real-time performance
 */

const db = require('./database');

// Import at the top of server.js
// const db = require('./database');

// Add this after the existing imports and before the app initialization
async function initializeDatabase() {
    const dbReady = await db.initDatabase();
    if (!dbReady) {
        console.error('❌ Failed to initialize database. Exiting...');
        process.exit(1);
    }
}

// Call this during app startup (add after app initialization)
// initializeDatabase();

// REPLACE the existing /api/recent-records endpoint with this:
const newRecentRecordsEndpoint = `
app.get('/api/recent-records', async (req, res) => {
    try {
        console.log('⚡ SMART RECENT RECORDS API CALLED');
        const startTime = Date.now();
        
        // Get smart content mix (real-time recent + cached historical)
        const result = await db.getSmartContentMix();
        
        const responseTime = Date.now() - startTime;
        console.log(\`📊 Smart content delivered in \${responseTime}ms\`);
        console.log(\`   📈 Recent: \${result.metadata.recent_count}, Historical: \${result.metadata.historical_count}\`);
        
        // Add performance headers
        res.set({
            'X-Response-Time': \`\${responseTime}ms\`,
            'X-Data-Source': 'postgresql-hybrid',
            'X-Recent-Count': result.metadata.recent_count,
            'X-Historical-Count': result.metadata.historical_count,
            'X-Cache-Status': result.metadata.cache_status
        });
        
        res.json(result.records);
        
    } catch (error) {
        console.error('❌ Error in smart recent records:', error.message);
        console.error(error.stack);
        
        // Fallback: return sample data to keep UI functional
        const fallbackData = [
            {
                id: 'fallback-1',
                url: 'https://fallback.example.com',
                title: 'Service Temporarily Unavailable',
                summary: 'The content service is temporarily unavailable. Please try again in a moment.',
                sentiment: 'Neutral',
                category: 'System',
                content_type: 'notice',
                embedding_status: 'complete',
                created_time: new Date().toISOString(),
                data_source: 'fallback'
            }
        ];
        
        res.status(200).json(fallbackData); // Return 200 to keep UI working
    }
});
`;

// REPLACE the existing /api/in-progress endpoint with this:
const newInProgressEndpoint = `
app.get('/api/in-progress', async (req, res) => {
    try {
        console.log('⚡ REAL-TIME IN-PROGRESS API CALLED');
        const startTime = Date.now();
        
        // Get active sessions (always real-time, no caching)
        const sessions = await db.getActiveUploadSessions();
        
        const responseTime = Date.now() - startTime;
        console.log(\`📊 In-progress sessions delivered in \${responseTime}ms\`);
        console.log(\`   🔄 Active sessions: \${sessions.length}\`);
        
        // Transform to match frontend expectations
        const transformedSessions = sessions.map(session => ({
            id: session.id,
            url: session.url,
            filename: session.filename || 'Unknown File',
            title: session.title || session.filename || 'Processing...',
            totalChunks: session.total_chunks || 0,
            completedChunks: session.completed_chunks || session.processed_chunks || 0,
            processedChunks: session.processed_chunks || 0,
            status: session.status,
            lastActivity: session.last_activity,
            createdAt: session.created_at
        }));
        
        // Add performance headers
        res.set({
            'X-Response-Time': \`\${responseTime}ms\`,
            'X-Data-Source': 'postgresql-realtime',
            'X-Active-Sessions': sessions.length
        });
        
        res.json(transformedSessions);
        
    } catch (error) {
        console.error('❌ Error in real-time in-progress:', error.message);
        
        // Return empty array to keep UI functional
        res.status(200).json([]);
    }
});
`;

// ADD new search endpoint for enhanced performance:
const newSearchEndpoint = `
app.get('/api/search', async (req, res) => {
    try {
        const searchTerm = req.query.q || '';
        const limit = parseInt(req.query.limit) || 50;
        
        console.log(\`🔍 SMART SEARCH API CALLED: "\${searchTerm}"\`);
        const startTime = Date.now();
        
        if (!searchTerm.trim()) {
            // No search term - return smart content mix
            const result = await db.getSmartContentMix();
            return res.json(result.records);
        }
        
        // Perform smart search across recent + historical
        const results = await db.searchContent(searchTerm, limit);
        
        const responseTime = Date.now() - startTime;
        console.log(\`📊 Search results delivered in \${responseTime}ms\`);
        console.log(\`   🎯 Found: \${results.length} matches\`);
        
        res.set({
            'X-Response-Time': \`\${responseTime}ms\`,
            'X-Data-Source': 'postgresql-search',
            'X-Results-Count': results.length,
            'X-Search-Term': searchTerm
        });
        
        res.json(results);
        
    } catch (error) {
        console.error('❌ Error in smart search:', error.message);
        res.status(500).json({ error: 'Search temporarily unavailable' });
    }
});
`;

// ADD database statistics endpoint for monitoring:
const newStatsEndpoint = `
app.get('/api/stats', async (req, res) => {
    try {
        console.log('📊 DATABASE STATS API CALLED');
        const stats = await db.getDatabaseStats();
        
        res.json({
            ...stats,
            performance: {
                database: 'postgresql',
                caching: 'hybrid',
                real_time_cutoff: '24_hours'
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error getting database stats:', error.message);
        res.status(500).json({ error: 'Stats temporarily unavailable' });
    }
});
`;

// Health check endpoint that includes database status:
const newHealthEndpoint = `
app.get('/health', async (req, res) => {
    try {
        const dbConnected = await db.testConnection();
        const stats = dbConnected ? await db.getDatabaseStats() : null;
        
        res.json({
            status: 'healthy',
            database: dbConnected ? 'connected' : 'disconnected',
            performance_mode: 'hybrid_realtime',
            stats: stats,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});
`;

console.log('📋 NEW API ENDPOINTS READY:');
console.log('');
console.log('REPLACE /api/recent-records with:');
console.log(newRecentRecordsEndpoint);
console.log('');
console.log('REPLACE /api/in-progress with:');
console.log(newInProgressEndpoint);
console.log('');
console.log('ADD /api/search:');
console.log(newSearchEndpoint);
console.log('');
console.log('ADD /api/stats:');
console.log(newStatsEndpoint);
console.log('');
console.log('REPLACE /health with:');
console.log(newHealthEndpoint);

module.exports = {
    newRecentRecordsEndpoint,
    newInProgressEndpoint,
    newSearchEndpoint,
    newStatsEndpoint,
    newHealthEndpoint
};