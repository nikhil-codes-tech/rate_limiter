const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { isRateLimited } = require('../limiter/slidingWindow');
const { logAudit } = require('../db');
const { validateCheckLimit } = require('../middleware/validator');
const { client } = require('../redis');
const config = require('../config');
const metrics = require('../metrics');
const logger = require('../logger');

// Endpoint-specific rules overrides
const ENDPOINT_RULES = {
  '/api/upload': {
    free: { limit: 2, windowMs: 60000 },
    pro: { limit: 10, windowMs: 60000 },
    enterprise: { limit: 50, windowMs: 60000 }
  }
};

/**
 * Dispatch webhook alerts to all registered listeners asynchronously.
 */
function dispatchWebhookAlerts(userId, endpoint, limit, resetAt, now) {
  Promise.resolve().then(async () => {
    try {
      if (!client.isOpen) return;
      const webhooks = await client.sMembers('webhooks_registry');
      if (!webhooks || webhooks.length === 0) return;

      const payload = JSON.stringify({
        event: 'rate_limit_exceeded',
        user_id: userId,
        endpoint,
        timestamp: new Date(now).toISOString(),
        limit_quota: limit,
        reset_at: new Date(resetAt).toISOString()
      });

      const promises = webhooks.map(async (url) => {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Rate-Limiter-Webhook-Service'
            },
            body: payload,
            signal: AbortSignal.timeout(2000)
          });
          if (!res.ok) {
            logger.warn({ url, status: res.status }, 'Webhook receiver returned non-2xx status');
          }
        } catch (err) {
          logger.error({ err, url }, 'Failed to dispatch webhook alert to URL');
        }
      });

      await Promise.allSettled(promises);
    } catch (err) {
      logger.error({ err }, 'Error in webhook dispatch engine');
    }
  });
}

/**
 * POST /api/v1/check-limit
 * Check if request is allowed under rate limits
 */
router.post('/check-limit', validateCheckLimit, async (req, res, next) => {
  const hrStart = process.hrtime();
  
  const apiKey = req.headers['x-api-key'];
  const traceId = req.headers['x-trace-id'] || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
  const algo = req.headers['x-rate-limiter-algo'] || 'sliding';
  const { user_id: bodyUserId, endpoint, timestamp } = req.body;
  
  let now = timestamp ? Number(timestamp) : Date.now();

  // Chaos Hook: Force clock skew
  if (req.headers['x-chaos-clock-skew'] === 'true') {
    now = Date.now() + 10000;
  }

  // Clock Skew Verification
  if (now - Date.now() > 5000) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Clock Skew Detected: request timestamp is too far in the future (>5s)'
    });
  }

  let activeUserId;
  let tier;

  // 1. Authenticate API Key or deduce tier from User ID
  if (apiKey) {
    const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');
    let keyData = null;

    // Check Redis dynamic keys first
    try {
      if (client.isOpen) {
        const customKeyStr = await client.get(`api_key:${hashedKey}`);
        if (customKeyStr) {
          keyData = JSON.parse(customKeyStr);
        }
      }
    } catch (err) {
      logger.warn({ err, hashedKey }, 'Failed to fetch API key metadata from Redis');
    }

    // Fall back to default mock API keys
    if (!keyData) {
      keyData = config.mockApiKeys[hashedKey];
    }

    if (!keyData) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API Key'
      });
    }

    activeUserId = keyData.userId;
    tier = keyData.tier;
  } else {
    activeUserId = bodyUserId;
    // Deduce tenant tier from user_id prefix or header
    tier = req.headers['x-user-tier'] || 'free';
    if (activeUserId.startsWith('enterprise_')) {
      tier = 'enterprise';
    } else if (activeUserId.startsWith('pro_')) {
      tier = 'pro';
    } else if (activeUserId.startsWith('free_')) {
      tier = 'free';
    }
  }

  // Fallback to free if an invalid tier is supplied
  if (!config.rules[tier]) {
    tier = 'free';
  }

  // 2. Fetch specific rules (applying user overrides from Redis first, then endpoint overrides, then tier defaults)
  let rule = null;

  try {
    if (client.isOpen) {
      const customRuleStr = await client.get(`rule_override:${activeUserId}`);
      if (customRuleStr) {
        rule = JSON.parse(customRuleStr);
      }
    }
  } catch (err) {
    logger.warn({ err, activeUserId }, 'Failed to fetch user quota override from Redis');
  }

  if (!rule) {
    if (ENDPOINT_RULES[endpoint] && ENDPOINT_RULES[endpoint][tier]) {
      rule = ENDPOINT_RULES[endpoint][tier];
    } else {
      rule = config.rules[tier];
    }
  }

  try {
    let result;

    // Chaos Hooks: Simulate Redis failures directly in the gateway layer
    if (req.headers['x-chaos-redis-timeout'] === 'true') {
      logger.warn({ activeUserId }, 'Simulating Redis Timeout Chaos Hook');
      result = { allowed: true, remaining: 0, resetAt: now + rule.windowMs, fallback: true };
    } else if (req.headers['x-chaos-net-partition'] === 'true') {
      logger.warn({ activeUserId }, 'Simulating Redis Network Partition Chaos Hook');
      result = { allowed: true, remaining: 0, resetAt: now + rule.windowMs, fallback: true };
    } else {
      // 3. Query the rate limiting state engine (with circuit breaker)
      result = await isRateLimited(activeUserId, endpoint, rule, now, algo);
    }

    // 4. Set standard response headers
    res.setHeader('RateLimit-Limit', rule.limit);
    res.setHeader('RateLimit-Remaining', result.remaining);
    res.setHeader('RateLimit-Reset', result.resetAt);
    res.setHeader('X-Trace-ID', traceId);
    res.setHeader('X-Rate-Limiter-Algo', algo);

    // Set Retry-After header in seconds if rate limited
    const retryAfter = result.allowed ? undefined : Math.max(1, Math.ceil((result.resetAt - now) / 1000));
    if (retryAfter !== undefined) {
      res.setHeader('Retry-After', retryAfter);
    }

    // Extract client IP address
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Calculate decision duration
    const diff = process.hrtime(hrStart);
    const latencyMs = (diff[0] * 1000) + (diff[1] / 1e6);
    const durationInSeconds = diff[0] + diff[1] / 1e9;

    // 5. Fire-and-forget logging to Postgres Audit Trail (including latency & trace ID)
    logAudit(
      activeUserId,
      endpoint,
      result.allowed,
      rule.limit,
      result.remaining,
      result.resetAt,
      !!result.fallback,
      result.allowed ? null : 'RATE_LIMIT_EXCEEDED',
      ipAddress,
      latencyMs,
      traceId
    );

    // If rate limited, asynchronously dispatch webhooks
    if (!result.allowed) {
      dispatchWebhookAlerts(activeUserId, endpoint, rule.limit, result.resetAt, now);
    }

    let statusLabel = 'allowed';
    if (!result.allowed) statusLabel = 'rejected';
    if (result.fallback) statusLabel = 'fallback';

    metrics.totalChecks.inc({ endpoint, tier, status: statusLabel });
    metrics.checkDuration.observe({ endpoint, tier, status: statusLabel }, durationInSeconds);

    // 7. Construct response payload
    const responsePayload = {
      allowed: result.allowed,
      remaining: result.remaining,
      limit: rule.limit,
      reset_at: result.resetAt,
      trace_id: traceId,
      algorithm: algo
    };

    if (result.fallback) {
      responsePayload.fallback = true;
    }

    if (!result.allowed) {
      responsePayload.retry_after = retryAfter;
    }

    return res.status(result.allowed ? 200 : 429).json(responsePayload);

  } catch (err) {
    metrics.totalChecks.inc({ endpoint, tier, status: 'error' });
    next(err);
  }
});

module.exports = router;
