<?php

namespace Metrolist\YouTube;

use GuzzleHttp\Client;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Handler\CurlMultiHandler;
use GuzzleHttp\RequestOptions;

/**
 * YouTube InnerTube API Client
 * High-performance HTTP client with connection pooling
 */
class InnerTube
{
    private const BASE_URL = 'https://music.youtube.com/youtubei/v1/';
    private const CLIENT_VERSION = '1.20250310.01.00';
    private const API_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';

    private static ?Client $httpClient = null;
    private ?string $visitorData = null;
    private array $context;

    public function __construct()
    {
        $this->context = $this->buildContext();
    }

    /**
     * Get singleton HTTP client with connection pooling
     */
    private function getClient(): Client
    {
        if (self::$httpClient === null) {
            $handler = new CurlMultiHandler([
                'max_handles' => 50 // Connection pool size
            ]);

            $stack = HandlerStack::create($handler);

            self::$httpClient = new Client([
                'base_uri' => self::BASE_URL,
                'timeout' => 15,
                'connect_timeout' => 5,
                'http_errors' => false,
                'handler' => $stack,
                RequestOptions::HEADERS => [
                    'User-Agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'Accept' => 'application/json',
                    'Accept-Language' => 'en-US,en;q=0.9',
                    'Origin' => 'https://music.youtube.com',
                    'Referer' => 'https://music.youtube.com/',
                    'X-YouTube-Client-Name' => '67', // WEB_REMIX
                    'X-YouTube-Client-Version' => self::CLIENT_VERSION,
                ]
            ]);
        }

        return self::$httpClient;
    }

    /**
     * Build context object for API requests
     */
    private function buildContext(): array
    {
        return [
            'client' => [
                'clientName' => 'WEB_REMIX',
                'clientVersion' => self::CLIENT_VERSION,
                'hl' => 'en',
                'gl' => 'US',
                'visitorData' => $this->getVisitorData(),
                'userAgent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'timeZone' => 'UTC',
                'utcOffsetMinutes' => 0
            ],
            'user' => [
                'lockedSafetyMode' => false
            ]
        ];
    }

    /**
     * Get visitor data for YouTube Music
     */
    private function getVisitorData(): string
    {
        if ($this->visitorData !== null) {
            return $this->visitorData;
        }

        try {
            $response = $this->getClient()->get('https://music.youtube.com/sw.js_data', [
                RequestOptions::HEADERS => [
                    'User-Agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                ]
            ]);

            $content = $response->getBody()->getContents();

            // Extract visitor data from response
            if (preg_match('/"visitorData":"([^"]+)"/', $content, $matches)) {
                $this->visitorData = $matches[1];
                return $this->visitorData;
            }
        } catch (\Exception $e) {
            // Fallback visitor data
        }

        // Default visitor data if fetch fails
        $this->visitorData = 'CgtsZG1ySnZiQWtSbyiMjuGSBg%3D%3D';
        return $this->visitorData;
    }

    /**
     * Search for music
     *
     * @param string $query Search query
     * @param string|null $filter Filter type: 'songs', 'videos', 'albums', 'artists', 'playlists'
     * @return array Search results
     */
    public function search(string $query, ?string $filter = null): array
    {
        $body = [
            'context' => $this->context,
            'query' => $query
        ];

        // Add filter if specified
        if ($filter) {
            $body['params'] = $this->getSearchFilter($filter);
        }

        return $this->post('search', $body);
    }

    /**
     * Browse content (album, artist, playlist, etc.)
     *
     * @param string $browseId Browse ID (e.g., album ID, artist ID)
     * @param array $params Additional parameters
     * @return array Browse results
     */
    public function browse(string $browseId, array $params = []): array
    {
        $body = array_merge([
            'context' => $this->context,
            'browseId' => $browseId
        ], $params);

        return $this->post('browse', $body);
    }

    /**
     * Get streaming URLs for a song
     *
     * @param string $videoId Video/Song ID
     * @return array Player response with streaming URLs
     */
    public function player(string $videoId): array
    {
        $body = [
            'context' => $this->context,
            'videoId' => $videoId,
            'playbackContext' => [
                'contentPlaybackContext' => [
                    'signatureTimestamp' => 19926 // Update if YouTube changes signature algorithm
                ]
            ]
        ];

        return $this->post('player', $body);
    }

    /**
     * Get next/queue items
     *
     * @param string $videoId Video ID
     * @param string|null $playlistId Playlist ID
     * @return array Next items
     */
    public function next(string $videoId, ?string $playlistId = null): array
    {
        $body = [
            'context' => $this->context,
            'videoId' => $videoId,
            'enablePersistentPlaylistPanel' => true,
            'isAudioOnly' => true
        ];

        if ($playlistId) {
            $body['playlistId'] = $playlistId;
        }

        return $this->post('next', $body);
    }

    /**
     * Get home feed
     *
     * @return array Home feed content
     */
    public function home(): array
    {
        return $this->browse('FEmusic_home');
    }

    /**
     * Get explore/discover content
     *
     * @return array Explore content
     */
    public function explore(): array
    {
        return $this->browse('FEmusic_explore');
    }

    /**
     * Get search suggestions
     *
     * @param string $input Partial search query
     * @return array Suggestions
     */
    public function searchSuggestions(string $input): array
    {
        $body = [
            'context' => $this->context,
            'input' => $input
        ];

        return $this->post('music/get_search_suggestions', $body);
    }

    /**
     * Get lyrics
     *
     * @param string $browseId Lyrics browse ID
     * @return array Lyrics data
     */
    public function lyrics(string $browseId): array
    {
        return $this->browse($browseId);
    }

    /**
     * Make POST request to API
     *
     * @param string $endpoint API endpoint
     * @param array $body Request body
     * @return array Response data
     */
    private function post(string $endpoint, array $body): array
    {
        try {
            $url = $endpoint . '?key=' . self::API_KEY;

            $response = $this->getClient()->post($url, [
                RequestOptions::JSON => $body,
                RequestOptions::HEADERS => [
                    'Content-Type' => 'application/json'
                ]
            ]);

            $statusCode = $response->getStatusCode();
            $content = $response->getBody()->getContents();

            if ($statusCode !== 200) {
                throw new \RuntimeException("API request failed with status $statusCode");
            }

            $data = json_decode($content, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new \RuntimeException('Failed to parse API response: ' . json_last_error_msg());
            }

            return $data;

        } catch (\Exception $e) {
            throw new \RuntimeException('InnerTube API error: ' . $e->getMessage());
        }
    }

    /**
     * Get search filter parameter
     */
    private function getSearchFilter(string $type): string
    {
        $filters = [
            'songs' => 'EgWKAQIIAWoKEAoQCRADEAQQBQ%3D%3D',
            'videos' => 'EgWKAQIQAWoKEAoQCRADEAQQBQ%3D%3D',
            'albums' => 'EgWKAQIYAWoKEAoQCRADEAQQBQ%3D%3D',
            'artists' => 'EgWKAQIgAWoKEAoQCRADEAQQBQ%3D%3D',
            'playlists' => 'EgWKAQIoAWoKEAoQCRADEAQQBQ%3D%3D',
            'featured' => 'EgWKAQJQAWoKEAoQCRADEAQQBQ%3D%3D',
        ];

        return $filters[$type] ?? '';
    }

    /**
     * Extract streaming URL from player response
     *
     * @param array $playerResponse Player API response
     * @return array|null Best audio format
     */
    public static function extractStreamingUrl(array $playerResponse): ?array
    {
        if (!isset($playerResponse['streamingData']['adaptiveFormats'])) {
            return null;
        }

        $formats = $playerResponse['streamingData']['adaptiveFormats'];

        // Filter audio-only formats
        $audioFormats = array_filter($formats, function($format) {
            return isset($format['mimeType']) &&
                   str_contains($format['mimeType'], 'audio');
        });

        if (empty($audioFormats)) {
            return null;
        }

        // Sort by bitrate (highest first)
        usort($audioFormats, function($a, $b) {
            return ($b['bitrate'] ?? 0) - ($a['bitrate'] ?? 0);
        });

        // Return best quality
        return $audioFormats[0];
    }
}
