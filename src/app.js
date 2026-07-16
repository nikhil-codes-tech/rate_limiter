const express = require('express');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const { connectRedis } = require('./redis');
const { initDb } = require('./db');
const metrics = require('./metrics');
const apiRouter = require('./routes/api');
const adminRouter = require('./routes/admin');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Standard middleware
app.use(express.json());

// Serve static admin dashboard
app.use('/dashboard', express.static(path.join(__dirname, 'public')));

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
  } catch (err) {
    logger.error({ err }, 'Failed to render Prometheus metrics');
    res.status(500).end(err);
  }
});

// API Routes
app.use('/api/v1', apiRouter);
app.use('/admin', adminRouter);

// Centralized error handler
app.use(errorHandler);

let server;

/**
 * Start backend microservice dependencies and HTTP listener
 */
async function startServer() {
  try {
    logger.info('Starting Rate Limiter service...');
    
    // 1. Connect to Redis caching cluster
    await connectRedis();

    // 2. Initialize PostgreSQL tables/indices (skipping in test env)
    if (process.env.NODE_ENV !== 'test') {
      await initDb();
    }

    // 3. Open HTTP port listener
    server = app.listen(config.port, () => {
      logger.info(`Rate Limiter microservice listening on port ${config.port} in [${config.nodeEnv}] mode`);
    });
  } catch (err) {
    logger.fatal({ err }, 'Critical error starting Rate Limiter service');
    process.exit(1);
  }
}

/**
 * Perform graceful resource cleanups during process terminations
 */
async function shutdown(signal) {
  logger.info({ signal }, 'Graceful shutdown signal received');
  
  if (server) {
    server.close(() => {
      logger.info('Express HTTP listener terminated');
    });
  }

  try {
    const { client } = require('./redis');
    if (client.isOpen) {
      await client.quit();
      logger.info('Redis client connection closed');
    }

    const { pool } = require('./db');
    await pool.end();
    logger.info('PostgreSQL pool connection closed');

    logger.info('Graceful shutdown completed successfully');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error occurred during graceful shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Auto-run unless imported during testing
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

module.exports = app;
