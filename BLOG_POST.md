# Engineering a High-Throughput Distributed Rate Limiter with Redis & Express

## 1. Why I Built This
In cloud architectures, API gateways face a constant barrage of abusive clients, duplicate requests, and Denial-of-Service (DoS) attacks. Standard in-memory rate limiting works well for single-node prototypes but falls apart in distributed environments. If you spin up multiple nodes behind a round-robin load balancer, in-memory limits double-count requests and allow client bursts that can easily overwhelm database backends.

I built this project to demonstrate a production-grade, distributed rate-limiting microservice designed for high concurrency (50k+ req/sec) and sub-millisecond decision latency, connected to live observability frameworks.

---

## 2. Choosing the Right Algorithm (Sliding Window vs. Token Bucket)

The service supports two rate-limiting algorithms, each answering a different architectural constraint:

### Sliding Window Counter (Strict Quota Enforcement)
The Sliding Window algorithm tracks individual request logs within a sliding time window using Redis Sorted Sets (ZSET). Timestamps are scored, and old entries are discarded.
* **Why it's selected**: Eliminates the "boundary burst" vulnerability of fixed window limits, where a client can consume their entire limit twice in a short span across window boundaries.
* **The Atomicity Problem**: Evaluating sliding limits requires reading the count of active members and then conditionally adding a new entry. If two parallel Express nodes attempt this check concurrently, they will read the same count, approve both requests, and breach the user's limit.
* **The Lua Solution**: I resolved this by moving the entire sliding window check-then-insert execution block into a single, atomic **Redis Lua script**. Because Redis is single-threaded, scripts run sequentially, guaranteeing thread safety without lock overhead.

### Token Bucket (Bursty API Handling)
The Token Bucket algorithm models quota as "tokens" in a bucket. Tokens refill over time at a constant rate up to a max capacity.
* **Why it's selected**: It allows sudden bursts of traffic when the bucket is full, smoothing load dynamically instead of blocking clients immediately.
* **Refill Mathematics**: Instead of updating tokens with active background cron refilling jobs (which would kill database performance), we calculate the refill dynamically on incoming requests:
  $$\text{refilled} = \min(\text{capacity}, \text{tokens} + \text{elapsed\_ms} \times \text{refill\_rate})$$

---

## 3. Performance Tuning Journey: Achieving <1.5ms Decision Latency

Hot paths in API Gateways cannot block. To achieve sub-millisecond decisions:

1. **Non-Blocking Telemetry Audits**:
   Logging request metadata is critical for compliance and billing. However, direct database writes to PostgreSQL take anywhere from 5ms to 20ms, which would choke the API gateway. I decoupled database auditing into **asynchronous, fire-and-forget background promises** in Node.js. Check decisions are returned instantly to the client, while insertion tasks resolve in the background.
2. **TLS Connection Optimization**:
   When deploying onto distributed serverless platforms like Vercel, cold connection starts can introduce delays. The backend dynamically parses connection strings, auto-upgrades Redis to secure TLS `rediss://` protocols, and reuses Postgres connection pools across function cycles.

---

## 4. Failure Scenarios & Graceful Degradation

Distributed services must be designed for failure. I integrated several resilience guards:

### Fail-Open Circuit Breakers (Resiliency over Accuracy)
If Redis crashes or undergoes a network partition:
* A basic limiter blocks all API routes.
* Instead, I wrapped the caching layer inside an **Opossum Circuit Breaker**. If Redis latency spikes or operations fail, the circuit opens, routing requests to a **Fail-Open Fallback**. The gateway allows the client through to preserve service availability, logging a `fallback: true` audit trail.

### Clock Skew Rejection
Sliding window rate limiters are vulnerable to clock skew. If a client tampers with request timestamps and sends future dates, they can bypass time windows. The router verifies drift bounds; if a client timestamp exceeds a 5-second future delta, the gateway blocks it with a `400 Bad Request`.
