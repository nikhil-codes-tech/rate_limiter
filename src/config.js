require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    retryDelay: parseInt(process.env.REDIS_RETRY_DELAY || '1000', 10),
    maxRetries: parseInt(process.env.REDIS_MAX_RETRIES || '10', 10),
  },
  db: {
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/limiter',
  },
  // Default rules for different tiers
  rules: {
    free: { limit: 10, windowMs: 60000 },       // 10 req/min
    pro: { limit: 100, windowMs: 60000 },       // 100 req/min
    enterprise: { limit: 1000, windowMs: 60000 } // 1000 req/min
  }
};
