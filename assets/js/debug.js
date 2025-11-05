/**
 * Debug utilities for frontend
 * Captures PHP errors and logs them to browser console
 */

class Debug {
    constructor() {
        this.enabled = true; // Set to false in production
        this.logs = [];
        this.maxLogs = 1000;

        if (this.enabled) {
            this.interceptFetch();
            this.setupErrorHandlers();
            this.log('Debug mode enabled');
        }
    }

    /**
     * Log to console with timestamp
     */
    log(message, ...args) {
        if (!this.enabled) return;

        const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
        const logEntry = {
            timestamp,
            message,
            args
        };

        this.logs.push(logEntry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        console.log(`%c[${timestamp}]%c ${message}`, 'color: #888', 'color: inherit', ...args);
    }

    /**
     * Log error to console
     */
    error(message, ...args) {
        if (!this.enabled) return;

        const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
        console.error(`%c[${timestamp}] ERROR:%c ${message}`, 'color: #f44336; font-weight: bold', 'color: inherit', ...args);
    }

    /**
     * Log warning to console
     */
    warn(message, ...args) {
        if (!this.enabled) return;

        const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
        console.warn(`%c[${timestamp}] WARNING:%c ${message}`, 'color: #ff9800; font-weight: bold', 'color: inherit', ...args);
    }

    /**
     * Log API request
     */
    logRequest(url, method, data) {
        if (!this.enabled) return;

        console.groupCollapsed(`%c→ ${method} %c${url}`, 'color: #2196f3; font-weight: bold', 'color: #666');
        if (data) {
            console.log('Request data:', data);
        }
        console.log('Time:', new Date().toISOString());
        console.groupEnd();
    }

    /**
     * Log API response
     */
    logResponse(url, status, data, duration) {
        if (!this.enabled) return;

        const statusColor = status >= 200 && status < 300 ? '#4caf50' : '#f44336';
        console.groupCollapsed(
            `%c← ${status} %c${url} %c(${duration}ms)`,
            `color: ${statusColor}; font-weight: bold`,
            'color: #666',
            'color: #888'
        );
        console.log('Response:', data);
        console.groupEnd();
    }

    /**
     * Intercept fetch calls to log API requests/responses
     */
    interceptFetch() {
        const originalFetch = window.fetch;
        const self = this;

        window.fetch = async function(...args) {
            const startTime = performance.now();
            const url = args[0];
            const options = args[1] || {};
            const method = options.method || 'GET';

            // Log request
            self.logRequest(url, method, options.body);

            try {
                const response = await originalFetch.apply(this, args);
                const duration = Math.round(performance.now() - startTime);

                // Read debug headers
                const debugHeader = response.headers.get('X-Debug-Log');
                if (debugHeader) {
                    try {
                        const debugLog = JSON.parse(atob(debugHeader));
                        const method = debugLog.level === 'ERROR' ? 'error' :
                                      debugLog.level === 'WARNING' ? 'warn' : 'log';
                        console[method](`[PHP ${debugLog.level}]`, debugLog.message, debugLog.context || '');
                    } catch (e) {
                        // Ignore parse errors
                    }
                }

                // Clone response to read body without consuming it
                const clonedResponse = response.clone();
                let responseData;

                try {
                    const contentType = response.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                        responseData = await clonedResponse.json();
                    } else {
                        responseData = await clonedResponse.text();
                    }
                } catch (e) {
                    responseData = '[Unable to read response]';
                }

                // Log response
                self.logResponse(url, response.status, responseData, duration);

                // Log error responses
                if (!response.ok) {
                    self.error(`API Error: ${response.status} ${response.statusText}`, url, responseData);
                }

                return response;
            } catch (error) {
                const duration = Math.round(performance.now() - startTime);
                self.error(`Network Error: ${error.message}`, url);
                throw error;
            }
        };
    }

    /**
     * Setup global error handlers
     */
    setupErrorHandlers() {
        // Catch unhandled errors
        window.addEventListener('error', (event) => {
            this.error('Unhandled Error:', {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                error: event.error
            });
        });

        // Catch unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.error('Unhandled Promise Rejection:', {
                reason: event.reason,
                promise: event.promise
            });
        });

        // Log when page becomes visible/hidden (for debugging background issues)
        document.addEventListener('visibilitychange', () => {
            this.log(`Page ${document.hidden ? 'hidden' : 'visible'}`);
        });
    }

    /**
     * Get all logs
     */
    getLogs() {
        return this.logs;
    }

    /**
     * Clear logs
     */
    clearLogs() {
        this.logs = [];
        console.clear();
        this.log('Logs cleared');
    }

    /**
     * Download logs as JSON file
     */
    downloadLogs() {
        const blob = new Blob([JSON.stringify(this.logs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `metrolist-logs-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Performance mark
     */
    mark(name) {
        if (!this.enabled) return;
        performance.mark(name);
        this.log(`Performance mark: ${name}`);
    }

    /**
     * Performance measure
     */
    measure(name, startMark, endMark) {
        if (!this.enabled) return;

        try {
            performance.measure(name, startMark, endMark);
            const measure = performance.getEntriesByName(name)[0];
            this.log(`Performance: ${name} took ${measure.duration.toFixed(2)}ms`);
            return measure.duration;
        } catch (e) {
            this.warn(`Could not measure ${name}: ${e.message}`);
            return null;
        }
    }

    /**
     * Log memory usage (if available)
     */
    logMemory() {
        if (!this.enabled || !performance.memory) return;

        const memory = performance.memory;
        this.log('Memory usage:', {
            used: `${(memory.usedJSHeapSize / 1048576).toFixed(2)} MB`,
            total: `${(memory.totalJSHeapSize / 1048576).toFixed(2)} MB`,
            limit: `${(memory.jsHeapSizeLimit / 1048576).toFixed(2)} MB`
        });
    }
}

// Create global debug instance
const debug = new Debug();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = debug;
}

// Add to window for console access
window.debug = debug;

// Helpful console commands
console.log('%cDebug Console Commands:', 'font-size: 14px; font-weight: bold; color: #2196f3');
console.log('%cdebug.getLogs()%c - View all logs', 'font-family: monospace; color: #4caf50', '');
console.log('%cdebug.clearLogs()%c - Clear all logs', 'font-family: monospace; color: #4caf50', '');
console.log('%cdebug.downloadLogs()%c - Download logs as JSON', 'font-family: monospace; color: #4caf50', '');
console.log('%cdebug.logMemory()%c - Show memory usage', 'font-family: monospace; color: #4caf50', '');
