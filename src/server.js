/**
 * Informix Database Service
 * Express.js REST API Server
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const apiRoutes = require('./routes/api');
const dbService = require('./services/DatabaseService');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Middleware
app.use(helmet()); // Security headers
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(morgan('combined')); // Request logging
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request timeout
app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    res.status(408).json({ error: 'Request timeout', code: 'TIMEOUT' });
  });
  next();
});

// API Routes
app.use('/api', apiRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Informix Database Service',
    version: '1.0.0',
    endpoints: {
      health: 'GET /api/health',
      stats: 'GET /api/stats',
      query: 'POST /api/query',
      queryOne: 'POST /api/query/one',
      tables: 'GET /api/tables',
      tableColumns: 'GET /api/tables/:tableName/columns',
      tableData: 'GET /api/data/:tableName',
      clearCache: 'POST /api/cache/clear'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    method: req.method
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  
  try {
    await dbService.shutdown();
    console.log('Database service closed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
const startServer = async () => {
  try {
    // Initialize database service
    console.log('Initializing database service...');
    await dbService.init();
    console.log('Database service ready');

    // Start HTTP server
    app.listen(PORT, HOST, () => {
      console.log(`
╔════════════════════════════════════════════════════════════╗
║         Informix Database Service Started                  ║
╠════════════════════════════════════════════════════════════╣
║  URL: http://${HOST}:${PORT}                               
║  Environment: ${process.env.NODE_ENV || 'development'}                      
║  Database: ${process.env.DB_DATABASE || 'presa'}                           
╚════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
