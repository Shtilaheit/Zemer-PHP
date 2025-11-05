<?php

namespace Metrolist\Core;

/**
 * Application configuration
 */
class Config
{
    // Debug mode - set to true to see detailed errors
    public const DEBUG = true;

    // Cache settings
    public const CACHE_ENABLED = true;
    public const CACHE_DEFAULT_TTL = 3600; // 1 hour

    // Cache TTL by type (in seconds)
    public const CACHE_TTL = [
        'search' => 3600,          // 1 hour
        'album' => 86400,          // 24 hours
        'artist' => 86400,         // 24 hours
        'playlist' => 3600,        // 1 hour
        'home' => 900,             // 15 minutes
        'streaming_url' => 18000,  // 5 hours (YouTube expires at 6h)
        'lyrics' => 604800,        // 7 days
        'suggestions' => 1800,     // 30 minutes
    ];

    // Database settings
    public const DB_PATH = __DIR__ . '/../../storage/db/metrolist.db';

    // Log settings
    public const LOG_ENABLED = true;
    public const LOG_PATH = __DIR__ . '/../../storage/logs/app.log';

    // API settings
    public const API_TIMEOUT = 15;
    public const API_CONNECT_TIMEOUT = 5;
    public const API_MAX_CONNECTIONS = 50;

    /**
     * Get cache TTL for type
     */
    public static function getCacheTtl(string $type): int
    {
        return self::CACHE_TTL[$type] ?? self::CACHE_DEFAULT_TTL;
    }

    /**
     * Is debug mode enabled
     */
    public static function isDebug(): bool
    {
        return self::DEBUG;
    }
}
