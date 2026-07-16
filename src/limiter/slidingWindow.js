const CircuitBreaker = require('opossum');
const crypto = require('crypto');
const { client } = require('../redis');
const logger = require('../logger');
const metrics = require('../metrics');

/**
 * Execute the Redis Lua script for rate limiting
 * @returns {Promise<{allowed: boolean, remaining: number, resetAt: number}>}
 */
async function checkLimitInRedis(key, now, windowMs, limit, requestId) {
  // Check if client is open/connected before attempting command
  if (!client.isOpen) {
    throw new Error('Redis client is not connected');
  }
  
  // Lua script execution
  // result format: [1/0, remaining, reset_at]
  const result = await client.checkLimit(
    key, 
    String(now), 
    String(windowMs), 
    String(limit), 
    requestId
  );
  
  return {
    allowed: result[0] === 1,
    remaining: Number(result[1]),
    resetAt: Number(result[2])
  };
}

async function checkBucketInRedis(key, now, windowMs, limit) {
  if (!client.isOpen) {
    throw new Error('Redis client is not connected');
  }
  // Lua script execution for token bucket
  // result format: [1/0, remaining, reset_at]
  const result = await client.checkBucket(
    key,
    String(now),
    String(windowMs),
    String(limit)
  );
  return {
    allowed: result[0] === 1,
    remaining: Number(result[1]),
    resetAt: Number(result[2])
  };
}

// Opossum Circuit Breaker options
const breakerOptions = {
  timeout: 1000,                // Timeout Redis commands after 1s
  errorThresholdPercentage: 50, // Open circuit if >50% fails
  resetTimeout: 10000           // Try to close circuit after 10s
};

const breaker = new CircuitBreaker(checkLimitInRedis, breakerOptions);
const bucketBreaker = new CircuitBreaker(checkBucketInRedis, breakerOptions);

// Initialize metrics gauge to 0 (CLOSED)
metrics.circuitBreakerStatus.set(0);

// Breaker event listeners
breaker.on('open', () => {
  metrics.circuitBreakerStatus.set(2);
  logger.error('Redis sliding window circuit breaker OPEN. Requests will fail open.');
});

breaker.on('halfOpen', () => {
  metrics.circuitBreakerStatus.set(1);
  logger.info('Redis sliding window circuit breaker HALF-OPEN. Probing Redis health.');
});

breaker.on('close', () => {
  metrics.circuitBreakerStatus.set(0);
  logger.info('Redis sliding window circuit breaker CLOSED. Redis is functioning normally.');
});

bucketBreaker.on('open', () => {
  logger.error('Redis token bucket circuit breaker OPEN. Requests will fail open.');
});

// Fallback logic when Redis is down or circuit is open (fail-open strategy)
breaker.fallback((key, now, windowMs, limit, requestId, error) => {
  logger.warn({ key, requestId, error: error?.message }, 'Redis rate limit lookup failed. Falling back (Fail-Open).');
  return {
    allowed: true,
    remaining: 0,
    resetAt: now + windowMs,
    fallback: true
  };
});

bucketBreaker.fallback((key, now, windowMs, limit, error) => {
  logger.warn({ key, error: error?.message }, 'Redis token bucket lookup failed. Falling back (Fail-Open).');
  return {
    allowed: true,
    remaining: 0,
    resetAt: now + windowMs,
    fallback: true
  };
});

/**
 * Verify whether a request is allowed based on user tier and endpoint
 * @param {string} userId 
 * @param {string} endpoint 
 * @param {{limit: number, windowMs: number}} tierRules 
 * @param {number} [now] 
 * @param {string} [algo]
 * @returns {Promise<{allowed: boolean, remaining: number, resetAt: number, fallback?: boolean}>}
 */
async function isRateLimited(userId, endpoint, tierRules, now = Date.now(), algo = 'sliding') {
  const { limit, windowMs } = tierRules;
  const requestId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

  try {
    if (algo === 'bucket') {
      const key = `rate_limit:bucket:${userId}:${endpoint}`;
      return await bucketBreaker.fire(key, now, windowMs, limit);
    } else {
      const key = `rate_limit:${userId}:${endpoint}`;
      return await breaker.fire(key, now, windowMs, limit, requestId);
    }
  } catch (err) {
    // Fallback handles errors, but this catch ensures no unhandled rejections
    logger.error({ err, userId, endpoint, algo }, 'Circuit breaker raised an unexpected exception.');
    return {
      allowed: true,
      remaining: 0,
      resetAt: now + windowMs,
      fallback: true
    };
  }
}

module.exports = {
  isRateLimited,
  breaker,
  bucketBreaker
};
