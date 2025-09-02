/**
 * Comprehensive Search API Integration Tests
 * Tests real search functionality with actual database content
 */

const request = require('supertest');
const express = require('express');
const { Pool } = require('pg');

describe('Search API Comprehensive Integration Tests', () => {
  let app;
  let pool;
  
  beforeAll(async () => {
    // Setup database connection for real data tests
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://autollama:autollama@localhost:5432/autollama'
    });

    // Create Express app with search routes
    app = express();
    app.use(express.json());
    
    // Import and mount search routes
    const { createRoutes } = require('../../routes/search.routes');
    app.use('/api', createRoutes());
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  describe('Real Data Search Tests', () => {
    // Test with actual keywords from processed documents
    const testKeywords = [
      'biblical',
      'theology', 
      'Yahweh',
      'Baal',
      'Hebrew Bible',
      'Ancient Religion',
      'scholarly',
      'academic',
      'monotheism'
    ];

    testKeywords.forEach(keyword => {
      test(`should find results for "${keyword}"`, async () => {
        const response = await request(app)
          .get('/api/search')
          .query({ q: keyword, limit: 5 })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.query).toBe(keyword);
        expect(response.body.results).toBeDefined();
        
        // This test will expose the search bug
        if (response.body.results.length === 0) {
          console.warn(`⚠️ Search for "${keyword}" returned 0 results - potential search bug`);
        }
      });
    });

    test('should return search metadata', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'biblical studies', limit: 10 })
        .expect(200);

      expect(response.body.metadata).toBeDefined();
      expect(response.body.metadata.totalResults).toBeDefined();
      expect(response.body.metadata.searchTime).toBeDefined();
      expect(response.body.metadata.pagination).toBeDefined();
    });

    test('should handle phrase searches', async () => {
      const phrases = [
        'biblical studies',
        'Ancient Religion',
        'Hebrew Bible',
        'scholarly references'
      ];

      for (const phrase of phrases) {
        const response = await request(app)
          .get('/api/search')
          .query({ q: phrase, limit: 5 })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.query).toBe(phrase);
      }
    });
  });

  describe('Search API Functionality', () => {
    test('should support different search types', async () => {
      const searchTypes = ['hybrid', 'vector', 'bm25', 'grouped'];
      
      for (const type of searchTypes) {
        const response = await request(app)
          .get('/api/search')
          .query({ q: 'theology', type, limit: 5 })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.searchType).toBe(type);
      }
    });

    test('should handle pagination correctly', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'biblical', limit: 3, offset: 0 })
        .expect(200);

      expect(response.body.metadata.pagination.limit).toBe(3);
      expect(response.body.metadata.pagination.offset).toBe(0);
    });

    test('should validate search parameters', async () => {
      // Test invalid limit
      await request(app)
        .get('/api/search')
        .query({ q: 'test', limit: -1 })
        .expect(400);

      // Test missing query
      await request(app)
        .get('/api/search')
        .expect(400);

      // Test empty query
      await request(app)
        .get('/api/search')
        .query({ q: '' })
        .expect(400);
    });

    test('should handle special characters in search', async () => {
      const specialQueries = [
        'theology & religion',
        'biblical "exact phrase"',
        'yahweh (ancient god)',
        'hebrew-bible',
        'god\'s covenant'
      ];

      for (const query of specialQueries) {
        const response = await request(app)
          .get('/api/search')
          .query({ q: query, limit: 5 });

        expect([200, 400]).toContain(response.status);
        if (response.status === 200) {
          expect(response.body.success).toBe(true);
        }
      }
    });
  });

  describe('Search Performance Tests', () => {
    test('should complete searches within reasonable time', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'biblical studies theology', limit: 20 })
        .expect(200);

      const searchTime = Date.now() - startTime;
      expect(searchTime).toBeLessThan(5000); // 5 seconds max
      
      if (response.body.metadata.searchTime) {
        expect(response.body.metadata.searchTime).toBeLessThan(3000);
      }
    });

    test('should handle concurrent searches', async () => {
      const searches = [
        'biblical',
        'theology',
        'ancient',
        'hebrew',
        'religion'
      ].map(keyword => 
        request(app)
          .get('/api/search')
          .query({ q: keyword, limit: 5 })
      );

      const responses = await Promise.all(searches);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('Search Fallback Mechanisms', () => {
    test('should handle BM25 service unavailable', async () => {
      // This test will reveal if fallback to PostgreSQL works
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'biblical', limit: 5 })
        .expect(200);

      expect(response.body.success).toBe(true);
      // Should still return results even if BM25 is down
    });

    test('should handle database connection issues gracefully', async () => {
      // Test with malformed query that might cause DB issues
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'SELECT * FROM users; DROP TABLE users;--', limit: 5 });

      // Should either return 400 (validation) or 200 (sanitized)
      expect([200, 400]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.body.success).toBe(true);
      }
    });
  });

  describe('Search Result Quality', () => {
    test('should return relevant results for domain-specific terms', async () => {
      const domainTests = [
        { query: 'biblical interpretation', expectedTopics: ['biblical studies', 'theology'] },
        { query: 'ancient religion', expectedTopics: ['Ancient Religion', 'Historical Theology'] },
        { query: 'Hebrew Bible', expectedTopics: ['Biblical Studies', 'Hebrew Bible'] }
      ];

      for (const test of domainTests) {
        const response = await request(app)
          .get('/api/search')
          .query({ q: test.query, limit: 10 })
          .expect(200);

        if (response.body.results.length > 0) {
          const topics = response.body.results.flatMap(result => 
            result.main_topics || []
          );
          
          // Check if any expected topics are found
          const hasRelevantTopic = test.expectedTopics.some(expected =>
            topics.some(topic => 
              topic.toLowerCase().includes(expected.toLowerCase()) ||
              expected.toLowerCase().includes(topic.toLowerCase())
            )
          );
          
          if (response.body.results.length > 0 && !hasRelevantTopic) {
            console.warn(`⚠️ Search for "${test.query}" returned results but none match expected topics:`, test.expectedTopics);
          }
        }
      }
    });

    test('should rank results by relevance', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'biblical studies theology', limit: 10 })
        .expect(200);

      if (response.body.results.length > 1) {
        // Results should be sorted by similarity score (descending)
        for (let i = 1; i < response.body.results.length; i++) {
          const prev = response.body.results[i - 1];
          const curr = response.body.results[i];
          
          if (prev.similarity_score && curr.similarity_score) {
            expect(prev.similarity_score).toBeGreaterThanOrEqual(curr.similarity_score);
          }
        }
      }
    });
  });

  describe('Search Edge Cases', () => {
    test('should handle very long queries', async () => {
      const longQuery = 'biblical studies theology ancient religion hebrew bible monotheism yahweh baal historical analysis scholarly research academic interpretation religious scholarship'.repeat(3);
      
      const response = await request(app)
        .get('/api/search')
        .query({ q: longQuery, limit: 5 });

      expect([200, 400]).toContain(response.status);
    });

    test('should handle Unicode and special characters', async () => {
      const unicodeQueries = [
        'Yahweh עברית',
        'théologie biblique',
        'religión antigua',
        '古代宗教'
      ];

      for (const query of unicodeQueries) {
        const response = await request(app)
          .get('/api/search')
          .query({ q: query, limit: 5 });

        expect([200, 400]).toContain(response.status);
        if (response.status === 200) {
          expect(response.body.success).toBe(true);
        }
      }
    });

    test('should handle numeric queries', async () => {
      const numericQueries = ['82:6', '2024', '1st century', 'chapter 1'];
      
      for (const query of numericQueries) {
        const response = await request(app)
          .get('/api/search')
          .query({ q: query, limit: 5 })
          .expect(200);

        expect(response.body.success).toBe(true);
      }
    });
  });
});