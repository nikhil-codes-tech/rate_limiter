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

    // Seed PostgreSQL database with sample logs for recruiter demo if empty
    const countCheck = await client.query('SELECT COUNT(*) FROM audit_logs');
    const count = parseInt(countCheck.rows[0].count, 10);
    if (count === 0) {
      logger.info('Seeding database with sample audit log entries...');
      const seedQuery = `
        INSERT INTO audit_logs (user_id, endpoint, timestamp, allowed, limit_quota, remaining, reset_at, fallback, rejection_reason, ip_address, latency_ms, trace_id)
        VALUES 
          ('free_user_1', '/api/resource', NOW() - INTERVAL '5 minutes', true, 10, 9, NOW() + INTERVAL '55 seconds', false, null, '192.168.1.5', 0.85, '5a3fd92a-302a-4db3-bc1a-5d63f01abce2'),
          ('free_user_1', '/api/resource', NOW() - INTERVAL '4 minutes', true, 10, 8, NOW() + INTERVAL '50 seconds', false, null, '192.168.1.5', 0.72, '1d35af1a-200c-4fb6-bfd7-5ea3b0bc8c1b'),
          ('free_user_1', '/api/resource', NOW() - INTERVAL '3 minutes', true, 10, 0, NOW() + INTERVAL '45 seconds', false, null, '192.168.1.5', 0.90, 'bfd620ac-4b01-447a-af18-e8fa01cb2a01'),
          ('free_user_1', '/api/resource', NOW() - INTERVAL '2 minutes', false, 10, 0, NOW() + INTERVAL '40 seconds', false, 'RATE_LIMIT_EXCEEDED', '192.168.1.5', 0.95, '7b2c01da-c90a-4bf7-bfd2-1c25a0bc01cb'),
          ('pro_user_42', '/api/upload', NOW() - INTERVAL '1 minute', true, 100, 99, NOW() + INTERVAL '59 seconds', false, null, '10.0.0.8', 1.25, '1d0a5e8c-8cbf-4c8d-b0bc-1025a07cb2ea'),
          ('api_client_1', '/api/resource', NOW() - INTERVAL '30 seconds', true, 10, 0, NOW() + INTERVAL '30 seconds', true, null, '172.16.0.4', 0.55, 'fbc20da1-80fc-4c8d-bf8d-d6023ea0fca8')
      `;
      await client.query(seedQuery);
      logger.info('Database seeded successfully.');
    }

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
