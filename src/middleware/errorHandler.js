const logger = require('../logger');

/**
 * Express error handling middleware
 */
function errorHandler(err, req, res, next) {
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled Exception occurred in Express pipeline');

  const status = err.status || 500;
  res.status(status).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message
  });
}

module.exports = errorHandler;
