<?php

namespace Metrolist\Core;

/**
 * Minimal high-performance router for API endpoints
 */
class Router
{
    private array $routes = [];

    /**
     * Register GET route
     */
    public function get(string $path, callable $handler): void
    {
        $this->addRoute('GET', $path, $handler);
    }

    /**
     * Register POST route
     */
    public function post(string $path, callable $handler): void
    {
        $this->addRoute('POST', $path, $handler);
    }

    /**
     * Register route
     */
    private function addRoute(string $method, string $path, callable $handler): void
    {
        $this->routes[] = [
            'method' => $method,
            'path' => $path,
            'handler' => $handler
        ];
    }

    /**
     * Dispatch request
     */
    public function dispatch(): void
    {
        $method = $_SERVER['REQUEST_METHOD'];
        $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

        // Initialize logger
        $logger = new Logger();

        foreach ($this->routes as $route) {
            if ($route['method'] === $method && $this->matchPath($route['path'], $path, $params)) {
                try {
                    $logger->debug("Routing $method $path", ['params' => $params]);

                    $response = call_user_func_array($route['handler'], $params);
                    $this->sendResponse($response);
                    return;
                } catch (\Exception $e) {
                    $logger->exception($e, "Error handling $method $path");

                    // In debug mode, include stack trace
                    if (Config::isDebug()) {
                        $this->sendError($e->getMessage(), 500, [
                            'file' => $e->getFile(),
                            'line' => $e->getLine(),
                            'trace' => $e->getTraceAsString()
                        ]);
                    } else {
                        $this->sendError($e->getMessage(), 500);
                    }
                    return;
                }
            }
        }

        $logger->warning("Route not found: $method $path");
        $this->sendError('Not Found', 404);
    }

    /**
     * Match route path with URL path
     */
    private function matchPath(string $routePath, string $urlPath, ?array &$params = []): bool
    {
        $params = [];

        // Convert route pattern to regex
        $pattern = preg_replace('/\{([^}]+)\}/', '(?P<$1>[^/]+)', $routePath);
        $pattern = '#^' . $pattern . '$#';

        if (preg_match($pattern, $urlPath, $matches)) {
            // Extract named parameters
            foreach ($matches as $key => $value) {
                if (is_string($key)) {
                    $params[$key] = $value;
                }
            }
            return true;
        }

        return false;
    }

    /**
     * Send JSON response
     */
    private function sendResponse(mixed $data, int $statusCode = 200): void
    {
        http_response_code($statusCode);
        header('Content-Type: application/json');
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');

        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /**
     * Send error response
     */
    private function sendError(string $message, int $statusCode = 400, array $debug = []): void
    {
        $response = [
            'error' => $message,
            'status' => $statusCode
        ];

        // Add debug info if in debug mode
        if (Config::isDebug() && !empty($debug)) {
            $response['debug'] = $debug;
        }

        $this->sendResponse($response, $statusCode);
    }
}
