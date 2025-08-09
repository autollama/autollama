/**
 * webhook-debug-logger.js
 * 
 * Comprehensive debugging and logging system for AutoLlama webhook integration
 * Provides detailed logging to console and prepares structured logs for server-side storage
 * 
 * Features:
 * - Verbose error messages with troubleshooting steps
 * - Request/response logging with full details
 * - Performance timing information
 * - Structured log format for easy parsing
 */

class WebhookDebugLogger {
    constructor() {
        this.logs = [];
        this.maxLogs = 1000; // Keep last 1000 log entries in memory
        this.sessionId = this.generateSessionId();
        this.startTime = Date.now();
        
        // Log levels
        this.LOG_LEVELS = {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3
        };
        
        // Initialize
        this.logInfo('WebhookDebugLogger initialized', {
            sessionId: this.sessionId,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Generates a unique session ID for tracking related log entries
     */
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Core logging function
     */
    log(level, message, data = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            sessionId: this.sessionId,
            level: level,
            message: message,
            data: data,
            elapsed: Date.now() - this.startTime
        };
        
        // Add to memory
        this.logs.push(logEntry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift(); // Remove oldest
        }
        
        // Console output with styling
        const styles = {
            DEBUG: 'color: #888',
            INFO: 'color: #2196F3',
            WARN: 'color: #FF9800',
            ERROR: 'color: #F44336; font-weight: bold'
        };
        
        console.log(
            `%c[${level}] ${message}`,
            styles[level] || '',
            data
        );
        
        // Prepare for server-side logging (will be sent with webhook requests)
        this.prepareForServerLogging(logEntry);
    }
    
    /**
     * Convenience methods for different log levels
     */
    logDebug(message, data) {
        if (window.webhookConfig && window.webhookConfig.isDebugMode()) {
            this.log('DEBUG', message, data);
        }
    }
    
    logInfo(message, data) {
        this.log('INFO', message, data);
    }
    
    logWarn(message, data) {
        this.log('WARN', message, data);
    }
    
    logError(message, data) {
        this.log('ERROR', message, data);
    }
    
    /**
     * Logs webhook request details
     */
    logWebhookRequest(url, payload, environment) {
        this.logInfo('Webhook request initiated', {
            url: url,
            environment: environment,
            payload: payload,
            payloadSize: JSON.stringify(payload).length,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Logs webhook response details
     */
    logWebhookResponse(url, response, duration) {
        const data = {
            url: url,
            status: response.status,
            statusText: response.statusText,
            duration: duration,
            headers: {}
        };
        
        // Capture relevant headers
        ['content-type', 'x-request-id', 'x-response-time'].forEach(header => {
            const value = response.headers.get(header);
            if (value) data.headers[header] = value;
        });
        
        this.logInfo('Webhook response received', data);
    }
    
    /**
     * Logs webhook errors with troubleshooting guidance
     */
    logWebhookError(error, url, attempt = 1) {
        const errorData = {
            url: url,
            attempt: attempt,
            errorType: error.name,
            errorMessage: error.message,
            stack: error.stack
        };
        
        // Add troubleshooting guidance based on error type
        const troubleshooting = this.getTroubleshootingSteps(error, url);
        
        this.logError('Webhook request failed', {
            ...errorData,
            troubleshooting: troubleshooting
        });
        
        return troubleshooting;
    }
    
    /**
     * Provides specific troubleshooting steps based on error type
     */
    getTroubleshootingSteps(error, url) {
        const steps = {
            title: 'Troubleshooting Steps:',
            steps: []
        };
        
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            steps.steps = [
                '1. Check if n8n service is running: docker compose ps',
                '2. Verify the webhook URL is correct: ' + url,
                '3. Check for CORS issues - n8n may need CORS configuration',
                '4. Ensure n8n is accessible from this domain',
                '5. Check browser console for additional network errors'
            ];
        } else if (error.message.includes('404')) {
            steps.steps = [
                '1. Verify the webhook exists in n8n',
                '2. Check if the webhook is activated in n8n',
                '3. Confirm the webhook ID is correct',
                '4. Try accessing the webhook URL directly in a new tab'
            ];
        } else if (error.message.includes('500') || error.message.includes('502')) {
            steps.steps = [
                '1. Check n8n logs: docker compose logs n8n',
                '2. Verify n8n has enough resources (memory/CPU)',
                '3. Check if the workflow has errors',
                '4. Restart n8n service: docker compose restart'
            ];
        } else if (error.message.includes('timeout')) {
            steps.steps = [
                '1. Check if n8n is processing the request (check n8n UI)',
                '2. Increase timeout setting if needed',
                '3. Verify network connectivity',
                '4. Check if n8n workflow is stuck or taking too long'
            ];
        } else {
            steps.steps = [
                '1. Check the full error message above',
                '2. Verify n8n service status',
                '3. Check browser developer tools Network tab',
                '4. Review n8n logs for more details'
            ];
        }
        
        return steps;
    }
    
    /**
     * Prepares log data for server-side storage
     */
    prepareForServerLogging(logEntry) {
        // This will be sent with the next webhook request
        if (!window.pendingLogs) {
            window.pendingLogs = [];
        }
        window.pendingLogs.push(logEntry);
        
        // Limit pending logs
        if (window.pendingLogs.length > 100) {
            window.pendingLogs = window.pendingLogs.slice(-100);
        }
    }
    
    /**
     * Gets all logs for debugging
     */
    getAllLogs() {
        return this.logs;
    }
    
    /**
     * Exports logs as downloadable file (for debugging)
     */
    exportLogs() {
        const logData = {
            sessionId: this.sessionId,
            exportTime: new Date().toISOString(),
            logs: this.logs
        };
        
        const blob = new Blob([JSON.stringify(logData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `autollama-logs-${this.sessionId}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.logInfo('Logs exported', { filename: a.download });
    }
    
    /**
     * Clears all logs
     */
    clearLogs() {
        this.logs = [];
        window.pendingLogs = [];
        this.logInfo('Logs cleared');
    }
}

// Create and export singleton instance
const webhookDebugLogger = new WebhookDebugLogger();

// Make it globally available
window.webhookDebugLogger = webhookDebugLogger;

// Add console shortcuts for debugging
window.exportLogs = () => webhookDebugLogger.exportLogs();
window.clearLogs = () => webhookDebugLogger.clearLogs();
window.showLogs = () => console.table(webhookDebugLogger.getAllLogs());

// Log initialization
console.log('%c🔍 Webhook Debug Logger Ready', 'color: #4CAF50; font-size: 14px; font-weight: bold');
console.log('Debug commands available: exportLogs(), clearLogs(), showLogs()');