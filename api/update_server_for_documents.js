// This file contains the key updates needed for server.js to support Document/Chunk distinction
// These changes should be integrated into the existing server.js file

// 1. Update the processContentChunks function to create a document record first
async function processContentChunks(content, url, sseCallback = null) {
    let processedChunks = 0;
    let qdrantStored = 0;
    let airtableStored = 0;
    let documentRecord = null;
    
    // Generate session ID for tracking
    const sessionId = uuidv4();
    
    try {
        // Step 1: Chunk the text
        console.log('Chunking text...');
        const chunks = chunkText(content, url);
        console.log(`Created ${chunks.length} chunks`);
        
        // Track this processing session in memory
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
        
        // Create database session for URL processing (same as file uploads)
        let uploadSession = null;
        try {
            const filename = url.split('/').pop() || 'Unknown URL';
            uploadSession = await createUploadSession(filename, chunks.length, url, 'user');
            console.log('Created upload session:', uploadSession.sessionId);
        } catch (error) {
            console.error('Error creating upload session:', error);
        }
        
        // IMPORTANT: Create a document record first
        try {
            // Extract title and summary from content
            const title = extractTitle(content, url);
            const summary = await generateDocumentSummary(content, url);
            
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
            
            console.log('📄 Created document record:', documentRecord.id);
            
            if (sseCallback) {
                sseCallback({
                    type: 'document_created',
                    documentId: documentRecord.id,
                    title: title,
                    totalChunks: chunks.length
                });
            }
        } catch (error) {
            console.error('Error creating document record:', error);
            // Continue processing even if document creation fails
        }
        
        // Step 2: Process chunks with contextual embeddings
        // ... rest of the existing code ...
        
        // When storing each chunk, link it to the parent document
        // This happens in the storeInAirtableAndPostgres function
    } catch (error) {
        console.error('Error in processContentChunks:', error);
        throw error;
    }
}

// 2. Update storeInAirtableAndPostgres to handle document linking
async function storeInAirtableAndPostgres(chunkData, uploadSource = 'user', parentDocumentId = null) {
    try {
        console.log('\n=== STARTING POSTGRESQL STORAGE ===');
        
        const contentData = {
            url: chunkData.fields.URL,
            title: chunkData.fields.Title,
            summary: chunkData.fields.Summary,
            chunk_text: chunkData.fields['Chunk Text'],
            chunk_id: chunkData.fields['Chunk ID'],
            chunk_index: chunkData.fields['Chunk Index'],
            sentiment: chunkData.fields.Sentiment,
            emotions: chunkData.fields.Emotions || [],
            category: chunkData.fields.Category,
            content_type: chunkData.fields['Content Type'],
            technical_level: chunkData.fields['Technical Level'],
            main_topics: chunkData.fields['Main Topics'] || [],
            key_concepts: chunkData.fields['Key Concepts'],
            tags: chunkData.fields.Tags,
            key_entities: chunkData.fields['Key Entities'] || {},
            embedding_status: 'pending',
            processing_status: 'completed',
            contextual_summary: chunkData.fields['Contextual Summary'] || null,
            uses_contextual_embedding: chunkData.fields['Uses Contextual Embedding'] || false,
            upload_source: uploadSource,
            record_type: 'chunk', // This is a chunk, not a document
            parent_document_id: parentDocumentId // Link to parent document
        };
        
        console.log('PostgreSQL payload:', contentData);
        
        const result = await db.addContentRecord(contentData);
        console.log('PostgreSQL storage successful!', result.id);
        return { id: result.id, status: 'success' };
    } catch (error) {
        console.error('POSTGRESQL STORAGE ERROR:', error);
        throw new Error(`Failed to store in PostgreSQL: ${error.message}`);
    }
}

// 3. Helper function to extract title from content
function extractTitle(content, url) {
    // Try to extract title from content
    const lines = content.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 10 && trimmed.length < 200) {
            // Check if it looks like a title (starts with capital, no ending punctuation)
            if (/^[A-Z]/.test(trimmed) && !/[.!?]$/.test(trimmed)) {
                return trimmed;
            }
        }
    }
    
    // Fallback to URL-based title
    const urlParts = url.split('/');
    const lastPart = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
    return lastPart.replace(/[-_]/g, ' ').replace(/\.\w+$/, '');
}

// 4. Helper function to generate document summary
async function generateDocumentSummary(content, url) {
    try {
        // Use first 2000 characters for summary generation
        const preview = content.substring(0, 2000);
        
        const response = await openai.chat.completions.create({
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

// 5. Update API endpoints to distinguish between documents and chunks
app.get('/api/documents', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        const documents = await db.getDocumentsOnly(limit, offset);
        res.json({ documents });
    } catch (error) {
        console.error('Error fetching documents:', error);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

app.get('/api/document/:documentId/chunks', async (req, res) => {
    try {
        const { documentId } = req.params;
        const chunks = await db.getChunksByDocumentId(documentId);
        res.json({ chunks });
    } catch (error) {
        console.error('Error fetching document chunks:', error);
        res.status(500).json({ error: 'Failed to fetch chunks' });
    }
});

// Note: When processing content, pass the document ID to chunk storage
// Example modification in the processing loop:
/*
for (const [index, chunk] of chunkBatch.entries()) {
    // ... existing processing code ...
    
    // Store in database with parent document link
    const { airtableId, postgresId } = await storeInAirtableAndPostgres(
        processedChunk, 
        uploadSource,
        documentRecord ? documentRecord.id : null // Pass document ID
    );
    
    // ... rest of the code ...
}
*/