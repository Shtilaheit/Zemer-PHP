<?php

namespace Metrolist\Core;

use PDO;
use PDOException;

/**
 * Fast SQLite database wrapper
 * Optimized for shared hosting with connection pooling
 */
class Database
{
    private static ?PDO $connection = null;
    private string $dbPath;

    public function __construct(string $dbPath = null)
    {
        $this->dbPath = $dbPath ?? __DIR__ . '/../../storage/db/metrolist.db';

        // Ensure directory exists
        $dir = dirname($this->dbPath);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
    }

    /**
     * Get database connection (singleton pattern)
     */
    public function getConnection(): PDO
    {
        if (self::$connection === null) {
            try {
                self::$connection = new PDO('sqlite:' . $this->dbPath);

                // Performance optimizations for SQLite
                self::$connection->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                self::$connection->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
                self::$connection->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);

                // SQLite performance pragmas
                self::$connection->exec('PRAGMA journal_mode = WAL');        // Write-Ahead Logging (faster writes)
                self::$connection->exec('PRAGMA synchronous = NORMAL');      // Balance safety/speed
                self::$connection->exec('PRAGMA cache_size = 10000');        // 10MB cache
                self::$connection->exec('PRAGMA temp_store = MEMORY');       // Store temp tables in RAM
                self::$connection->exec('PRAGMA mmap_size = 30000000000');   // Memory-mapped I/O
                self::$connection->exec('PRAGMA page_size = 4096');          // Optimize page size

                // Initialize schema if needed
                $this->initializeSchema();

            } catch (PDOException $e) {
                throw new \RuntimeException('Database connection failed: ' . $e->getMessage());
            }
        }

        return self::$connection;
    }

    /**
     * Execute a SELECT query
     *
     * @param string $sql SQL query
     * @param array $params Query parameters
     * @return array Results
     */
    public function query(string $sql, array $params = []): array
    {
        try {
            $stmt = $this->getConnection()->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetchAll();
        } catch (PDOException $e) {
            throw new \RuntimeException('Query failed: ' . $e->getMessage());
        }
    }

    /**
     * Execute an INSERT/UPDATE/DELETE query
     *
     * @param string $sql SQL query
     * @param array $params Query parameters
     * @return int Number of affected rows
     */
    public function execute(string $sql, array $params = []): int
    {
        try {
            $stmt = $this->getConnection()->prepare($sql);
            $stmt->execute($params);
            return $stmt->rowCount();
        } catch (PDOException $e) {
            throw new \RuntimeException('Execute failed: ' . $e->getMessage());
        }
    }

    /**
     * Get single row
     *
     * @param string $sql SQL query
     * @param array $params Query parameters
     * @return array|null Row or null
     */
    public function queryOne(string $sql, array $params = []): ?array
    {
        try {
            $stmt = $this->getConnection()->prepare($sql);
            $stmt->execute($params);
            $result = $stmt->fetch();
            return $result ?: null;
        } catch (PDOException $e) {
            throw new \RuntimeException('Query failed: ' . $e->getMessage());
        }
    }

    /**
     * Get last insert ID
     */
    public function lastInsertId(): string
    {
        return $this->getConnection()->lastInsertId();
    }

    /**
     * Begin transaction
     */
    public function beginTransaction(): bool
    {
        return $this->getConnection()->beginTransaction();
    }

    /**
     * Commit transaction
     */
    public function commit(): bool
    {
        return $this->getConnection()->commit();
    }

    /**
     * Rollback transaction
     */
    public function rollback(): bool
    {
        return $this->getConnection()->rollBack();
    }

    /**
     * Initialize database schema
     */
    private function initializeSchema(): void
    {
        $conn = $this->getConnection();

        // Check if schema exists
        $tables = $conn->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);

        if (empty($tables)) {
            // Create tables
            $schema = file_get_contents(__DIR__ . '/../../storage/db/schema.sql');
            if ($schema) {
                $conn->exec($schema);
            }
        }
    }

    /**
     * Vacuum database (optimize)
     */
    public function vacuum(): void
    {
        $this->getConnection()->exec('VACUUM');
    }

    /**
     * Analyze database (update query planner statistics)
     */
    public function analyze(): void
    {
        $this->getConnection()->exec('ANALYZE');
    }
}
