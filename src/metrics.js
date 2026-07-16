const client = require('prom-client');

// Automatically scrape node process metrics
client.collectDefaultMetrics({ prefix: 'rate_limiter_' });

// Decision latency histogram targeting sub-millisecond p50 and under 10ms p99 response times
const checkDuration = new client.Histogram({
  name: 'rate_limiter_check_duration_seconds',
  help: 'Duration of rate limit decision check',
  labelNames: ['endpoint', 'tier', 'status'], // status: allowed, rejected, error, fallback
  buckets: [0.0005, 0.001, 0.002, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1] // precision buckets around <2ms & <10ms
});

// Counter of rate limit checks
const totalChecks = new client.Counter({
  name: 'rate_limiter_checks_total',
  help: 'Total rate limit evaluation requests',
  labelNames: ['endpoint', 'tier', 'status']
});

// Circuit breaker state representation
const circuitBreakerStatus = new client.Gauge({
  name: 'rate_limiter_circuit_breaker_state',
  help: 'Circuit breaker state: 0 = CLOSED, 1 = HALF-OPEN, 2 = OPEN',
});

module.exports = {
  register: client.register,
  checkDuration,
  totalChecks,
  circuitBreakerStatus
};
