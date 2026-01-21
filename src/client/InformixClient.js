/**
 * Informix Service Client
 * HTTP client for consuming the Informix REST API
 * Use this in your webapp to connect to the Informix service
 */

class InformixClient {
  /**
   * Create a new Informix client
   * @param {Object} options
   * @param {string} options.baseUrl - Base URL of the Informix service (e.g., 'http://localhost:3000')
   * @param {number} options.timeout - Request timeout in ms (default: 30000)
   * @param {Object} options.headers - Additional headers to send with requests
   */
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
    this.timeout = options.timeout || 30000;
    this.headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
  }

  /**
   * Make HTTP request to the service
   */
  async _request(method, path, body = null) {
    const url = `${this.baseUrl}${path}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const options = {
        method,
        headers: this.headers,
        signal: controller.signal
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      const data = await response.json();

      if (!response.ok) {
        throw new InformixClientError(
          data.error || 'Request failed',
          response.status,
          data.code
        );
      }

      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new InformixClientError('Request timeout', 408, 'TIMEOUT');
      }
      if (error instanceof InformixClientError) {
        throw error;
      }
      throw new InformixClientError(error.message, 0, 'NETWORK_ERROR');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check service health
   * @returns {Promise<Object>} Health status
   */
  async health() {
    return this._request('GET', '/api/health');
  }

  /**
   * Get service statistics
   * @returns {Promise<Object>} Service stats
   */
  async stats() {
    return this._request('GET', '/api/stats');
  }

  /**
   * Execute a SELECT query
   * @param {string} sql - SQL query
   * @param {Object} options
   * @param {boolean} options.useCache - Whether to use cache (default: true)
   * @returns {Promise<Object>} Query result
   */
  async query(sql, options = {}) {
    return this._request('POST', '/api/query', {
      sql,
      useCache: options.useCache !== false
    });
  }

  /**
   * Execute a query and return single row
   * @param {string} sql - SQL query
   * @returns {Promise<Object>} Single row result
   */
  async queryOne(sql) {
    return this._request('POST', '/api/query/one', { sql });
  }

  /**
   * Get all tables in the database
   * @returns {Promise<Object>} List of tables
   */
  async getTables() {
    return this._request('GET', '/api/tables');
  }

  /**
   * Get columns for a table
   * @param {string} tableName - Table name
   * @returns {Promise<Object>} Column information
   */
  async getTableColumns(tableName) {
    return this._request('GET', `/api/tables/${encodeURIComponent(tableName)}/columns`);
  }

  /**
   * Get data from a table with pagination
   * @param {string} tableName - Table name
   * @param {Object} options
   * @param {number} options.limit - Max rows to return (default: 100)
   * @param {number} options.offset - Rows to skip (default: 0)
   * @returns {Promise<Object>} Table data
   */
  async getTableData(tableName, options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', options.limit);
    if (options.offset) params.set('offset', options.offset);
    
    const queryString = params.toString();
    const path = `/api/data/${encodeURIComponent(tableName)}${queryString ? '?' + queryString : ''}`;
    
    return this._request('GET', path);
  }

  /**
   * Clear the server-side cache
   * @returns {Promise<Object>} Success message
   */
  async clearCache() {
    return this._request('POST', '/api/cache/clear');
  }
}

/**
 * Client error class
 */
class InformixClientError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.name = 'InformixClientError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { InformixClient, InformixClientError };
}

// For browser usage
if (typeof window !== 'undefined') {
  window.InformixClient = InformixClient;
  window.InformixClientError = InformixClientError;
}
