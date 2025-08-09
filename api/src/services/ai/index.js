/**
 * AI Services Index
 * Exports all AI-related services for dependency injection
 */

const OpenAIService = require('./openai.service');
const EmbeddingService = require('./embedding.service');
const AnalysisService = require('./analysis.service');

/**
 * Initialize all AI services with proper dependencies
 * @param {Object} config - Configuration object
 * @returns {Object} Initialized AI services
 */
function initializeAIServices(config = {}) {
  // Initialize OpenAI service first as it's a dependency for others
  const openaiService = new OpenAIService({
    apiKey: config.openaiApiKey || process.env.OPENAI_API_KEY,
    defaultModel: config.defaultModel || 'gpt-4o-mini',
    embeddingModel: config.embeddingModel || 'text-embedding-3-small',
    maxTokens: config.maxTokens || 4000,
    temperature: config.temperature || 0.3,
    timeoutMs: config.timeoutMs || 30000,
    maxRetries: config.maxRetries || 3
  });

  // Initialize dependent services
  const embeddingService = new EmbeddingService(openaiService);
  const analysisService = new AnalysisService(openaiService);

  return {
    openaiService,
    embeddingService,
    analysisService
  };
}

/**
 * Test all AI services connectivity
 * @param {Object} services - AI services object
 * @returns {Promise<Object>} Test results for all services
 */
async function testAIServices(services) {
  const results = {
    timestamp: new Date().toISOString(),
    overall: { success: true, errors: [] },
    services: {}
  };

  try {
    // Test OpenAI service
    results.services.openai = await services.openaiService.testConnection();
    if (!results.services.openai.success) {
      results.overall.success = false;
      results.overall.errors.push(`OpenAI: ${results.services.openai.error}`);
    }

    // Test Analysis service
    results.services.analysis = await services.analysisService.testAnalysis();
    if (!results.services.analysis.success) {
      results.overall.success = false;
      results.overall.errors.push(`Analysis: ${results.services.analysis.error}`);
    }

    // Test Embedding service stats (no direct test method but check readiness)
    results.services.embedding = {
      success: services.embeddingService.getStats().openaiServiceReady,
      stats: services.embeddingService.getStats()
    };
    if (!results.services.embedding.success) {
      results.overall.success = false;
      results.overall.errors.push('Embedding: OpenAI service not ready');
    }

  } catch (error) {
    results.overall.success = false;
    results.overall.errors.push(`Test execution failed: ${error.message}`);
  }

  return results;
}

/**
 * Get combined statistics for all AI services
 * @param {Object} services - AI services object
 * @returns {Object} Combined statistics
 */
function getAIServicesStats(services) {
  return {
    timestamp: new Date().toISOString(),
    openai: services.openaiService.getStats(),
    embedding: services.embeddingService.getStats(),
    analysis: services.analysisService.getStats(),
    readiness: {
      allReady: services.openaiService.isReady(),
      openaiReady: services.openaiService.isReady(),
      embeddingReady: services.embeddingService.getStats().openaiServiceReady,
      analysisReady: services.analysisService.getStats().openaiServiceReady
    }
  };
}

module.exports = {
  OpenAIService,
  EmbeddingService,
  AnalysisService,
  initializeAIServices,
  testAIServices,
  getAIServicesStats
};