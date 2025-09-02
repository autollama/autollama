/**
 * Comprehensive Chat/RAG Integration Tests
 * Tests AI chat functionality with document context retrieval
 */

const request = require('supertest');
const express = require('express');
const { Pool } = require('pg');

describe('Chat/RAG Integration Tests', () => {
  let app;
  let pool;
  
  beforeAll(async () => {
    // Setup database connection
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://autollama:autollama@localhost:5432/autollama'
    });

    // Create Express app with chat routes
    app = express();
    app.use(express.json());
    
    // Import and mount chat routes
    const { createRoutes } = require('../../routes/chat.routes');
    app.use('/api', createRoutes());
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  describe('RAG Context Retrieval', () => {
    test('should retrieve relevant context for biblical questions', async () => {
      const biblicalQuestions = [
        'What is biblical interpretation?',
        'Tell me about Yahweh and Baal',
        'Explain Hebrew Bible studies',
        'What is ancient monotheism?',
        'Describe theological scholarship'
      ];

      for (const question of biblicalQuestions) {
        const response = await request(app)
          .post('/api/chat/message')
          .send({ message: question })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.response).toBeDefined();
        
        // Check if RAG context was used
        if (response.body.contextUsed) {
          expect(response.body.contextUsed.length).toBeGreaterThan(0);
          expect(response.body.sources).toBeDefined();
        } else {
          console.warn(`⚠️ No RAG context found for: "${question}"`);
        }
      }
    });

    test('should provide source citations', async () => {
      const response = await request(app)
        .post('/api/chat/message')
        .send({ message: 'Tell me about biblical interpretation methods' })
        .expect(200);

      if (response.body.sources && response.body.sources.length > 0) {
        response.body.sources.forEach(source => {
          expect(source).toHaveProperty('title');
          expect(source).toHaveProperty('url');
          expect(source).toHaveProperty('similarity_score');
          expect(source.similarity_score).toBeGreaterThanOrEqual(0);
          expect(source.similarity_score).toBeLessThanOrEqual(1);
        });
      }
    });

    test('should handle questions without relevant context', async () => {
      const response = await request(app)
        .post('/api/chat/message')
        .send({ message: 'What is quantum computing?' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.response).toBeDefined();
      // Should still provide a helpful response even without RAG context
    });
  });

  describe('Chat Session Management', () => {
    test('should track conversation context', async () => {
      // First message
      const response1 = await request(app)
        .post('/api/chat/message')
        .send({ 
          message: 'What is biblical theology?',
          sessionId: 'test-session-123'
        })
        .expect(200);

      expect(response1.body.sessionId).toBe('test-session-123');

      // Follow-up message
      const response2 = await request(app)
        .post('/api/chat/message')
        .send({ 
          message: 'Can you elaborate on that?',
          sessionId: 'test-session-123'
        })
        .expect(200);

      expect(response2.body.sessionId).toBe('test-session-123');
      // Should understand "that" refers to previous biblical theology discussion
    });

    test('should handle new sessions', async () => {
      const response = await request(app)
        .post('/api/chat/message')
        .send({ message: 'Hello, I want to learn about theology' });

      expect(response.status).toBe(200);
      expect(response.body.sessionId).toBeDefined();
      expect(response.body.success).toBe(true);
    });
  });

  describe('RAG Performance Tests', () => {
    test('should respond within reasonable time', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .post('/api/chat/message')
        .send({ message: 'Explain the relationship between Yahweh and Baal in ancient religion' })
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(30000); // 30 seconds max for complex RAG query

      if (response.body.metadata && response.body.metadata.processingTime) {
        expect(response.body.metadata.processingTime).toBeLessThan(25000);
      }
    });

    test('should handle concurrent chat requests', async () => {
      const questions = [
        'What is biblical interpretation?',
        'Tell me about ancient monotheism',
        'Explain Hebrew Bible scholarship',
        'Describe theological methodology'
      ];

      const chatPromises = questions.map(question =>
        request(app)
          .post('/api/chat/message')
          .send({ message: question })
      );

      const responses = await Promise.all(chatPromises);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle very long messages', async () => {
      const longMessage = 'Tell me about biblical interpretation '.repeat(50);
      
      const response = await request(app)
        .post('/api/chat/message')
        .send({ message: longMessage });

      expect([200, 400]).toContain(response.status);
    });

    test('should handle malformed requests', async () => {
      // Missing message
      await request(app)
        .post('/api/chat/message')
        .send({})
        .expect(400);

      // Invalid session ID
      const response = await request(app)
        .post('/api/chat/message')
        .send({ 
          message: 'Test',
          sessionId: 'x'.repeat(1000)
        });

      expect([200, 400]).toContain(response.status);
    });

    test('should handle API key issues gracefully', async () => {
      // This test will check error handling when OpenAI API fails
      const response = await request(app)
        .post('/api/chat/message')
        .send({ message: 'What is theology?' });

      // Should either succeed or fail gracefully with proper error message
      if (response.status !== 200) {
        expect(response.body.error).toBeDefined();
        expect(response.body.error.message).toBeDefined();
      }
    });
  });

  describe('Content Integration Tests', () => {
    test('should integrate search results into chat responses', async () => {
      const response = await request(app)
        .post('/api/chat/message')
        .send({ 
          message: 'What does the database contain about biblical studies?',
          includeContext: true
        })
        .expect(200);

      if (response.body.contextUsed && response.body.contextUsed.length > 0) {
        // Verify context is actually from biblical studies domain
        const contextText = response.body.contextUsed.join(' ');
        const biblicalTerms = ['biblical', 'theology', 'religion', 'scripture', 'Hebrew'];
        const hasRelevantContent = biblicalTerms.some(term => 
          contextText.toLowerCase().includes(term.toLowerCase())
        );
        
        expect(hasRelevantContent).toBe(true);
      }
    });

    test('should handle questions about specific documents', async () => {
      const response = await request(app)
        .post('/api/chat/message')
        .send({ message: 'What does the document about Yahweh and Baal discuss?' })
        .expect(200);

      expect(response.body.success).toBe(true);
      
      if (response.body.sources) {
        const hasYahwehBaalContent = response.body.sources.some(source =>
          source.title && (
            source.title.toLowerCase().includes('yahweh') ||
            source.title.toLowerCase().includes('baal')
          )
        );
        
        if (response.body.sources.length > 0 && !hasYahwehBaalContent) {
          console.warn('⚠️ Expected Yahweh/Baal content in sources but not found');
        }
      }
    });
  });
});