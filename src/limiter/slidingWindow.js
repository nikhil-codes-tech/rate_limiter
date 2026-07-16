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

// Opossum Circuit Breaker options
const breakerOptions = {
  timeout: 1000,                // Timeout Redis commands after 1s
  errorThresholdPercentage: 50, // Open circuit if >50% fails
  resetTimeout: 10000           // Try to close circuit after 10s
};

const breaker = new CircuitBreaker(checkLimitInRedis, breakerOptions);

// Initialize metrics gauge to 0 (CLOSED)
metrics.circuitBreakerStatus.set(0);

// Breaker event listeners
breaker.on('open', () => {
  metrics.circuitBreakerStatus.set(2);
  logger.error('Redis circuit breaker OPEN. Requests will fail open.');
});

breaker.on('halfOpen', () => {
  metrics.circuitBreakerStatus.set(1);
  logger.info('Redis circuit breaker HALF-OPEN. Probing Redis health.');
});

breaker.on('close', () => {
  metrics.circuitBreakerStatus.set(0);
  logger.info('Redis circuit breaker CLOSED. Redis is functioning normally.');
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

/**
 * Verify whether a request is allowed based on user tier and endpoint
 * @param {string} userId 
 * @param {string} endpoint 
 * @param {{limit: number, windowMs: number}} tierRules 
 * @param {number} [now] 
 * @returns {Promise<{allowed: boolean, remaining: number, resetAt: number, fallback?: boolean}>}
 */
async function isRateLimited(userId, endpoint, tierRules, now = Date.now()) {
  const { limit, windowMs } = tierRules;
  const key = `rate_limit:${userId}:${endpoint}`;
  const requestId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

  try {
    return await breaker.fire(key, now, windowMs, limit, requestId);
  } catch (err) {
    // Fallback handles errors, but this catch ensures no unhandled rejections
    logger.error({ err, userId, endpoint }, 'Circuit breaker raised an unexpected exception.');
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
  breaker
};
