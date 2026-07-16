const logger = require('../logger');

/**
 * Validates request payload for /api/v1/check-limit
 */
function validateCheckLimit(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const { user_id, endpoint, timestamp } = req.body;

  if (!apiKey && (!user_id || typeof user_id !== 'string' || user_id.trim() === '')) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'user_id must be a non-empty string or X-API-Key header must be provided'
    });
  }

  if (!endpoint || typeof endpoint !== 'string' || endpoint.trim() === '') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'endpoint must be a non-empty string'
    });
  }

  if (timestamp !== undefined) {
    const timeNum = Number(timestamp);
    if (isNaN(timeNum) || timeNum <= 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'timestamp must be a valid positive Unix timestamp in milliseconds'
      });
    }
  }

  next();
}

module.exports = {
  validateCheckLimit
};
