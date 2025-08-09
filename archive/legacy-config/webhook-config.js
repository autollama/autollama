/**
 * webhook-config.js
 * 
 * Centralized configuration for AutoLlama webhook integration with n8n
 * This file manages webhook URLs and environment-based settings
 * 
 * Configuration can be overridden via environment variables or .env file
 */

class WebhookConfig {
    constructor() {
        // Load configuration from environment or use defaults
        this.config = {
            // Webhook URLs - now pointing to our SSE streaming API
            testWebhookUrl: window.WEBHOOK_TEST_URL || '/api/process-url-stream',
            prodWebhookUrl: window.WEBHOOK_PROD_URL || '/api/process-url-stream',
            
            // Feature flags
            useTestWebhook: window.USE_TEST_WEBHOOK === 'true', // Default to false for production
            debugMode: window.DEBUG_MODE === 'true',
            logToFile: window.LOG_TO_FILE === 'true',
            
            // Request configuration
            requestTimeout: parseInt(window.REQUEST_TIMEOUT) || 30000, // 30 seconds default
            retryAttempts: parseInt(window.RETRY_ATTEMPTS) || 3,
            retryDelay: parseInt(window.RETRY_DELAY) || 1000, // 1 second base delay
            
            // Logging configuration
            logLevel: window.LOG_LEVEL || 'debug', // debug, info, warn, error
            maxLogSize: parseInt(window.MAX_LOG_SIZE) || 1048576, // 1MB default
        };
        
        this.validateConfig();
    }
    
    /**
     * Validates the configuration and logs warnings for any issues
     */
    validateConfig() {
        if (!this.config.testWebhookUrl && !this.config.prodWebhookUrl) {
            console.error('[WebhookConfig] No webhook URLs configured!');
        }
        
        if (this.config.useTestWebhook && !this.config.testWebhookUrl) {
            console.warn('[WebhookConfig] Test mode enabled but no test webhook URL provided');
            this.config.useTestWebhook = false;
        }
        
        if (this.config.debugMode) {
            console.info('[WebhookConfig] Debug mode is enabled');
            console.info('[WebhookConfig] Configuration:', this.config);
        }
    }
    
    /**
     * Gets the active webhook URL based on current configuration
     * @returns {string} The webhook URL to use
     */
    getWebhookUrl() {
        return this.config.useTestWebhook ? this.config.testWebhookUrl : this.config.prodWebhookUrl;
    }
    
    /**
     * Gets the webhook environment (test/production)
     * @returns {string} 'test' or 'production'
     */
    getEnvironment() {
        return this.config.useTestWebhook ? 'test' : 'production';
    }
    
    /**
     * Checks if debug mode is enabled
     * @returns {boolean}
     */
    isDebugMode() {
        return this.config.debugMode;
    }
    
    /**
     * Gets retry configuration
     * @returns {Object} Retry settings
     */
    getRetryConfig() {
        return {
            attempts: this.config.retryAttempts,
            delay: this.config.retryDelay
        };
    }
    
    /**
     * Gets the full configuration object (for debugging)
     * @returns {Object} Complete configuration
     */
    getAllConfig() {
        return { ...this.config };
    }
}

// Create and export singleton instance
const webhookConfig = new WebhookConfig();

// Make it globally available for other scripts
window.webhookConfig = webhookConfig;