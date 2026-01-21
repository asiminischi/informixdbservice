/**
 * Database Service Layer
 * Provides high-level database operations with caching and error handling
 */

const db = require('../db/connection');

class DatabaseService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 60000; // 1 minute default cache
    this.initialized = false;
  }

  /**
   * Initialize the database service
   */
  async init() {
    if (this.initialized) return;
    await db.initialize();
    this.initialized = true;
  }

  /**
   * Generate cache key from query and params
   */
  _getCacheKey(sql, params = []) {
    return `${sql}:${JSON.stringify(params)}`;
  }

  /**
   * Get cached result if valid
   */
  _getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  /**
   * Store result in cache
   */
  _setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear all cache or specific key
   */
  clearCache(key = null) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Execute a SELECT query with optional caching
   */
  async query(sql, params = [], options = {}) {
    await this.init();
    
    const { useCache = true, cacheTtl = this.cacheTimeout } = options;
    const cacheKey = this._getCacheKey(sql, params);

    // Check cache first
    if (useCache) {
      const cached = this._getFromCache(cacheKey);
      if (cached) {
        return { data: cached, fromCache: true };
      }
    }

    try {
      const data = await db.simpleQuery(sql);
      
      if (useCache) {
        this._setCache(cacheKey, data);
      }
      
      return { data, fromCache: false };
    } catch (error) {
      throw new ServiceError('Query failed', error.message, 'QUERY_ERROR');
    }
  }

  /**
   * Execute a query and return single row
   */
  async queryOne(sql, params = [], options = {}) {
    const result = await this.query(sql, params, options);
    return {
      data: result.data.length > 0 ? result.data[0] : null,
      fromCache: result.fromCache
    };
  }

  /**
   * Execute INSERT, UPDATE, DELETE
   */
  async execute(sql, params = []) {
    await this.init();
    
    try {
      const result = await db.execute(sql);
      // Clear related cache entries after modifications
      this.clearCache();
      return { success: true, result };
    } catch (error) {
      throw new ServiceError('Execute failed', error.message, 'EXECUTE_ERROR');
    }
  }

  /**
   * Execute multiple queries in sequence
   */
  async transaction(queries) {
    await this.init();
    
    const results = [];
    try {
      for (const { sql, params } of queries) {
        const result = await db.simpleQuery(sql);
        results.push(result);
      }
      this.clearCache();
      return { success: true, results };
    } catch (error) {
      throw new ServiceError('Transaction failed', error.message, 'TRANSACTION_ERROR');
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      await this.init();
      await db.testConnection();
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        cacheSize: this.cache.size
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      initialized: this.initialized,
      cacheSize: this.cache.size,
      cacheTimeout: this.cacheTimeout
    };
  }

  /**
   * Shutdown the service
   */
  async shutdown() {
    this.cache.clear();
    await db.close();
    this.initialized = false;
  }
}

/**
 * Custom service error class
 */
class ServiceError extends Error {
  constructor(message, details, code) {
    super(message);
    this.name = 'ServiceError';
    this.details = details;
    this.code = code;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      error: this.message,
      details: this.details,
      code: this.code,
      timestamp: this.timestamp
    };
  }
}

// Export singleton instance
module.exports = new DatabaseService();
module.exports.ServiceError = ServiceError;
