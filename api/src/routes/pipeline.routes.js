/**
 * Pipeline Management Routes
 * Handles pipeline operations and streaming endpoints
 */

const express = require('express');
const router = express.Router();

/**
 * Route definitions for pipeline management:
 * 
 * GET /pipeline/download - Download pipeline data
 * GET /stream - Server-sent events stream
 */

// Global SSE clients for broadcasting processing events
const globalSSEClients = new Set();

// Placeholder for controller integration (Day 7)
// const pipelineController = require('../controllers/pipeline.controller');

router.get('/pipeline/download', (req, res) => {
  res.status(501).json({ 
    error: 'Route extraction in progress',
    message: 'This endpoint will be implemented in Day 6-7 of refactoring'
  });
});

/**
 * Server-Sent Events endpoint for real-time updates
 * GET /api/stream
 */

// Handle preflight OPTIONS requests for SSE
router.options('/stream', (req, res) => {
  console.log('📡 SSE OPTIONS request received from:', req.get('Origin'));
  const origin = req.get('Origin');
  
  res.writeHead(204, {
    'Access-Control-Allow-Origin': origin || 'https://autollama.io',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Cache-Control, Content-Type, Authorization, X-Requested-With, Last-Event-ID',
    'Access-Control-Allow-Credentials': 'false',
    'Access-Control-Max-Age': '86400'
  });
  res.end();
});

router.get('/stream', (req, res) => {
  const origin = req.get('Origin');
  console.log('📡 New SSE connection established from origin:', origin);
  
  // Set SSE headers with explicit CORS for EventSource
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': origin || 'https://autollama.io',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Cache-Control, Content-Type, Authorization, X-Requested-With, Last-Event-ID',
    'Access-Control-Allow-Credentials': 'false'
  });
  
  // Add this client to global broadcast list
  globalSSEClients.add(res);
  
  // Send initial connection event
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    timestamp: new Date().toISOString(),
    message: 'SSE connection established (new middleware)',
    version: '2.1'
  })}\n\n`);
  
  // Keep connection alive with periodic heartbeat
  const heartbeat = setInterval(() => {
    if (!res.destroyed) {
      res.write(`data: ${JSON.stringify({
        type: 'heartbeat',
        timestamp: new Date().toISOString()
      })}\n\n`);
    }
  }, 30000); // Every 30 seconds
  
  // Clean up on client disconnect
  req.on('close', () => {
    console.log('📡 SSE connection closed (new route system)');
    clearInterval(heartbeat);
    globalSSEClients.delete(res);
  });
  
  req.on('end', () => {
    console.log('📡 SSE connection ended (new route system)');
    clearInterval(heartbeat);
    globalSSEClients.delete(res);
  });
});

/**
 * Function to broadcast processing events to all SSE clients
 * @param {Object} eventData - Event data to broadcast
 */
function broadcastToSSEClients(eventData) {
  if (globalSSEClients.size > 0) {
    console.log(`📡 Broadcasting to ${globalSSEClients.size} SSE clients (new system):`, eventData.step);
  }
  globalSSEClients.forEach(client => {
    if (!client.destroyed) {
      try {
        client.write(`data: ${JSON.stringify(eventData)}\n\n`);
      } catch (error) {
        console.error('Failed to broadcast to SSE client (new system):', error);
        globalSSEClients.delete(client);
      }
    } else {
      globalSSEClients.delete(client);
    }
  });
}

// Export the broadcast function for use by other modules
module.exports = router;
module.exports.broadcastToSSEClients = broadcastToSSEClients;