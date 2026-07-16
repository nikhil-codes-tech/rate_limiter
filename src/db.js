const { Pool } = require('pg');
const config = require('./config');
const logger = require('./logger');

const isLocal = config.db.connectionString.includes('localhost') || 
                config.db.connectionString.includes('127.0.0.1') || 
                config.db.connectionString.includes('rate-limiter-db');

const pool = new Pool({
  connectionString: config.db.connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
});

/**
 * Initialize database schema
 */
async function initDb() {
  const client = await pool.connect();
  try {
    logger.info('Initializing PostgreSQL database schema...');
    
    // Create audit logs table with UUID primary key
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) NOT NULL,
        endpoint VARCHAR(255) NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        allowed BOOLEAN NOT NULL,
        limit_quota INTEGER NOT NULL,
        remaining INTEGER NOT NULL,
        reset_at TIMESTAMPTZ NOT NULL,
        rejection_reason VARCHAR(255),
        fallback BOOLEAN DEFAULT FALSE,
        ip_address VARCHAR(45),
        latency_ms REAL,
        trace_id VARCHAR(50)
      );
    `);

    // Ensure backwards compatibility columns exist
    await client.query(`
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);
    `);
    await client.query(`
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS latency_ms REAL;
    `);
    await client.query(`
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS trace_id VARCHAR(50);
    `);

    // Create index for reporting/analytics queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_timestamp 
      ON audit_logs (user_id, timestamp DESC);
    `);

    logger.info('PostgreSQL schema initialized successfully');
  } catch (err) {
    if (err.code === '23505' || err.code === '42P07') {
      logger.info('Database schema already initialized or concurrent creation collision occurred. Continuing...');
    } else {
      logger.error({ err }, 'Failed to initialize database schema');
      throw err;
    }
  } finally {
    client.release();
  }
}

/**
 * Log a rate limit check outcome to PostgreSQL.
 * Executes in background asynchronously so it doesn't block the request lifecycle.
 */
function logAudit(userId, endpoint, allowed, limit, remaining, resetAt, fallback = false, rejectionReason = null, ipAddress = null, latencyMs = null, traceId = null) {
  const query = `
    INSERT INTO audit_logs (user_id, endpoint, timestamp, allowed, limit_quota, remaining, reset_at, fallback, rejection_reason, ip_address, latency_ms, trace_id)
    VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `;
  const values = [
    userId,
    endpoint,
    allowed,
    limit,
    remaining,
    new Date(resetAt),
    fallback,
    rejectionReason,
    ipAddress,
    latencyMs,
    traceId
  ];

  // Fire-and-forget query with error handling in callback to avoid blocking the Express request loop
  pool.query(query, values)
    .catch((err) => {
      logger.error({ err, userId, endpoint }, 'Failed to write audit log record');
    });
}

module.exports = {
  pool,
  initDb,
  logAudit
};
