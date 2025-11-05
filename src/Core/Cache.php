<?php

namespace Metrolist\Core;

/**
 * High-performance cache abstraction
 * Priority: APCu (in-memory) > File cache (fallback)
 */
class Cache
{
    private static ?bool $apcuAvailable = null;
    private static string $cacheDir;

    public function __construct(string $cacheDir = null)
    {
        self::$cacheDir = $cacheDir ?? __DIR__ . '/../../storage/cache';

        if (!is_dir(self::$cacheDir)) {
            mkdir(self::$cacheDir, 0755, true);
        }

        if (self::$apcuAvailable === null) {
            self::$apcuAvailable = extension_loaded('apcu') && apcu_enabled();
        }
    }

    /**
     * Get cached value
     *
     * @param string $key Cache key
     * @return mixed|null Cached value or null if not found/expired
     */
    public function get(string $key): mixed
    {
        // Try APCu first (fastest: 1-2ms)
        if (self::$apcuAvailable) {
            $value = apcu_fetch($key, $success);
            if ($success) {
                return $value;
            }
        }

        // Fallback to file cache (20-50ms)
        return $this->getFromFile($key);
    }

    /**
     * Set cached value
     *
     * @param string $key Cache key
     * @param mixed $value Value to cache
     * @param int $ttl Time to live in seconds
     * @return bool Success
     */
    public function set(string $key, mixed $value, int $ttl = 3600): bool
    {
        $success = true;

        // Store in APCu if available
        if (self::$apcuAvailable) {
            $success = apcu_store($key, $value, $ttl);
        }

        // Also store in file cache as backup
        $this->setToFile($key, $value, $ttl);

        return $success;
    }

    /**
     * Delete cached value
     *
     * @param string $key Cache key
     * @return bool Success
     */
    public function delete(string $key): bool
    {
        $success = true;

        if (self::$apcuAvailable) {
            $success = apcu_delete($key);
        }

        $filePath = $this->getCacheFilePath($key);
        if (file_exists($filePath)) {
            unlink($filePath);
        }

        return $success;
    }

    /**
     * Clear all cache
     *
     * @return bool Success
     */
    public function clear(): bool
    {
        $success = true;

        if (self::$apcuAvailable) {
            $success = apcu_clear_cache();
        }

        // Clear file cache
        $files = glob(self::$cacheDir . '/*');
        foreach ($files as $file) {
            if (is_file($file)) {
                unlink($file);
            }
        }

        return $success;
    }

    /**
     * Remember: Get from cache or execute callback and cache result
     *
     * @param string $key Cache key
     * @param int $ttl Time to live in seconds
     * @param callable $callback Callback to execute if cache miss
     * @return mixed Cached or fresh value
     */
    public function remember(string $key, int $ttl, callable $callback): mixed
    {
        $value = $this->get($key);

        if ($value === null) {
            $value = $callback();
            $this->set($key, $value, $ttl);
        }

        return $value;
    }

    /**
     * Get value from file cache
     */
    private function getFromFile(string $key): mixed
    {
        $filePath = $this->getCacheFilePath($key);

        if (!file_exists($filePath)) {
            return null;
        }

        $data = @file_get_contents($filePath);
        if ($data === false) {
            return null;
        }

        $cached = @unserialize($data);
        if ($cached === false) {
            return null;
        }

        // Check expiration
        if ($cached['expires'] < time()) {
            unlink($filePath);
            return null;
        }

        return $cached['value'];
    }

    /**
     * Set value to file cache
     */
    private function setToFile(string $key, mixed $value, int $ttl): bool
    {
        $filePath = $this->getCacheFilePath($key);

        $data = [
            'expires' => time() + $ttl,
            'value' => $value
        ];

        return @file_put_contents($filePath, serialize($data), LOCK_EX) !== false;
    }

    /**
     * Get cache file path for key
     */
    private function getCacheFilePath(string $key): string
    {
        $hash = md5($key);
        return self::$cacheDir . '/' . $hash . '.cache';
    }

    /**
     * Check if cache is enabled and working
     */
    public static function isAvailable(): bool
    {
        return self::$apcuAvailable || is_writable(__DIR__ . '/../../storage/cache');
    }
}
