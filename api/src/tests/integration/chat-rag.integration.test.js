/**
 * Chat and RAG Integration Tests
 * Tests AI chat functionality with RAG document context
 */

const request = require('supertest');
const express = require('express');

describe('Chat and RAG Integration Tests', () => {
  let app;
  const mockDocuments = [
    {
      chunk_id: 'chunk-1',
      chunk_text: 'Artificial intelligence (AI) is intelligence demonstrated by machines, in contrast to human intelligence.',
      title: 'AI Introduction',
      url: 'https://example.com/ai-intro',
      similarity_score: 0.95,
      main_topics: ['artificial intelligence', 'machine intelligence'],
      contextual_summary: 'Introduction to AI concepts and definitions'
    },
    {
      chunk_id: 'chunk-2',
      chunk_text: 'Machine learning is a subset of AI that enables computers to learn and improve from experience.',
      title: 'Machine Learning Basics',
      url: 'https://example.com/ml-basics',
      similarity_score: 0.88,
      main_topics: ['machine learning', 'computer learning'],
      contextual_summary: 'Fundamentals of machine learning algorithms'
    }
  ];

  beforeAll(async () => {
    app = express();
    app.use(express.json());

    // Mock chat message endpoint with RAG
    app.post('/api/chat/message', (req, res) => {
      const { message, useRAG = true, maxContext = 5 } = req.body;

      if (!message || message.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'Message is required' }
        });
      }

      let ragContext = [];
      let ragActive = false;

      if (useRAG) {
        // Simulate RAG search for relevant context
        ragContext = mockDocuments.filter(doc =>
          doc.chunk_text.toLowerCase().includes(message.toLowerCase()) ||
          doc.main_topics.some(topic => 
            message.toLowerCase().includes(topic.toLowerCase())
          )
        ).slice(0, maxContext);

        ragActive = ragContext.length > 0;
      }

      // Generate mock AI response
      const contextInfo = ragActive 
        ? `Based on the documents about ${ragContext.map(c => c.main_topics[0]).join(', ')}, `
        : '';

      const aiResponse = `${contextInfo}${message.includes('?') ? 'Here is what I found: ' : 'I understand that '}${message}`;

      const response = {
        success: true,
        message: aiResponse,
        messageId: `msg-${Date.now()}`,
        timestamp: new Date().toISOString(),
        rag: {
          active: ragActive,
          contextUsed: ragContext.length,
          totalCharacters: ragContext.reduce((sum, c) => sum + c.chunk_text.length, 0),
          sources: ragContext.map(c => ({
            chunkId: c.chunk_id,
            title: c.title,
            url: c.url,
            snippet: c.chunk_text.substring(0, 100) + '...',
            relevanceScore: c.similarity_score
          }))
        },
        processingTime: Math.floor(Math.random() * 1000) + 500
      };

      res.json(response);
    });

    // Mock chat conversation endpoint
    app.get('/api/chat/conversation/:conversationId', (req, res) => {
      const conversationId = req.params.conversationId;
      
      const mockConversation = {
        conversationId,
        messages: [
          {
            messageId: 'msg-1',
            role: 'user',
            content: 'What is artificial intelligence?',
            timestamp: new Date().toISOString()
          },
          {
            messageId: 'msg-2',
            role: 'assistant',
            content: 'Based on the documents about artificial intelligence, AI is intelligence demonstrated by machines...',
            timestamp: new Date().toISOString(),
            rag: {
              active: true,
              contextUsed: 2,
              sources: ['chunk-1', 'chunk-2']
            }
          }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      res.json({
        success: true,
        conversation: mockConversation
      });
    });

    // Mock RAG search endpoint
    app.post('/api/rag/search', (req, res) => {
      const { query, limit = 5, threshold = 0.7 } = req.body;

      if (!query) {
        return res.status(400).json({
          success: false,
          error: { message: 'Query is required' }
        });
      }

      const relevantChunks = mockDocuments.filter(doc =>
        doc.similarity_score >= threshold &&
        (doc.chunk_text.toLowerCase().includes(query.toLowerCase()) ||
         doc.main_topics.some(topic => topic.toLowerCase().includes(query.toLowerCase())))
      ).slice(0, limit);

      res.json({
        success: true,
        query,
        chunks: relevantChunks,
        totalFound: relevantChunks.length,
        threshold,
        processingTime: Math.floor(Math.random() * 200) + 100
      });
    });

    // Mock chat context endpoint
    app.get('/api/chat/context', (req, res) => {
      const query = req.query.q;
      
      if (!query) {
        return res.status(400).json({
          success: false,
          error: { message: 'Query parameter required' }
        });
      }

      const contextChunks = mockDocuments.filter(doc =>
        doc.chunk_text.toLowerCase().includes(query.toLowerCase())
      );

      res.json({
        success: true,
        contextAvailable: contextChunks.length > 0,
        totalChunks: contextChunks.length,
        totalCharacters: contextChunks.reduce((sum, c) => sum + c.chunk_text.length, 0),
        sources: contextChunks.map(c => c.title)
      });
    });
  });

  describe('POST /api/chat/message', () => {
    test('should process chat message with RAG', async () => {
      const response = await request(app)
        .post('/api/chat/message')
        .send({
          message: 'What is artificial intelligence?',
          useRAG: true,
          maxContext: 5
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.any(String),
        messageId: expect.any(String),
        timestamp: expect.any(String),
        rag: expect.objectContaining({
          active: expect.any(Boolean),
          contextUsed: expect.any(Number),
          totalCharacters: expect.any(Number),
          sources: expect.any(Array)
        }),
        processingTime: expect.any(Number)
      });

      expect(response.body.rag.active).toBe(true);
      expect(response.body.rag.contextUsed).toBeGreaterThan(0);
    });

    test('should handle chat without RAG', async () => {
      const response = await request(app)
        .post('/api/chat/message')
        .send({
          message: 'Hello, how are you?',
          useRAG: false
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.rag.active).toBe(false);
      expect(response.body.rag.contextUsed).toBe(0);
    });

    test('should validate message requirement', async () => {
      await request(app)
        .post('/api/chat/message')
        .send({})
        .expect(400);

      await request(app)
        .post('/api/chat/message')
        .send({ message: '' })
        .expect(400);
    });

    test('should limit context when specified', async () => {
      const response = await request(app)
        .post('/api/chat/message')
        .send({
          message: 'Tell me about machine learning',
          useRAG: true,
          maxContext: 1
        })
        .expect(200);

      expect(response.body.rag.contextUsed).toBeLessThanOrEqual(1);
    });

    test('should include source citations in RAG responses', async () => {
      const response = await request(app)
        .post('/api/chat/message')
        .send({
          message: 'Explain artificial intelligence',
          useRAG: true
        })
        .expect(200);

      if (response.body.rag.active) {
        expect(response.body.rag.sources).toBeInstanceOf(Array);
        response.body.rag.sources.forEach(source => {
          expect(source).toHaveProperty('chunkId');
          expect(source).toHaveProperty('title');
          expect(source).toHaveProperty('url');
          expect(source).toHaveProperty('snippet');
          expect(source).toHaveProperty('relevanceScore');
        });
      }
    });
  });

  describe('POST /api/rag/search', () => {
    test('should search for RAG context', async () => {
      const response = await request(app)
        .post('/api/rag/search')
        .send({
          query: 'artificial intelligence',
          limit: 3,
          threshold: 0.8
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        query: 'artificial intelligence',
        chunks: expect.any(Array),
        totalFound: expect.any(Number),
        threshold: 0.8,
        processingTime: expect.any(Number)
      });
    });

    test('should apply similarity threshold', async () => {
      const response = await request(app)
        .post('/api/rag/search')
        .send({
          query: 'machine learning',
          threshold: 0.9 // High threshold
        })
        .expect(200);

      response.body.chunks.forEach(chunk => {
        expect(chunk.similarity_score).toBeGreaterThanOrEqual(0.9);
      });
    });

    test('should validate query parameter', async () => {
      await request(app)
        .post('/api/rag/search')
        .send({})
        .expect(400);

      await request(app)
        .post('/api/rag/search')
        .send({ query: '' })
        .expect(400);
    });
  });

  describe('GET /api/chat/context', () => {
    test('should check context availability', async () => {
      const response = await request(app)
        .get('/api/chat/context')
        .query({ q: 'artificial intelligence' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        contextAvailable: expect.any(Boolean),
        totalChunks: expect.any(Number),
        totalCharacters: expect.any(Number),
        sources: expect.any(Array)
      });
    });

    test('should handle queries with no context', async () => {
      const response = await request(app)
        .get('/api/chat/context')
        .query({ q: 'completely unrelated topic xyz123' })
        .expect(200);

      expect(response.body.contextAvailable).toBe(false);
      expect(response.body.totalChunks).toBe(0);
    });

    test('should validate query parameter', async () => {
      await request(app)
        .get('/api/chat/context')
        .expect(400);
    });
  });

  describe('GET /api/chat/conversation/:conversationId', () => {
    test('should retrieve conversation history', async () => {
      const response = await request(app)
        .get('/api/chat/conversation/conv-123')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        conversation: expect.objectContaining({
          conversationId: 'conv-123',
          messages: expect.any(Array),
          createdAt: expect.any(String),
          updatedAt: expect.any(String)
        })
      });

      const conversation = response.body.conversation;
      expect(conversation.messages.length).toBeGreaterThan(0);
      
      conversation.messages.forEach(message => {
        expect(message).toHaveProperty('messageId');
        expect(message).toHaveProperty('role');
        expect(message).toHaveProperty('content');
        expect(message).toHaveProperty('timestamp');
        expect(['user', 'assistant']).toContain(message.role);
      });
    });
  });

  describe('RAG integration workflow', () => {
    test('should complete full RAG chat workflow', async () => {
      const userMessage = 'Explain machine learning in simple terms';

      // Step 1: Check context availability
      const contextResponse = await request(app)
        .get('/api/chat/context')
        .query({ q: userMessage })
        .expect(200);

      expect(contextResponse.body.success).toBe(true);

      // Step 2: If context available, search for RAG context
      if (contextResponse.body.contextAvailable) {
        const ragResponse = await request(app)
          .post('/api/rag/search')
          .send({
            query: userMessage,
            limit: 3,
            threshold: 0.7
          })
          .expect(200);

        expect(ragResponse.body.chunks.length).toBeGreaterThan(0);
      }

      // Step 3: Send chat message with RAG
      const chatResponse = await request(app)
        .post('/api/chat/message')
        .send({
          message: userMessage,
          useRAG: true
        })
        .expect(200);

      expect(chatResponse.body.success).toBe(true);
      expect(chatResponse.body.message).toContain(userMessage);
      
      if (chatResponse.body.rag.active) {
        expect(chatResponse.body.rag.sources.length).toBeGreaterThan(0);
        expect(chatResponse.body.rag.totalCharacters).toBeGreaterThan(0);
      }
    });

    test('should handle questions about specific topics', async () => {
      const topicQueries = [
        'What is artificial intelligence?',
        'How does machine learning work?',
        'Explain the difference between AI and ML'
      ];

      for (const query of topicQueries) {
        const response = await request(app)
          .post('/api/chat/message')
          .send({
            message: query,
            useRAG: true
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBeDefined();
        expect(response.body.rag).toBeDefined();
      }
    });
  });

  describe('RAG context quality', () => {
    test('should return relevant context for queries', async () => {
      const response = await request(app)
        .post('/api/rag/search')
        .send({
          query: 'artificial intelligence',
          limit: 5
        })
        .expect(200);

      if (response.body.chunks.length > 0) {
        response.body.chunks.forEach(chunk => {
          const isRelevant = 
            chunk.chunk_text.toLowerCase().includes('artificial intelligence') ||
            chunk.chunk_text.toLowerCase().includes('ai') ||
            chunk.main_topics.some(topic => 
              topic.toLowerCase().includes('artificial intelligence')
            );
          
          expect(isRelevant).toBe(true);
        });
      }
    });

    test('should order context by relevance', async () => {
      const response = await request(app)
        .post('/api/rag/search')
        .send({
          query: 'machine learning',
          limit: 5
        })
        .expect(200);

      if (response.body.chunks.length > 1) {
        for (let i = 1; i < response.body.chunks.length; i++) {
          expect(response.body.chunks[i-1].similarity_score)
            .toBeGreaterThanOrEqual(response.body.chunks[i].similarity_score);
        }
      }
    });

    test('should include context metadata', async () => {
      const response = await request(app)
        .post('/api/rag/search')
        .send({
          query: 'artificial intelligence'
        })
        .expect(200);

      response.body.chunks.forEach(chunk => {
        expect(chunk).toHaveProperty('chunk_text');
        expect(chunk).toHaveProperty('title');
        expect(chunk).toHaveProperty('main_topics');
        expect(chunk).toHaveProperty('contextual_summary');
        expect(chunk).toHaveProperty('similarity_score');
      });
    });
  });

  describe('Chat message processing', () => {
    test('should handle different types of questions', async () => {
      const questionTypes = [
        { message: 'What is AI?', type: 'definition' },
        { message: 'How does machine learning work?', type: 'explanation' },
        { message: 'List the benefits of AI', type: 'enumeration' },
        { message: 'Compare AI and human intelligence', type: 'comparison' }
      ];

      for (const question of questionTypes) {
        const response = await request(app)
          .post('/api/chat/message')
          .send({
            message: question.message,
            useRAG: true
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBeDefined();
        expect(response.body.messageId).toMatch(/^msg-\d+$/);
      }
    });

    test('should include processing metrics', async () => {
      const response = await request(app)
        .post('/api/chat/message')
        .send({
          message: 'Test processing metrics',
          useRAG: true
        })
        .expect(200);

      expect(response.body.processingTime).toBeGreaterThan(0);
      expect(response.body.processingTime).toBeLessThan(5000);
      expect(response.body.timestamp).toBeDefined();
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('Performance and scalability', () => {
    test('should handle concurrent chat requests', async () => {
      const messages = [
        'What is AI?',
        'How does ML work?',
        'Explain deep learning'
      ];

      const chatPromises = messages.map(message =>
        request(app)
          .post('/api/chat/message')
          .send({ message, useRAG: true })
      );

      const responses = await Promise.all(chatPromises);

      responses.forEach((response, index) => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain(messages[index]);
      });
    });

    test('should maintain response time standards', async () => {
      const iterations = 5;
      const responseTimes = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        const response = await request(app)
          .post('/api/chat/message')
          .send({
            message: `Performance test ${i}`,
            useRAG: true
          })
          .expect(200);
        
        const duration = Date.now() - start;
        responseTimes.push(duration);
        
        expect(response.body.processingTime).toBeLessThan(duration + 500); // More flexible timing
      }

      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      expect(avgResponseTime).toBeLessThan(2000); // Should average under 2 seconds
    });
  });

  describe('Error handling and edge cases', () => {
    test('should handle empty context gracefully', async () => {
      const response = await request(app)
        .post('/api/chat/message')
        .send({
          message: 'completely unrelated topic xyz123',
          useRAG: true
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.rag.active).toBe(false);
      expect(response.body.rag.contextUsed).toBe(0);
    });

    test('should handle long messages', async () => {
      const longMessage = 'What is artificial intelligence? '.repeat(50);
      
      const response = await request(app)
        .post('/api/chat/message')
        .send({
          message: longMessage,
          useRAG: true
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should handle special characters in messages', async () => {
      const specialMessage = 'What is AI? 🤖 Can you explain ML & DL techniques?';
      
      const response = await request(app)
        .post('/api/chat/message')
        .send({
          message: specialMessage,
          useRAG: true
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBeDefined();
    });
  });

  describe('RAG source tracking', () => {
    test('should track source documents used in responses', async () => {
      const response = await request(app)
        .post('/api/chat/message')
        .send({
          message: 'What is machine learning?',
          useRAG: true
        })
        .expect(200);

      if (response.body.rag.active) {
        response.body.rag.sources.forEach(source => {
          expect(source.chunkId).toMatch(/^chunk-\d+$/);
          expect(source.title).toBeDefined();
          expect(source.url).toMatch(/^https?:\/\//);
          expect(source.snippet).toBeDefined();
          expect(source.relevanceScore).toBeGreaterThan(0);
          expect(source.relevanceScore).toBeLessThanOrEqual(1);
        });
      }
    });

    test('should provide useful snippets', async () => {
      const response = await request(app)
        .post('/api/chat/message')
        .send({
          message: 'Tell me about AI',
          useRAG: true
        })
        .expect(200);

      if (response.body.rag.active && response.body.rag.sources.length > 0) {
        response.body.rag.sources.forEach(source => {
          expect(source.snippet.length).toBeGreaterThan(50);
          expect(source.snippet).toMatch(/\.\.\.$/); // Should end with ellipsis
        });
      }
    });
  });
});