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
    // Get query parameter
    $query = $_GET['q'] ?? '';
    $filter = $_GET['filter'] ?? null; // songs, videos, albums, artists, playlists

    if (empty($query)) {
        throw new \InvalidArgumentException('Query parameter "q" is required');
    }

    $logger->debug("Search request", ['query' => $query, 'filter' => $filter]);

    // Generate cache key
    $cacheKey = 'search:' . md5($query . $filter);

    // Try to get from cache
    $results = $cache->remember($cacheKey, Config::getCacheTtl('search'), function() use ($query, $filter, $logger) {
        $logger->info("Cache miss, fetching from YouTube", ['query' => $query]);

        $youtube = new InnerTube();
        return $youtube->search($query, $filter);
    });

    // Send response
    echo json_encode([
        'success' => true,
        'query' => $query,
        'filter' => $filter,
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
