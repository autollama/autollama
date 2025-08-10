/**
 * Chunked Upload Routes
 * Handles large file uploads with progress tracking and resume capability
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// Database and services
const db = require('../../database');

// Configure multer for chunk uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { 
    fileSize: 10 * 1024 * 1024 // 10MB per chunk
  }
});

// In-memory store for upload sessions (consider Redis for production)
const uploadSessions = new Map();

/**
 * Initialize chunked upload session
 * POST /api/upload/initialize
 */
router.post('/initialize', async (req, res) => {
  try {
    const { filename, fileSize, fileType, totalChunks, enableContextual, source } = req.body;

    // Validate input
    if (!filename || !fileSize || !totalChunks) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: filename, fileSize, totalChunks'
      });
    }

    // Check file size limits (100MB)
    const maxSize = 100 * 1024 * 1024;
    if (fileSize > maxSize) {
      return res.status(413).json({
        success: false,
        error: `File too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB`
      });
    }

    const uploadId = uuidv4();
    const sessionId = uuidv4();
    const uploadDir = path.join('/tmp', 'uploads', uploadId);

    // Create upload directory
    await fs.mkdir(uploadDir, { recursive: true });

    // Create upload session record in database
    const query = `
      INSERT INTO upload_sessions (
        id, url, filename, file_size, content_type, status, 
        upload_id, total_chunks, received_chunks,
        enable_contextual, source, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      RETURNING id, upload_id, created_at
    `;
    
    const result = await db.pool.query(query, [
      sessionId, `file://${filename}`, filename, fileSize, fileType || 'application/octet-stream',
      'uploading', uploadId, totalChunks, 0,
      enableContextual || false, source || 'user'
    ]);

    // Store session in memory for fast access
    uploadSessions.set(uploadId, {
      sessionId,
      filename,
      fileSize,
      fileType,
      totalChunks: parseInt(totalChunks),
      receivedChunks: 0,
      uploadDir,
      chunks: new Set(),
      enableContextual,
      source,
      createdAt: Date.now()
    });

    console.log(`📤 Initialized chunked upload: ${filename} (${Math.round(fileSize / 1024 / 1024)}MB, ${totalChunks} chunks)`);

    res.json({
      success: true,
      uploadId,
      sessionId,
      message: 'Upload session initialized',
      maxChunkSize: 2 * 1024 * 1024, // 2MB
      totalChunks: parseInt(totalChunks)
    });

  } catch (error) {
    console.error('Failed to initialize upload:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize upload session'
    });
  }
});

/**
 * Upload individual chunk
 * POST /api/upload/chunk
 */
router.post('/chunk', upload.single('chunk'), async (req, res) => {
  try {
    const { uploadId, chunkIndex, totalChunks } = req.body;
    const chunk = req.file;

    if (!uploadId || chunkIndex === undefined || !chunk) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: uploadId, chunkIndex, chunk'
      });
    }

    const session = uploadSessions.get(uploadId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Upload session not found'
      });
    }

    const chunkIdx = parseInt(chunkIndex);
    const chunkPath = path.join(session.uploadDir, `chunk_${chunkIdx}`);

    // Write chunk to disk
    await fs.writeFile(chunkPath, chunk.buffer);

    // Update session progress
    session.chunks.add(chunkIdx);
    session.receivedChunks = session.chunks.size;

    // Update database progress
    const progressPercent = Math.round((session.receivedChunks / session.totalChunks) * 100);
    
    await db.pool.query(`
      UPDATE upload_sessions 
      SET received_chunks = $1, progress = $2, updated_at = NOW()
      WHERE upload_id = $3
    `, [session.receivedChunks, progressPercent, uploadId]);

    console.log(`📦 Received chunk ${chunkIdx + 1}/${session.totalChunks} for ${session.filename} (${progressPercent}%)`);

    res.json({
      success: true,
      chunkIndex: chunkIdx,
      receivedChunks: session.receivedChunks,
      totalChunks: session.totalChunks,
      progress: progressPercent,
      message: `Chunk ${chunkIdx + 1} uploaded successfully`
    });

  } catch (error) {
    console.error('Failed to upload chunk:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload chunk'
    });
  }
});

/**
 * Finalize upload and start processing
 * POST /api/upload/finalize
 */
router.post('/finalize', async (req, res) => {
  try {
    const { uploadId, sessionId } = req.body;

    if (!uploadId || !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: uploadId, sessionId'
      });
    }

    const session = uploadSessions.get(uploadId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Upload session not found'
      });
    }

    // Verify all chunks received
    if (session.receivedChunks !== session.totalChunks) {
      return res.status(400).json({
        success: false,
        error: `Missing chunks. Received ${session.receivedChunks}/${session.totalChunks}`,
        receivedChunks: session.receivedChunks,
        totalChunks: session.totalChunks
      });
    }

    // Reassemble file from chunks
    const finalFilePath = path.join(session.uploadDir, session.filename);
    const writeStream = (await import('fs')).createWriteStream(finalFilePath);

    for (let i = 0; i < session.totalChunks; i++) {
      const chunkPath = path.join(session.uploadDir, `chunk_${i}`);
      const chunkData = await fs.readFile(chunkPath);
      writeStream.write(chunkData);
      
      // Clean up chunk file
      await fs.unlink(chunkPath).catch(() => {});
    }

    await new Promise((resolve, reject) => {
      writeStream.end((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Update session status to processing
    await db.pool.query(`
      UPDATE upload_sessions 
      SET status = 'processing', progress = 100, file_path = $1, updated_at = NOW()
      WHERE id = $2
    `, [finalFilePath, sessionId]);

    // Mark session as ready for processing
    session.status = 'processing';
    session.filePath = finalFilePath;

    console.log(`✅ Finalized upload: ${session.filename} - starting processing`);

    res.json({
      success: true,
      message: 'Upload finalized successfully',
      sessionId,
      filename: session.filename,
      fileSize: session.fileSize,
      status: 'processing'
    });

    // Trigger processing in background (don't await)
    startFileProcessing(session).catch(error => {
      console.error(`Failed to start processing for ${session.filename}:`, error);
    });

  } catch (error) {
    console.error('Failed to finalize upload:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to finalize upload'
    });
  }
});

/**
 * Get upload progress
 * GET /api/upload/progress/:uploadId
 */
router.get('/progress/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    
    const session = uploadSessions.get(uploadId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Upload session not found'
      });
    }

    const progressPercent = Math.round((session.receivedChunks / session.totalChunks) * 100);

    res.json({
      success: true,
      uploadId,
      sessionId: session.sessionId,
      filename: session.filename,
      fileSize: session.fileSize,
      totalChunks: session.totalChunks,
      receivedChunks: session.receivedChunks,
      progress: progressPercent,
      status: session.status || 'uploading'
    });

  } catch (error) {
    console.error('Failed to get upload progress:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get upload progress'
    });
  }
});

/**
 * Connect to processing stream
 * GET /api/upload/stream/:sessionId
 */
router.get('/stream/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection event
    res.write(`data: ${JSON.stringify({
      event: 'connected',
      data: { sessionId, timestamp: new Date().toISOString() }
    })}\n\n`);

    // Store the response object for sending progress updates
    // This would integrate with the existing SSE infrastructure
    // For now, we'll simulate the connection
    const heartbeatInterval = setInterval(() => {
      res.write(`data: ${JSON.stringify({
        event: 'heartbeat',
        data: { sessionId, timestamp: new Date().toISOString() }
      })}\n\n`);
    }, 30000);

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(heartbeatInterval);
    });

  } catch (error) {
    console.error('Failed to establish stream connection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to establish stream connection'
    });
  }
});

/**
 * Start file processing (integrate with existing processing pipeline)
 */
async function startFileProcessing(session) {
  try {
    // This would integrate with the existing file processing pipeline
    // For now, we'll just update the database status
    console.log(`🔄 Starting processing for ${session.filename}`);
    
    // Update status to processing
    await db.pool.query(`
      UPDATE upload_sessions 
      SET status = 'processing', updated_at = NOW()
      WHERE id = $1
    `, [session.sessionId]);

    // Here we would trigger the existing file processing pipeline
    // that handles EPUB parsing, chunking, embedding generation, etc.
    
  } catch (error) {
    console.error('Failed to start file processing:', error);
    
    await db.pool.query(`
      UPDATE upload_sessions 
      SET status = 'failed', error_message = $1, updated_at = NOW()
      WHERE id = $2
    `, [error.message, session.sessionId]);
  }
}

// Clean up old upload sessions (run periodically)
setInterval(async () => {
  try {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    
    for (const [uploadId, session] of uploadSessions.entries()) {
      if (session.createdAt < cutoffTime) {
        // Clean up files
        try {
          await fs.rmdir(session.uploadDir, { recursive: true });
        } catch (err) {
          console.warn(`Failed to clean up upload directory: ${err.message}`);
        }
        
        // Remove from memory
        uploadSessions.delete(uploadId);
        console.log(`🗑️  Cleaned up old upload session: ${session.filename}`);
      }
    }
  } catch (error) {
    console.error('Failed to clean up old upload sessions:', error);
  }
}, 60 * 60 * 1000); // Run every hour

module.exports = router;