<?php

require_once __DIR__ . '/../../src/autoload.php';

use Metrolist\Core\Cache;
use Metrolist\Core\Config;
use Metrolist\Core\Logger;
use Metrolist\YouTube\InnerTube;

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$logger = new Logger();
$cache = new Cache();

try {
    // Get input parameter
    $input = $_GET['q'] ?? '';

    if (empty($input) || strlen($input) < 2) {
        echo json_encode([
            'success' => true,
            'suggestions' => []
        ]);
        exit;
    }

    $logger->debug("Suggestions request", ['input' => $input]);

    // Generate cache key
    $cacheKey = 'suggestions:' . md5($input);

    // Try to get from cache (30 minutes)
    $results = $cache->remember($cacheKey, Config::getCacheTtl('suggestions'), function() use ($input, $logger) {
        $logger->info("Cache miss, fetching suggestions", ['input' => $input]);

        $youtube = new InnerTube();
        return $youtube->searchSuggestions($input);
    });

    // Send response
    echo json_encode([
        'success' => true,
        'input' => $input,
        'suggestions' => $results,
        'cached' => $cache->get($cacheKey) !== null
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

} catch (\Exception $e) {
    $logger->exception($e);

    http_response_code(500);
    $response = [
        'success' => false,
        'error' => $e->getMessage()
    ];

    // Add debug info in debug mode
    if (Config::isDebug()) {
        $response['debug'] = [
            'file' => $e->getFile(),
            'line' => $e->getLine(),
            'trace' => explode("\n", $e->getTraceAsString())
        ];
    }

    echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
