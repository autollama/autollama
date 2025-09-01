/**
 * Embedded Qdrant Vector Database
 * 🦙 Lightweight vector search for local development
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

class EmbeddedQdrant {
  constructor(config = {}) {
    this.config = {
      port: config.port || 6333,
      dataPath: config.dataPath || './data/qdrant',
      dimension: config.dimension || 1536, // OpenAI embedding size
      ...config
    };
    
    this.collections = new Map();
    this.app = express();
    this.server = null;
  }

  /**
   * Initialize and start the embedded Qdrant server
   */
  async start() {
    // Ensure data directory exists
    await fs.ensureDir(this.config.dataPath);
    
    // Load existing collections
    await this.loadCollections();
    
    // Setup Express routes
    this.setupRoutes();
    
    // Start server
    return new Promise((resolve) => {
      this.server = this.app.listen(this.config.port, () => {
        console.log(chalk.green(`🦙 Embedded Qdrant running on port ${this.config.port}`));
        resolve();
      });
    });
  }

  /**
   * Setup Express routes to mimic Qdrant API
   */
  setupRoutes() {
    this.app.use(cors());
    this.app.use(express.json({ limit: '50mb' }));

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        version: 'embedded-1.0.0',
        collections: Array.from(this.collections.keys())
      });
    });

    // Collections API
    this.app.get('/collections', (req, res) => {
      const collections = Array.from(this.collections.entries()).map(([name, data]) => ({
        name,
        vectors_count: data.points.length,
        config: data.config
      }));
      res.json({ result: collections });
    });

    // Create collection
    this.app.put('/collections/:name', async (req, res) => {
      const { name } = req.params;
      const { vectors } = req.body;
      
      const collection = {
        name,
        config: {
          params: {
            vectors: vectors || {
              size: this.config.dimension,
              distance: 'Cosine'
            }
          }
        },
        points: [],
        nextId: 1
      };
      
      this.collections.set(name, collection);
      await this.saveCollection(name);
      
      res.json({ result: true, status: 'ok' });
    });

    // Delete collection
    this.app.delete('/collections/:name', async (req, res) => {
      const { name } = req.params;
      
      if (this.collections.has(name)) {
        this.collections.delete(name);
        await fs.remove(path.join(this.config.dataPath, `${name}.json`));
        res.json({ result: true, status: 'ok' });
      } else {
        res.status(404).json({ error: 'Collection not found' });
      }
    });

    // Get collection info
    this.app.get('/collections/:name', (req, res) => {
      const { name } = req.params;
      const collection = this.collections.get(name);
      
      if (collection) {
        res.json({
          result: {
            status: 'green',
            vectors_count: collection.points.length,
            indexed_vectors_count: collection.points.length,
            config: collection.config
          }
        });
      } else {
        res.status(404).json({ error: 'Collection not found' });
      }
    });

    // Upsert points
    this.app.put('/collections/:name/points', async (req, res) => {
      const { name } = req.params;
      const { points } = req.body;
      const collection = this.collections.get(name);
      
      if (!collection) {
        return res.status(404).json({ error: 'Collection not found' });
      }
      
      const results = [];
      
      for (const point of points) {
        // Generate ID if not provided
        const id = point.id || collection.nextId++;
        
        // Find existing point
        const existingIndex = collection.points.findIndex(p => p.id === id);
        
        const pointData = {
          id,
          vector: point.vector,
          payload: point.payload || {}
        };
        
        if (existingIndex >= 0) {
          collection.points[existingIndex] = pointData;
        } else {
          collection.points.push(pointData);
        }
        
        results.push({ id, status: 'ok' });
      }
      
      await this.saveCollection(name);
      
      res.json({ result: results, status: 'ok' });
    });

    // Search points
    this.app.post('/collections/:name/points/search', (req, res) => {
      const { name } = req.params;
      const { vector, limit = 10, filter, with_payload = true, with_vector = false } = req.body;
      const collection = this.collections.get(name);
      
      if (!collection) {
        return res.status(404).json({ error: 'Collection not found' });
      }
      
      // Calculate similarities
      const results = collection.points
        .map(point => ({
          ...point,
          score: this.cosineSimilarity(vector, point.vector)
        }))
        .filter(point => {
          // Apply filters if provided
          if (filter && filter.must) {
            for (const condition of filter.must) {
              if (condition.key && condition.match) {
                const value = point.payload[condition.key];
                if (value !== condition.match.value) {
                  return false;
                }
              }
            }
          }
          return true;
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(point => {
          const result = {
            id: point.id,
            score: point.score
          };
          
          if (with_payload) {
            result.payload = point.payload;
          }
          
          if (with_vector) {
            result.vector = point.vector;
          }
          
          return result;
        });
      
      res.json({ result: results });
    });

    // Delete points
    this.app.post('/collections/:name/points/delete', async (req, res) => {
      const { name } = req.params;
      const { points } = req.body;
      const collection = this.collections.get(name);
      
      if (!collection) {
        return res.status(404).json({ error: 'Collection not found' });
      }
      
      // Remove points by ID
      collection.points = collection.points.filter(p => !points.includes(p.id));
      await this.saveCollection(name);
      
      res.json({ result: { status: 'ok' } });
    });

    // Get points
    this.app.post('/collections/:name/points', (req, res) => {
      const { name } = req.params;
      const { ids, with_payload = true, with_vector = false } = req.body;
      const collection = this.collections.get(name);
      
      if (!collection) {
        return res.status(404).json({ error: 'Collection not found' });
      }
      
      const points = collection.points
        .filter(p => ids.includes(p.id))
        .map(point => {
          const result = { id: point.id };
          
          if (with_payload) {
            result.payload = point.payload;
          }
          
          if (with_vector) {
            result.vector = point.vector;
          }
          
          return result;
        });
      
      res.json({ result: points });
    });

    // Count points
    this.app.post('/collections/:name/points/count', (req, res) => {
      const { name } = req.params;
      const { filter } = req.body;
      const collection = this.collections.get(name);
      
      if (!collection) {
        return res.status(404).json({ error: 'Collection not found' });
      }
      
      let count = collection.points.length;
      
      if (filter && filter.must) {
        count = collection.points.filter(point => {
          for (const condition of filter.must) {
            if (condition.key && condition.match) {
              const value = point.payload[condition.key];
              if (value !== condition.match.value) {
                return false;
              }
            }
          }
          return true;
        }).length;
      }
      
      res.json({ result: { count } });
    });
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) {
      return 0;
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (normA * normB);
  }

  /**
   * Load collections from disk
   */
  async loadCollections() {
    try {
      const files = await fs.readdir(this.config.dataPath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const name = file.replace('.json', '');
          const data = await fs.readJson(path.join(this.config.dataPath, file));
          this.collections.set(name, data);
        }
      }
      
      console.log(chalk.gray(`🦙 Loaded ${this.collections.size} collections`));
    } catch (error) {
      // No collections yet
    }
  }

  /**
   * Save collection to disk
   */
  async saveCollection(name) {
    const collection = this.collections.get(name);
    if (collection) {
      await fs.writeJson(
        path.join(this.config.dataPath, `${name}.json`),
        collection,
        { spaces: 2 }
      );
    }
  }

  /**
   * Stop the server
   */
  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log(chalk.gray('🦙 Embedded Qdrant stopped'));
          resolve();
        });
      });
    }
  }

  /**
   * Get server info
   */
  getInfo() {
    return {
      type: 'embedded',
      port: this.config.port,
      collections: this.collections.size,
      totalPoints: Array.from(this.collections.values())
        .reduce((sum, col) => sum + col.points.length, 0)
    };
  }
}

// CLI support for running standalone
if (require.main === module) {
  const port = process.argv[2] || 6333;
  const server = new EmbeddedQdrant({ port });
  
  server.start().then(() => {
    console.log(chalk.cyan(`🦙 Embedded Qdrant ready at http://localhost:${port}`));
  });
  
  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });
}

module.exports = EmbeddedQdrant;