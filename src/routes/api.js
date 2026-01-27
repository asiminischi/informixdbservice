/**
 * API Routes for Informix Database Service
 */

const express = require('express');
const router = express.Router();
const dbService = require('../services/DatabaseService');

/**
 * Health check endpoint
 * GET /api/health
 */
router.get('/health', async (req, res) => {
  try {
    const health = await dbService.healthCheck();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * Get service statistics
 * GET /api/stats
 */
router.get('/stats', (req, res) => {
  res.json(dbService.getStats());
});

/**
 * Execute a query
 * POST /api/query
 * Body: { sql: string, params?: array, useCache?: boolean }
 */
router.post('/query', async (req, res) => {
  try {
    const { sql, params = [], useCache = true } = req.body;
    
    if (!sql) {
      return res.status(400).json({
        error: 'SQL query is required',
        code: 'MISSING_SQL'
      });
    }

    // Basic SQL injection prevention - only allow SELECT
    const trimmedSql = sql.trim().toUpperCase();
    if (!trimmedSql.startsWith('SELECT')) {
      return res.status(403).json({
        error: 'Only SELECT queries are allowed via this endpoint',
        code: 'FORBIDDEN_OPERATION'
      });
    }

    const result = await dbService.query(sql, params, { useCache });
    res.json({
      success: true,
      rowCount: result.data.length,
      fromCache: result.fromCache,
      data: result.data
    });
  } catch (error) {
    res.status(500).json(error.toJSON ? error.toJSON() : {
      error: error.message,
      code: 'QUERY_ERROR'
    });
  }
});

/**
 * Execute a single-row query
 * POST /api/query/one
 * Body: { sql: string, params?: array }
 */
router.post('/query/one', async (req, res) => {
  try {
    const { sql, params = [] } = req.body;
    
    if (!sql) {
      return res.status(400).json({
        error: 'SQL query is required',
        code: 'MISSING_SQL'
      });
    }

    const result = await dbService.queryOne(sql, params);
    res.json({
      success: true,
      fromCache: result.fromCache,
      data: result.data
    });
  } catch (error) {
    res.status(500).json(error.toJSON ? error.toJSON() : {
      error: error.message,
      code: 'QUERY_ERROR'
    });
  }
});

/**
 * Execute INSERT, UPDATE, DELETE queries
 * POST /api/execute
 * Body: { sql: string }
 */
router.post('/execute', async (req, res) => {
  try {
    const { sql } = req.body;
    
    if (!sql) {
      return res.status(400).json({
        error: 'SQL statement is required',
        code: 'MISSING_SQL'
      });
    }

    // Only allow INSERT, UPDATE, DELETE
    const trimmedSql = sql.trim().toUpperCase();
    const allowedOperations = ['INSERT', 'UPDATE', 'DELETE'];
    const operation = allowedOperations.find(op => trimmedSql.startsWith(op));
    
    if (!operation) {
      return res.status(403).json({
        error: 'Only INSERT, UPDATE, DELETE queries are allowed via this endpoint. Use /api/query for SELECT.',
        code: 'FORBIDDEN_OPERATION'
      });
    }

    const result = await dbService.execute(sql);
    res.json({
      success: true,
      operation,
      message: `${operation} executed successfully`
    });
  } catch (error) {
    res.status(500).json(error.toJSON ? error.toJSON() : {
      error: error.message,
      code: 'EXECUTE_ERROR'
    });
  }
});

/**
 * Clear cache
 * POST /api/cache/clear
 */
router.post('/cache/clear', (req, res) => {
  dbService.clearCache();
  res.json({
    success: true,
    message: 'Cache cleared'
  });
});

/**
 * Get all tables in the database
 * GET /api/tables
 */
router.get('/tables', async (req, res) => {
  try {
    const result = await dbService.query(
      "SELECT tabname FROM systables WHERE tabtype = 'T' AND tabid > 99 ORDER BY tabname",
      [],
      { useCache: true }
    );
    res.json({
      success: true,
      count: result.data.length,
      tables: result.data.map(row => row.tabname)
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      code: 'QUERY_ERROR'
    });
  }
});

/**
 * Get table columns
 * GET /api/tables/:tableName/columns
 */
router.get('/tables/:tableName/columns', async (req, res) => {
  try {
    const { tableName } = req.params;
    const result = await dbService.query(
      `SELECT c.colname, c.coltype, c.collength 
       FROM syscolumns c, systables t 
       WHERE c.tabid = t.tabid AND t.tabname = '${tableName}' 
       ORDER BY c.colno`,
      [],
      { useCache: true }
    );
    res.json({
      success: true,
      table: tableName,
      columns: result.data
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      code: 'QUERY_ERROR'
    });
  }
});

/**
 * Insert data into a table
 * POST /api/data/:tableName
 * Body: { data: { column1: value1, column2: value2, ... } }
 */
router.post('/data/:tableName', async (req, res) => {
  try {
    const { tableName } = req.params;
    const { data } = req.body;
    
    // Validate table name (basic protection)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({
        error: 'Invalid table name',
        code: 'INVALID_TABLE'
      });
    }

    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      return res.status(400).json({
        error: 'Data object is required',
        code: 'MISSING_DATA'
      });
    }

    // Validate column names
    const columns = Object.keys(data);
    for (const col of columns) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) {
        return res.status(400).json({
          error: `Invalid column name: ${col}`,
          code: 'INVALID_COLUMN'
        });
      }
    }

    const values = columns.map(col => {
      const val = data[col];
      if (val === null) return 'NULL';
      if (typeof val === 'number') return val;
      return `'${String(val).replace(/'/g, "''")}'`;
    });

    const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')})`;
    const result = await dbService.execute(sql);
    
    res.status(201).json({
      success: true,
      message: 'Record inserted successfully',
      table: tableName
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      code: 'INSERT_ERROR'
    });
  }
});

/**
 * Update data in a table
 * PUT /api/data/:tableName
 * Body: { data: { column1: value1, ... }, where: { column: value } }
 */
router.put('/data/:tableName', async (req, res) => {
  try {
    const { tableName } = req.params;
    const { data, where } = req.body;
    
    // Validate table name
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({
        error: 'Invalid table name',
        code: 'INVALID_TABLE'
      });
    }

    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      return res.status(400).json({
        error: 'Data object is required',
        code: 'MISSING_DATA'
      });
    }

    if (!where || typeof where !== 'object' || Object.keys(where).length === 0) {
      return res.status(400).json({
        error: 'Where clause is required for updates',
        code: 'MISSING_WHERE'
      });
    }

    // Validate column names
    const allColumns = [...Object.keys(data), ...Object.keys(where)];
    for (const col of allColumns) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) {
        return res.status(400).json({
          error: `Invalid column name: ${col}`,
          code: 'INVALID_COLUMN'
        });
      }
    }

    // Build SET clause
    const setClause = Object.entries(data).map(([col, val]) => {
      if (val === null) return `${col} = NULL`;
      if (typeof val === 'number') return `${col} = ${val}`;
      return `${col} = '${String(val).replace(/'/g, "''")}'`;
    }).join(', ');

    // Build WHERE clause
    const whereClause = Object.entries(where).map(([col, val]) => {
      if (val === null) return `${col} IS NULL`;
      if (typeof val === 'number') return `${col} = ${val}`;
      return `${col} = '${String(val).replace(/'/g, "''")}'`;
    }).join(' AND ');

    const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`;
    const result = await dbService.execute(sql);
    
    res.json({
      success: true,
      message: 'Record(s) updated successfully',
      table: tableName
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      code: 'UPDATE_ERROR'
    });
  }
});

/**
 * Delete data from a table
 * DELETE /api/data/:tableName
 * Body: { where: { column: value } }
 */
router.delete('/data/:tableName', async (req, res) => {
  try {
    const { tableName } = req.params;
    const { where } = req.body;
    
    // Validate table name
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({
        error: 'Invalid table name',
        code: 'INVALID_TABLE'
      });
    }

    if (!where || typeof where !== 'object' || Object.keys(where).length === 0) {
      return res.status(400).json({
        error: 'Where clause is required for deletes (use DELETE /api/data/:tableName/all to delete all)',
        code: 'MISSING_WHERE'
      });
    }

    // Validate column names
    for (const col of Object.keys(where)) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) {
        return res.status(400).json({
          error: `Invalid column name: ${col}`,
          code: 'INVALID_COLUMN'
        });
      }
    }

    // Build WHERE clause
    const whereClause = Object.entries(where).map(([col, val]) => {
      if (val === null) return `${col} IS NULL`;
      if (typeof val === 'number') return `${col} = ${val}`;
      return `${col} = '${String(val).replace(/'/g, "''")}'`;
    }).join(' AND ');

    const sql = `DELETE FROM ${tableName} WHERE ${whereClause}`;
    const result = await dbService.execute(sql);
    
    res.json({
      success: true,
      message: 'Record(s) deleted successfully',
      table: tableName
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      code: 'DELETE_ERROR'
    });
  }
});

/**
 * Generic table query with pagination
 * GET /api/data/:tableName?limit=100&offset=0
 */
router.get('/data/:tableName', async (req, res) => {
  try {
    const { tableName } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    
    // Validate table name (basic protection)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return res.status(400).json({
        error: 'Invalid table name',
        code: 'INVALID_TABLE'
      });
    }

    const sql = `SELECT FIRST ${limit} SKIP ${offset} * FROM ${tableName}`;
    const result = await dbService.query(sql, [], { useCache: true });
    
    res.json({
      success: true,
      table: tableName,
      limit,
      offset,
      rowCount: result.data.length,
      fromCache: result.fromCache,
      data: result.data
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      code: 'QUERY_ERROR'
    });
  }
});

module.exports = router;
