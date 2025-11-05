<?php

require_once __DIR__ . '/../src/autoload.php';

use Metrolist\Core\Cache;
use Metrolist\Core\Config;
use Metrolist\Core\Logger;
use Metrolist\YouTube\InnerTube;

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$logger = new Logger();
$cache = new Cache();

try {
    // Get browse ID parameter
    $browseId = $_GET['id'] ?? '';

    if (empty($browseId)) {
        throw new \InvalidArgumentException('Browse ID parameter "id" is required');
    }

    $logger->debug("Browse request", ['browseId' => $browseId]);

    // Determine content type and cache TTL
    $contentType = 'unknown';
    if (str_starts_with($browseId, 'MPREb_')) {
        $contentType = 'album';
    } elseif (str_starts_with($browseId, 'UC') || str_starts_with($browseId, 'FEmusic_library_corpus_track_artists')) {
        $contentType = 'artist';
    } elseif (str_starts_with($browseId, 'VL') || str_starts_with($browseId, 'PL') || str_starts_with($browseId, 'RDAMPL')) {
        $contentType = 'playlist';
    } elseif ($browseId === 'FEmusic_home') {
        $contentType = 'home';
    }

    $cacheTtl = Config::getCacheTtl($contentType);

    // Generate cache key
    $cacheKey = 'browse:' . $browseId;

    // Try to get from cache
    $results = $cache->remember($cacheKey, $cacheTtl, function() use ($browseId, $logger) {
        $logger->info("Cache miss, fetching from YouTube", ['browseId' => $browseId]);

        $youtube = new InnerTube();
        return $youtube->browse($browseId);
    });

    // Send response
    echo json_encode([
        'success' => true,
        'browseId' => $browseId,
        'contentType' => $contentType,
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
