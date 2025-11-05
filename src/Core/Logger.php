<?php

namespace Metrolist\Core;

/**
 * Simple but fast logger
 */
class Logger
{
    private string $logFile;
    private bool $enabled;

    public function __construct(string $logFile = null, bool $enabled = true)
    {
        $this->logFile = $logFile ?? Config::LOG_PATH;
        $this->enabled = $enabled && Config::LOG_ENABLED;

        // Ensure log directory exists
        $dir = dirname($this->logFile);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
    }

    /**
     * Log debug message
     */
    public function debug(string $message, array $context = []): void
    {
        if (Config::isDebug()) {
            $this->log('DEBUG', $message, $context);
        }
    }

    /**
     * Log info message
     */
    public function info(string $message, array $context = []): void
    {
        $this->log('INFO', $message, $context);
    }

    /**
     * Log warning message
     */
    public function warning(string $message, array $context = []): void
    {
        $this->log('WARNING', $message, $context);
    }

    /**
     * Log error message
     */
    public function error(string $message, array $context = []): void
    {
        $this->log('ERROR', $message, $context);

        // Also output to error_log in debug mode
        if (Config::isDebug()) {
            error_log("[Metrolist] $message");
        }
    }

    /**
     * Log exception
     */
    public function exception(\Throwable $e, string $message = ''): void
    {
        $errorMessage = $message ?: $e->getMessage();

        $this->error($errorMessage, [
            'exception' => get_class($e),
            'message' => $e->getMessage(),
            'file' => $e->getFile(),
            'line' => $e->getLine(),
            'trace' => Config::isDebug() ? $e->getTraceAsString() : null
        ]);
    }

    /**
     * Write log entry
     */
    private function log(string $level, string $message, array $context = []): void
    {
        if (!$this->enabled) {
            return;
        }

        $timestamp = date('Y-m-d H:i:s');
        $contextStr = !empty($context) ? ' ' . json_encode($context, JSON_UNESCAPED_SLASHES) : '';

        $logLine = "[$timestamp] [$level] $message$contextStr" . PHP_EOL;

        // Write to file (non-blocking)
        @file_put_contents($this->logFile, $logLine, FILE_APPEND | LOCK_EX);

        // Also send to browser console in debug mode
        if (Config::isDebug() && php_sapi_name() !== 'cli') {
            $this->logToConsole($level, $message, $context);
        }
    }

    /**
     * Send log to browser console (only in debug mode)
     */
    private function logToConsole(string $level, string $message, array $context): void
    {
        static $logged = [];

        // Avoid duplicate logs in same request
        $key = md5($level . $message . json_encode($context));
        if (isset($logged[$key])) {
            return;
        }
        $logged[$key] = true;

        $consoleMethod = match($level) {
            'ERROR' => 'error',
            'WARNING' => 'warn',
            'INFO' => 'info',
            default => 'log'
        };

        $output = [
            'level' => $level,
            'message' => $message,
            'timestamp' => date('H:i:s'),
        ];

        if (!empty($context)) {
            $output['context'] = $context;
        }

        // Add to response headers for JavaScript to read
        header('X-Debug-Log: ' . base64_encode(json_encode($output)), false);
    }

    /**
     * Get log contents (last N lines)
     */
    public function getTail(int $lines = 100): array
    {
        if (!file_exists($this->logFile)) {
            return [];
        }

        $file = new \SplFileObject($this->logFile, 'r');
        $file->seek(PHP_INT_MAX);
        $lastLine = $file->key();

        $start = max(0, $lastLine - $lines);
        $logLines = [];

        for ($i = $start; $i <= $lastLine; $i++) {
            $file->seek($i);
            $line = $file->current();
            if (!empty($line)) {
                $logLines[] = trim($line);
            }
        }

        return $logLines;
    }

    /**
     * Clear log file
     */
    public function clear(): bool
    {
        if (file_exists($this->logFile)) {
            return @unlink($this->logFile);
        }
        return true;
    }
}
