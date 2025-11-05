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
    // Get video ID parameter
    $videoId = $_GET['id'] ?? '';

    if (empty($videoId)) {
        throw new \InvalidArgumentException('Video ID parameter "id" is required');
    }

    $logger->debug("Player request", ['videoId' => $videoId]);

    // Generate cache key
    $cacheKey = 'player:' . $videoId;

    // Try to get from cache (5 hours, YouTube expires at 6h)
    $results = $cache->remember($cacheKey, Config::getCacheTtl('streaming_url'), function() use ($videoId, $logger) {
        $logger->info("Cache miss, fetching streaming URL", ['videoId' => $videoId]);

        $youtube = new InnerTube();
        $playerResponse = $youtube->player($videoId);

        // Log response status for debugging
        $logger->debug("Player response received", [
            'hasStreamingData' => isset($playerResponse['streamingData']),
            'videoDetails' => $playerResponse['videoDetails']['title'] ?? 'unknown'
        ]);

        // Extract best audio format
        $audioFormat = InnerTube::extractStreamingUrl($playerResponse);

        if (!$audioFormat) {
            $logger->error("No audio format extracted", [
                'hasStreamingData' => isset($playerResponse['streamingData']),
                'adaptiveFormatsCount' => count($playerResponse['streamingData']['adaptiveFormats'] ?? []),
                'formatsCount' => count($playerResponse['streamingData']['formats'] ?? [])
            ]);
            throw new \RuntimeException('No audio formats available for this video');
        }

        if (!isset($audioFormat['url'])) {
            $logger->error("Audio format has no URL", [
                'formatKeys' => array_keys($audioFormat)
            ]);
            throw new \RuntimeException('Audio format does not contain streaming URL');
        }

        return [
            'playerResponse' => $playerResponse,
            'audioFormat' => $audioFormat
        ];
    });

    // Send response
    echo json_encode([
        'success' => true,
        'videoId' => $videoId,
        'streamingUrl' => $results['audioFormat']['url'] ?? null,
        'audioFormat' => $results['audioFormat'],
        'duration' => $results['playerResponse']['videoDetails']['lengthSeconds'] ?? null,
        'title' => $results['playerResponse']['videoDetails']['title'] ?? null,
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
