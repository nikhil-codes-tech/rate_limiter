const express = require('express');
const router = express.Router();
const { client } = require('../redis');
const { pool } = require('../db');
const config = require('../config');
const logger = require('../logger');

/**
 * POST /admin/set-limit
 * Adjust default rate limiting rule configuration for a tier in memory
 */
router.post('/set-limit', (req, res) => {
  const { tier, limit, windowMs } = req.body;

  if (!tier || limit === undefined || windowMs === undefined) {
    return res.status(400).json({ error: 'Missing tier, limit, or windowMs in payload' });
  }

  if (!['free', 'pro', 'enterprise'].includes(tier)) {
    return res.status(400).json({ error: 'Invalid tier. Must be free, pro, or enterprise' });
  }

  config.rules[tier] = {
    limit: Number(limit),
    windowMs: Number(windowMs)
  };

  logger.info({ tier, rule: config.rules[tier] }, 'Admin modified default tier limits');
  return res.json({ message: `Updated default rules for tier: ${tier}`, rules: config.rules[tier] });
});

/**
 * PATCH /admin/user/:id/quota
 * Apply a custom quota override for a specific user.
 * Stores override details in Redis so all instances pick it up.
 */
router.patch('/user/:id/quota', async (req, res) => {
  const userId = req.params.id;
  const { limit, windowMs } = req.body;

  if (limit === undefined || windowMs === undefined) {
    return res.status(400).json({ error: 'Missing limit or windowMs in payload' });
  }

  try {
    const key = `rule_override:${userId}`;
    const payload = JSON.stringify({ limit: Number(limit), windowMs: Number(windowMs) });
    await client.set(key, payload);
    logger.info({ userId, limit, windowMs }, 'Admin applied user quota override in Redis');
    return res.json({ message: `Custom quota override registered for user ${userId}` });
  } catch (err) {
    logger.error({ err, userId }, 'Failed to set custom quota override');
    return res.status(500).json({ error: 'Failed to record custom quota override' });
  }
});

/**
 * GET /admin/analytics/rejected-requests
 * Fetch history of rejected requests from PostgreSQL audit logs
 */
router.get('/analytics/rejected-requests', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, user_id, endpoint, timestamp, limit_quota, remaining, reset_at, rejection_reason, fallback
       FROM audit_logs
       WHERE allowed = false
       ORDER BY timestamp DESC
       LIMIT 100`
    );
    return res.json(result.rows);
  } catch (err) {
    logger.error({ err }, 'Failed to query rejected requests analytics');
    return res.status(500).json({ error: 'Failed to retrieve rejected requests history' });
  }
});

/**
 * DELETE /admin/user/:id/quota-reset
 * Flush a specific user's rate limiting state keys in Redis to force reset their quota
 */
router.delete('/user/:id/quota-reset', async (req, res) => {
  const userId = req.params.id;
  try {
    const pattern = `rate_limit:${userId}:*`;
    const keys = await client.keys(pattern);

    if (keys && keys.length > 0) {
      await client.del(keys);
      logger.info({ userId, keysCount: keys.length }, 'Forced quota reset for user in Redis');
      return res.json({ message: `Quota data reset successfully for user ${userId}`, keysRemoved: keys.length });
    }

    return res.json({ message: `No active rate-limiting keys found for user ${userId}`, keysRemoved: 0 });
  } catch (err) {
    logger.error({ err, userId }, 'Failed to execute forced quota reset');
    return res.status(500).json({ error: 'Failed to reset user quota' });
  }
});

/**
 * GET /admin/webhooks
 * List all registered webhook endpoints from Redis
 */
router.get('/webhooks', async (req, res) => {
  try {
    const webhooks = await client.sMembers('webhooks_registry');
    return res.json(webhooks || []);
  } catch (err) {
    logger.error({ err }, 'Failed to list webhooks');
    return res.status(500).json({ error: 'Failed to retrieve webhooks list' });
  }
});

/**
 * POST /admin/webhooks
 * Register a new webhook endpoint URL in Redis
 */
router.post('/webhooks', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'Missing webhook url parameter' });
  }
  try {
    await client.sAdd('webhooks_registry', url);
    logger.info({ url }, 'Registered new webhook URL');
    return res.json({ message: `Webhook URL ${url} registered successfully` });
  } catch (err) {
    logger.error({ err, url }, 'Failed to register webhook URL');
    return res.status(500).json({ error: 'Failed to register webhook' });
  }
});

/**
 * DELETE /admin/webhooks
 * Unregister a webhook URL from Redis
 */
router.delete('/webhooks', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'Missing webhook url parameter' });
  }
  try {
    const removedCount = await client.sRem('webhooks_registry', url);
    if (removedCount > 0) {
      logger.info({ url }, 'Unregistered webhook URL');
      return res.json({ message: `Webhook URL ${url} unregistered successfully` });
    }
    return res.status(404).json({ error: 'Webhook URL not found in registry' });
  } catch (err) {
    logger.error({ err, url }, 'Failed to unregister webhook URL');
    return res.status(500).json({ error: 'Failed to unregister webhook' });
  }
});

module.exports = router;
