# Contributing to AutoLlama

Welcome to the AutoLlama project! We're excited to have you contribute to making the most context-aware llama in the digital pasture even better. 🦙✨

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Workflow](#development-workflow)
4. [Code Standards](#code-standards)
5. [Testing Guidelines](#testing-guidelines)
6. [Documentation Standards](#documentation-standards)
7. [Pull Request Process](#pull-request-process)
8. [Issue Reporting](#issue-reporting)
9. [Architecture Guidelines](#architecture-guidelines)
10. [Performance Considerations](#performance-considerations)
11. [Security Guidelines](#security-guidelines)
12. [Release Process](#release-process)

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive environment for all contributors, regardless of experience level, gender identity, sexual orientation, disability, race, ethnicity, religion, or nationality.

### Expected Behavior

- **Be respectful**: Treat all community members with respect and kindness
- **Be collaborative**: We're all working toward the same goal
- **Be patient**: Help others learn and grow
- **Be constructive**: Provide helpful feedback and suggestions
- **Be inclusive**: Welcome newcomers and help them feel at home

### Unacceptable Behavior

- Harassment, discrimination, or hostile behavior
- Inappropriate comments or personal attacks
- Spam, trolling, or off-topic discussions
- Sharing private information without permission

## Getting Started

### Prerequisites

Before contributing, ensure you have:

```bash
# Required software
Node.js 18.17+ 
Docker & Docker Compose
Git
PostgreSQL client tools

# Optional but helpful
VS Code with extensions:
- ESLint
- Prettier
- Docker
- Jest Test Explorer
```

### Fork and Clone

```bash
# 1. Fork the repository on GitHub
# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/autollama.git
cd autollama

# 3. Add upstream remote
git remote add upstream https://github.com/ORIGINAL_OWNER/autollama.git

# 4. Create your development branch
git checkout -b feature/your-feature-name
```

### Development Setup

```bash
# 1. Set up environment
cp example.env .env
# Edit .env with your API keys

# 2. Start development environment
docker compose up -d

# 3. Install dependencies
cd api && npm install
cd ../config/react-frontend && npm install

# 4. Run tests to verify setup
cd ../../api && npm test
```

### First Contribution Ideas

Looking for ways to get started? Try these:

- **Documentation**: Improve existing docs or add missing sections
- **Bug fixes**: Check issues labeled `good-first-issue`
- **Tests**: Add test coverage for untested features
- **Performance**: Optimize slow queries or API endpoints
- **UI/UX**: Improve the frontend user experience
- **Accessibility**: Make the interface more accessible

## Development Workflow

### Branch Naming Convention

```bash
# Feature development
feature/contextual-embeddings-v3
feature/multi-language-support
feature/advanced-search

# Bug fixes
fix/session-cleanup-memory-leak
fix/cors-issues-production
fix/pdf-parsing-error

# Documentation
docs/api-integration-guide
docs/deployment-improvements

# Performance improvements
perf/database-query-optimization
perf/redis-caching-layer

# Refactoring
refactor/extract-ai-services
refactor/modularize-routes
```

### Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```bash
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

#### Types

- **feat**: New feature or enhancement
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, etc.)
- **refactor**: Code refactoring without feature changes
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **chore**: Maintenance tasks, dependency updates
- **ci**: CI/CD pipeline changes

#### Examples

```bash
feat(api): add contextual embeddings for enhanced retrieval

- Implement GPT-4o-mini context generation
- Add contextual_summary field to chunks table
- Improve search accuracy by 35%
- Add configuration toggle for feature

Closes #123

fix(frontend): resolve CORS issues in production environment

The frontend was experiencing CORS errors when deployed behind
nginx reverse proxy. This fix updates the nginx configuration
to properly handle CORS headers.

perf(database): optimize chunks query with composite index

Added composite index on (document_id, uses_contextual_embedding)
to improve query performance for contextual search results.
Query time reduced from 500ms to 50ms.

docs(deployment): add production deployment checklist

Added comprehensive checklist for production deployments
including security, monitoring, and backup considerations.
```

### Daily Development Process

```bash
# 1. Start your day
git checkout main
git pull upstream main
git checkout your-feature-branch
git rebase main

# 2. Make your changes
# ... code, test, iterate ...

# 3. Test your changes
npm test                    # Unit tests
npm run test:integration   # Integration tests
npm run test:e2e          # End-to-end tests
npm run lint              # Code style check

# 4. Commit your changes
git add .
git commit -m "feat(api): your meaningful commit message"

# 5. Push to your fork
git push origin your-feature-branch

# 6. Create pull request when ready
```

## Code Standards

### JavaScript/Node.js Style

We use ESLint and Prettier for consistent code formatting:

```javascript
// .eslintrc.js
module.exports = {
    extends: [
        'eslint:recommended',
        'plugin:node/recommended',
        'plugin:security/recommended',
        'plugin:jest/recommended'
    ],
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
    },
    env: {
        node: true,
        es2022: true,
        jest: true
    },
    rules: {
        'no-console': 'warn',
        'no-unused-vars': 'error',
        'prefer-const': 'error',
        'no-var': 'error',
        'arrow-spacing': 'error',
        'object-curly-spacing': ['error', 'always'],
        'array-bracket-spacing': ['error', 'never'],
        'comma-dangle': ['error', 'never'],
        'semi': ['error', 'always'],
        'quotes': ['error', 'single'],
        'indent': ['error', 2],
        'max-len': ['error', { code: 100, ignoreUrls: true }]
    }
};
```

### Code Organization

```javascript
// Preferred file structure for new modules
const express = require('express');
const { body, validationResult } = require('express-validator');

// Local imports
const logger = require('../utils/logger');
const { ContentProcessor } = require('../services/processing/content.processor');
const { DatabaseService } = require('../services/storage/database.service');

// Constants
const MAX_CHUNK_SIZE = 5000;
const DEFAULT_CHUNK_SIZE = 1200;

/**
 * Content Controller
 * Handles all content-related HTTP requests
 */
class ContentController {
  constructor({ contentProcessor, databaseService }) {
    this.contentProcessor = contentProcessor;
    this.databaseService = databaseService;
  }

  /**
   * Process URL with streaming response
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async processUrlStream(req, res, next) {
    try {
      // Validation
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      // Processing logic here
      const result = await this.contentProcessor.processUrl(req.body);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('URL processing failed', {
        url: req.body.url,
        error: error.message,
        stack: error.stack
      });
      next(error);
    }
  }
}

module.exports = { ContentController };
```

### Error Handling

```javascript
// Custom error classes
class AutoLlamaError extends Error {
  constructor(message, code, statusCode = 500) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AutoLlamaError {
  constructor(message, field) {
    super(message, 'VALIDATION_ERROR', 400);
    this.field = field;
  }
}

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  logger.error('API Error', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  if (err instanceof AutoLlamaError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        field: err.field || undefined
      }
    });
  }

  // Default error response
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    }
  });
};
```

### React/Frontend Standards

```jsx
// React component structure
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

/**
 * ProcessingStatus Component
 * Displays real-time processing status with progress updates
 */
const ProcessingStatus = ({ sessionId, onComplete, onError }) => {
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!sessionId) return;

    const eventSource = new EventSource(`/api/stream/${sessionId}`);
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleStatusUpdate(data);
    };

    eventSource.onerror = () => {
      onError?.('Connection to server lost');
    };

    return () => eventSource.close();
  }, [sessionId, onComplete, onError]);

  const handleStatusUpdate = (data) => {
    setStatus(data.status);
    setProgress(data.progress || 0);
    setMessage(data.message || '');

    if (data.status === 'completed') {
      onComplete?.(data);
    } else if (data.status === 'error') {
      onError?.(data.error);
    }
  };

  return (
    <div className="processing-status">
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="status-message">{message}</p>
    </div>
  );
};

ProcessingStatus.propTypes = {
  sessionId: PropTypes.string.isRequired,
  onComplete: PropTypes.func,
  onError: PropTypes.func
};

export default ProcessingStatus;
```

## Testing Guidelines

### Test Structure

We follow the AAA (Arrange, Act, Assert) pattern:

```javascript
// Unit test example
describe('ContentProcessor', () => {
  let contentProcessor;
  let mockDependencies;

  beforeEach(() => {
    // Arrange - Set up test dependencies
    mockDependencies = {
      aiService: {
        analyzeChunk: jest.fn(),
        generateEmbedding: jest.fn()
      },
      databaseService: {
        saveChunk: jest.fn(),
        getDocument: jest.fn()
      },
      logger: {
        info: jest.fn(),
        error: jest.fn()
      }
    };
    
    contentProcessor = new ContentProcessor(mockDependencies);
  });

  describe('processContentChunks', () => {
    it('should process chunks successfully with contextual embeddings', async () => {
      // Arrange
      const testContent = 'Test content for processing';
      const testUrl = 'https://example.com/test';
      const options = { 
        chunkSize: 1200, 
        enableContextualEmbeddings: true 
      };

      mockDependencies.aiService.analyzeChunk.mockResolvedValue({
        title: 'Test Title',
        summary: 'Test Summary',
        sentiment: 'positive'
      });

      mockDependencies.aiService.generateEmbedding.mockResolvedValue({
        embedding: new Array(1536).fill(0.1),
        model: 'text-embedding-3-small'
      });

      mockDependencies.databaseService.saveChunk.mockResolvedValue({
        id: 'chunk-123',
        created: true
      });

      // Act
      const result = await contentProcessor.processContentChunks(
        testContent, 
        testUrl, 
        options
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.chunksProcessed).toBeGreaterThan(0);
      expect(result.usesContextualEmbeddings).toBe(true);
      
      expect(mockDependencies.aiService.analyzeChunk).toHaveBeenCalled();
      expect(mockDependencies.aiService.generateEmbedding).toHaveBeenCalled();
      expect(mockDependencies.databaseService.saveChunk).toHaveBeenCalled();
    });

    it('should handle processing errors gracefully', async () => {
      // Arrange
      const testContent = 'Test content';
      const testUrl = 'https://example.com/test';
      
      mockDependencies.aiService.analyzeChunk.mockRejectedValue(
        new Error('AI service unavailable')
      );

      // Act & Assert
      await expect(
        contentProcessor.processContentChunks(testContent, testUrl)
      ).rejects.toThrow('AI service unavailable');
      
      expect(mockDependencies.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Processing failed'),
        expect.objectContaining({
          url: testUrl,
          error: 'AI service unavailable'
        })
      );
    });
  });
});
```

### Integration Tests

```javascript
// Integration test example
describe('Content API Integration', () => {
  let app;
  let request;

  beforeAll(async () => {
    app = await createTestApp();
    request = supertest(app);
  });

  afterAll(async () => {
    await cleanupTestApp(app);
  });

  describe('POST /api/process-url', () => {
    it('should process a valid URL successfully', async () => {
      const response = await request
        .post('/api/process-url')
        .send({
          url: 'https://en.wikipedia.org/wiki/Machine_learning',
          chunkSize: 1200,
          enableContextualEmbeddings: true
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.documentId).toBeDefined();
      expect(response.body.data.chunksCreated).toBeGreaterThan(0);
    });

    it('should return validation error for invalid URL', async () => {
      const response = await request
        .post('/api/process-url')
        .send({
          url: 'not-a-valid-url',
          chunkSize: 1200
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
```

### Test Coverage Requirements

- **Minimum coverage**: 80% overall
- **Critical paths**: 95% coverage for core processing logic
- **New features**: 90% coverage required for PR approval
- **Bug fixes**: Must include test that reproduces the bug

```bash
# Run tests with coverage
npm run test:coverage

# Coverage requirements in jest.config.js
module.exports = {
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/tests/**',
    '!src/config/**'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './src/services/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  }
};
```

## Documentation Standards

### Code Documentation

```javascript
/**
 * Processes content chunks with AI analysis and contextual embeddings
 * 
 * This function takes raw content, splits it into chunks, analyzes each chunk
 * using AI services, generates contextual summaries, and stores the results
 * in both PostgreSQL and Qdrant vector database.
 * 
 * @param {string} content - Raw content to process
 * @param {string} url - Source URL of the content
 * @param {Object} options - Processing configuration
 * @param {number} [options.chunkSize=1200] - Size of each content chunk
 * @param {number} [options.overlap=200] - Overlap between chunks
 * @param {boolean} [options.enableContextualEmbeddings=true] - Enable contextual analysis
 * @param {string} [options.aiModel='gpt-4o-mini'] - AI model for analysis
 * @param {Function} [options.progressCallback] - Callback for progress updates
 * 
 * @returns {Promise<Object>} Processing results
 * @returns {string} returns.documentId - Unique document identifier
 * @returns {number} returns.chunksProcessed - Number of chunks created
 * @returns {number} returns.processingTime - Total processing time in ms
 * @returns {boolean} returns.usesContextualEmbeddings - Whether contextual embeddings were used
 * @returns {Object} returns.metadata - Additional processing metadata
 * 
 * @throws {ValidationError} When content or URL is invalid
 * @throws {AIServiceError} When AI analysis fails
 * @throws {DatabaseError} When storage operations fail
 * 
 * @example
 * const processor = new ContentProcessor(dependencies);
 * const result = await processor.processContentChunks(
 *   'Article content here...',
 *   'https://example.com/article',
 *   {
 *     chunkSize: 1500,
 *     enableContextualEmbeddings: true,
 *     progressCallback: (progress) => console.log(`Progress: ${progress}%`)
 *   }
 * );
 * console.log(`Created ${result.chunksProcessed} chunks for document ${result.documentId}`);
 * 
 * @since 2.0.0
 * @author AutoLlama Team
 */
async processContentChunks(content, url, options = {}) {
  // Implementation here...
}
```

### API Documentation

All API endpoints must be documented with OpenAPI/Swagger:

```yaml
# Example API documentation
/api/process-url:
  post:
    summary: Process URL content with AI analysis
    description: |
      Fetches content from the provided URL, processes it through the AI pipeline
      to extract metadata and generate contextual embeddings, then stores the
      results for future retrieval and search.
    tags:
      - Content Processing
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required:
              - url
            properties:
              url:
                type: string
                format: uri
                description: URL to process
                example: "https://en.wikipedia.org/wiki/Machine_learning"
              chunkSize:
                type: integer
                minimum: 100
                maximum: 5000
                default: 1200
                description: Size of content chunks in characters
              overlap:
                type: integer
                minimum: 0
                maximum: 1000
                default: 200
                description: Character overlap between chunks
              enableContextualEmbeddings:
                type: boolean
                default: true
                description: Enable contextual embedding generation
    responses:
      200:
        description: Content processed successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: true
                data:
                  type: object
                  properties:
                    documentId:
                      type: string
                      format: uuid
                    chunksCreated:
                      type: integer
                    processingTime:
                      type: number
      400:
        $ref: '#/components/responses/ValidationError'
      500:
        $ref: '#/components/responses/InternalError'
```

### README Updates

When adding new features, update relevant sections in README.md:

```markdown
## New Feature: Advanced Search Filters

### What's New
AutoLlama now supports advanced search filters to help you find exactly what you're looking for:

- **Category filtering**: Filter by content type (article, blog, academic, etc.)
- **Date range**: Search within specific time periods
- **Technical level**: Find content matching your expertise level
- **Sentiment**: Filter by emotional tone of content

### Usage
```bash
# Search with filters
curl -X GET "http://localhost:8080/api/search" \
  -G \
  -d "q=machine learning" \
  -d "category=academic" \
  -d "technical_level=advanced" \
  -d "date_from=2024-01-01"
```

### Configuration
Enable advanced search in your settings:
```javascript
{
  "search": {
    "enableAdvancedFilters": true,
    "maxFilters": 5
  }
}
```
```

## Pull Request Process

### Before Submitting

1. **Ensure your branch is up to date**:
   ```bash
   git checkout main
   git pull upstream main
   git checkout your-feature-branch
   git rebase main
   ```

2. **Run the complete test suite**:
   ```bash
   npm test
   npm run test:integration
   npm run test:e2e
   npm run lint
   npm run typecheck
   ```

3. **Update documentation**:
   - Add/update API documentation
   - Update README if needed
   - Add JSDoc comments for new functions
   - Update CHANGELOG.md

4. **Check performance impact**:
   ```bash
   npm run test:performance
   ```

### Pull Request Template

When creating a PR, use this template:

```markdown
## Summary
Brief description of what this PR accomplishes.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Refactoring (no functional changes)

## Related Issues
Closes #123
Related to #456

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] End-to-end tests pass
- [ ] Manual testing completed
- [ ] Performance impact assessed

## Checklist
- [ ] My code follows the style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes

## Screenshots (if applicable)
[Add screenshots for UI changes]

## Additional Notes
[Any additional information, concerns, or considerations]
```

### Review Process

1. **Automated checks must pass**:
   - All tests (unit, integration, e2e)
   - Code style (ESLint, Prettier)
   - Security scan
   - Performance benchmarks

2. **Manual review required**:
   - At least one maintainer approval
   - Two approvals for breaking changes
   - Architecture review for significant changes

3. **Review criteria**:
   - Code quality and style
   - Test coverage
   - Documentation completeness
   - Performance impact
   - Security considerations

### Merge Requirements

- All CI checks passing
- Required approvals received
- Branch up to date with main
- No merge conflicts
- Documentation updated

## Issue Reporting

### Bug Reports

Use the bug report template:

```markdown
**Bug Description**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

**Expected Behavior**
A clear and concise description of what you expected to happen.

**Actual Behavior**
What actually happened.

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Environment:**
 - OS: [e.g. Ubuntu 22.04]
 - Node.js version: [e.g. 18.17.0]
 - Docker version: [e.g. 24.0.5]
 - AutoLlama version: [e.g. 2.2.0]

**Logs**
```
Paste relevant log output here
```

**Additional Context**
Add any other context about the problem here.
```

### Feature Requests

Use the feature request template:

```markdown
**Is your feature request related to a problem? Please describe.**
A clear and concise description of what the problem is. Ex. I'm always frustrated when [...]

**Describe the solution you'd like**
A clear and concise description of what you want to happen.

**Describe alternatives you've considered**
A clear and concise description of any alternative solutions or features you've considered.

**Additional context**
Add any other context or screenshots about the feature request here.

**Implementation ideas**
If you have ideas about how this could be implemented, please share them.
```

## Architecture Guidelines

### Service Design Principles

1. **Single Responsibility**: Each service should have one clear purpose
2. **Dependency Injection**: Use constructor injection for testability
3. **Interface Segregation**: Define clear interfaces between services
4. **Error Handling**: Comprehensive error handling with proper logging
5. **Observability**: Include metrics, logging, and health checks

### Adding New Services

```javascript
// 1. Define the service interface
interface IContentAnalyzer {
  analyzeContent(content: string, options: AnalysisOptions): Promise<AnalysisResult>;
  generateSummary(content: string): Promise<string>;
}

// 2. Implement the service
class ContentAnalyzer implements IContentAnalyzer {
  constructor(private aiService: IAIService, private logger: ILogger) {}
  
  async analyzeContent(content: string, options: AnalysisOptions): Promise<AnalysisResult> {
    this.logger.info('Starting content analysis', { contentLength: content.length });
    
    try {
      // Implementation
      const result = await this.aiService.analyze(content, options);
      this.logger.info('Content analysis completed', { result });
      return result;
    } catch (error) {
      this.logger.error('Content analysis failed', { error: error.message });
      throw new AnalysisError('Failed to analyze content', error);
    }
  }
}

// 3. Register in dependency injection container
container.register('contentAnalyzer', ContentAnalyzer, {
  dependencies: ['aiService', 'logger']
});

// 4. Add tests
describe('ContentAnalyzer', () => {
  // Test implementation
});
```

### Database Changes

1. **Migration scripts**: All schema changes must have migration scripts
2. **Backward compatibility**: Ensure changes don't break existing data
3. **Performance impact**: Analyze query performance for new indexes
4. **Data validation**: Add appropriate constraints and validations

```sql
-- Migration example: Add contextual embeddings support
-- migration_20250803_add_contextual_embeddings.sql

BEGIN;

-- Add new columns
ALTER TABLE chunks 
ADD COLUMN contextual_summary TEXT,
ADD COLUMN uses_contextual_embedding BOOLEAN DEFAULT false,
ADD COLUMN context_model VARCHAR(50);

-- Add indexes for performance
CREATE INDEX CONCURRENTLY idx_chunks_contextual 
ON chunks(uses_contextual_embedding) 
WHERE uses_contextual_embedding = true;

-- Update statistics
ANALYZE chunks;

COMMIT;
```

## Performance Considerations

### Performance Guidelines

1. **Database queries**: Use EXPLAIN ANALYZE for new queries
2. **API response times**: Target <200ms for simple operations
3. **Memory usage**: Monitor memory consumption in long-running operations
4. **Caching**: Implement appropriate caching strategies
5. **Batch operations**: Use batch processing for bulk operations

### Performance Testing

```javascript
// Performance test example
describe('Performance Tests', () => {
  describe('Content Processing', () => {
    it('should process 1000 chunks in under 60 seconds', async () => {
      const startTime = Date.now();
      const chunks = generateTestChunks(1000);
      
      const results = await Promise.all(
        chunks.map(chunk => processor.processChunk(chunk))
      );
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(60000); // 60 seconds
      expect(results).toHaveLength(1000);
      expect(results.every(r => r.success)).toBe(true);
    });
  });
});
```

### Memory Management

```javascript
// Memory-efficient streaming processing
class StreamingProcessor {
  async processLargeFile(filePath) {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const chunks = [];
    
    for await (const chunk of stream) {
      // Process chunk immediately
      await this.processChunk(chunk);
      
      // Don't accumulate in memory
      if (chunks.length > 100) {
        chunks.splice(0, 50); // Keep only recent chunks
      }
    }
  }
}
```

## Security Guidelines

### Security Best Practices

1. **Input validation**: Validate all user inputs
2. **SQL injection prevention**: Use parameterized queries
3. **XSS prevention**: Sanitize output data
4. **Authentication**: Implement proper authentication (when applicable)
5. **Rate limiting**: Prevent abuse with rate limiting
6. **Secrets management**: Never commit secrets to code

### Security Checklist

```javascript
// Input validation example
const { body, validationResult } = require('express-validator');

const validateUrlProcessing = [
  body('url')
    .isURL()
    .withMessage('Must be a valid URL')
    .custom(async (url) => {
      // Additional security checks
      const domain = new URL(url).hostname;
      if (BLOCKED_DOMAINS.includes(domain)) {
        throw new Error('Domain not allowed');
      }
      return true;
    }),
  
  body('chunkSize')
    .isInt({ min: 100, max: 5000 })
    .withMessage('Chunk size must be between 100 and 5000'),
    
  body('overlap')
    .isInt({ min: 0, max: 1000 })
    .withMessage('Overlap must be between 0 and 1000')
];

// Usage in route
router.post('/process-url', validateUrlProcessing, (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }
  
  // Process request
});
```

### Dependency Security

```bash
# Regular security audits
npm audit
npm audit fix

# Check for known vulnerabilities
npm install -g nsp
nsp check

# Use security-focused linting
npm install -g eslint-plugin-security
```

## Release Process

### Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Checklist

1. **Pre-release testing**:
   ```bash
   npm run test:all
   npm run test:performance
   npm run security:scan
   ```

2. **Update version**:
   ```bash
   npm version patch  # or minor/major
   ```

3. **Update CHANGELOG.md**:
   ```markdown
   ## [2.1.1] - 2025-08-03
   
   ### Added
   - New contextual embeddings feature
   - Advanced search filters
   
   ### Fixed
   - Session cleanup memory leak
   - CORS issues in production
   
   ### Changed
   - Improved API response times
   - Updated dependencies
   ```

4. **Create release branch**:
   ```bash
   git checkout -b release/v2.1.1
   git push origin release/v2.1.1
   ```

5. **Deploy to staging** and run integration tests

6. **Create GitHub release** with release notes

7. **Deploy to production** using blue-green deployment

8. **Monitor deployment** for any issues

### Hotfix Process

For critical bugs requiring immediate fixes:

1. Create hotfix branch from main
2. Fix the issue with minimal changes
3. Test thoroughly
4. Deploy to staging
5. Fast-track review process
6. Deploy to production
7. Update documentation

## Getting Help

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and community discussion
- **Discord**: Real-time chat with the community (if available)
- **Email**: security@autollama.io for security-related issues

### Mentorship Program

New contributors can request mentorship:

1. Comment on an issue you'd like to work on
2. Tag @maintainers for mentor assignment
3. Get guidance on implementation approach
4. Receive code review and feedback

### Documentation

- **API Documentation**: http://localhost:8080/api-docs
- **Architecture Guide**: `/api/docs/guides/architecture.md`
- **Deployment Guide**: `/api/docs/guides/deployment.md`
- **Developer Setup**: `/api/docs/guides/getting-started.md`

## Recognition

We appreciate all contributions! Contributors will be:

- Listed in our Contributors section
- Recognized in release notes for significant contributions
- Invited to join the maintainer team (for regular contributors)
- Given priority support for their own projects

---

Thank you for contributing to AutoLlama! Together, we're building the most context-aware llama in the digital pasture. 🦙✨

*Last updated: August 3, 2025*