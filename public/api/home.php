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
    $logger->debug("Home feed request");

    // Generate cache key
    $cacheKey = 'home:feed';

    // Try to get from cache (15 minutes)
    $results = $cache->remember($cacheKey, Config::getCacheTtl('home'), function() use ($logger) {
        $logger->info("Cache miss, fetching home feed from YouTube");

        $youtube = new InnerTube();
        return $youtube->home();
    });

    // Send response
    echo json_encode([
        'success' => true,
        'results' => $results,
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
