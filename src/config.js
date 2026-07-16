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
    connectionString: process.env.DATABASE_URL || process.env.DB_URL || 'postgresql://postgres:postgres@localhost:5432/limiter',
  },
  // Default rules for different tiers
  rules: {
    free: { limit: 10, windowMs: 60000 },       // 10 req/min
    pro: { limit: 100, windowMs: 60000 },       // 100 req/min
    enterprise: { limit: 1000, windowMs: 60000 } // 1000 req/min
  },
  // Default hashed mock API keys for local demo & verification
  mockApiKeys: {
    '7480c171977075c7a3f2a9aa9b6b9b0784f500ba93db89c3ca17d617159ff490': { userId: 'free_api_user', tier: 'free' },
    '3b608fe64bd9881f64880837d30f91bfd6dc992270962d38bbf45439338953e6': { userId: 'pro_api_user', tier: 'pro' },
    '5536d925b56187145f74d599c0983048dec06b1c510839d5da023b45381950c7': { userId: 'enterprise_api_user', tier: 'enterprise' }
  },
  // Admin routes protection limits (30 req / minute)
  adminRateLimit: { limit: 30, windowMs: 60000 }
};
