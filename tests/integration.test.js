const request = require('supertest');
const app = require('../src/app');
const { client } = require('../src/redis');
const { pool } = require('../src/db');
const { breaker } = require('../src/limiter/slidingWindow');

jest.mock('../src/redis', () => {
  return {
    client: {
      isOpen: true,
      checkLimit: jest.fn(),
      get: jest.fn(),
      keys: jest.fn(),
      del: jest.fn(),
      sMembers: jest.fn(),
      sAdd: jest.fn(),
      sRem: jest.fn()
    },
    connectRedis: jest.fn()
  };
});

jest.mock('../src/db', () => {
  return {
    pool: {
      query: jest.fn()
    },
    initDb: jest.fn(),
    logAudit: jest.fn()
  };
});

describe('Express Pipeline & Admin Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    breaker.close();
  });

  describe('POST /api/v1/check-limit', () => {
    test('should reject invalid payload with 400', async () => {
      const res = await request(app)
        .post('/api/v1/check-limit')
        .send({ user_id: '', endpoint: '/api/test' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Bad Request');
    });

    test('should return 200 and allowed headers for valid requests', async () => {
      client.get.mockResolvedValue(null); // No custom rule override
      client.checkLimit.mockResolvedValue([1, 9, 2000]); // Allowed, 9 remaining, reset at 2000

      const res = await request(app)
        .post('/api/v1/check-limit')
        .send({ user_id: 'free_user1', endpoint: '/api/test' });

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        allowed: true,
        remaining: 9,
        limit: 10,
        reset_at: 2000
      });
      expect(res.headers['ratelimit-limit']).toBe('10');
      expect(res.headers['ratelimit-remaining']).toBe('9');
      expect(res.headers['ratelimit-reset']).toBe('2000');
    });

    test('should return 429 and retry-after headers when rate limited', async () => {
      client.get.mockResolvedValue(null);
      client.checkLimit.mockResolvedValue([0, 0, 1050]); // Rejected, 0 remaining, reset at 1050

      const res = await request(app)
        .post('/api/v1/check-limit')
        .send({ user_id: 'free_user1', endpoint: '/api/test', timestamp: 1000 });

      expect(res.statusCode).toBe(429);
      expect(res.body).toEqual({
        allowed: false,
        remaining: 0,
        limit: 10,
        reset_at: 1050,
        retry_after: 1
      });
      expect(res.headers['ratelimit-limit']).toBe('10');
      expect(res.headers['ratelimit-remaining']).toBe('0');
      expect(res.headers['ratelimit-reset']).toBe('1050');
      expect(res.headers['retry-after']).toBe('1');
    });

    test('should allow rate limiting check using a valid mock API key', async () => {
      client.get.mockResolvedValue(null);
      client.checkLimit.mockResolvedValue([1, 9, 2000]);

      const res = await request(app)
        .post('/api/v1/check-limit')
        .set('X-API-Key', 'free_key_123')
        .send({ endpoint: '/api/test' });

      expect(res.statusCode).toBe(200);
      expect(res.body.allowed).toBe(true);
      expect(res.body.remaining).toBe(9);
    });

    test('should reject rate limiting check with 401 using an invalid API key', async () => {
      const res = await request(app)
        .post('/api/v1/check-limit')
        .set('X-API-Key', 'invalid_key_abc')
        .send({ endpoint: '/api/test' });

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });
  });

  describe('Admin Endpoints', () => {
    test('DELETE /admin/user/:id/quota-reset', async () => {
      client.keys.mockResolvedValue(['rate_limit:user1:/api/test']);
      client.del.mockResolvedValue(1);

      const res = await request(app)
        .delete('/admin/user/user1/quota-reset');

      expect(res.statusCode).toBe(200);
      expect(res.body.keysRemoved).toBe(1);
    });

    test('GET /admin/analytics/rejected-requests', async () => {
      pool.query.mockResolvedValue({
        rows: [{ id: '1', user_id: 'user1', allowed: false, rejection_reason: 'RATE_LIMIT_EXCEEDED' }]
      });

      const res = await request(app)
        .get('/admin/analytics/rejected-requests');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].user_id).toBe('user1');
    });

    test('POST /admin/webhooks should register a URL', async () => {
      client.sAdd.mockResolvedValue(1);

      const res = await request(app)
        .post('/admin/webhooks')
        .send({ url: 'http://webhook.target' });

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('registered successfully');
      expect(client.sAdd).toHaveBeenCalledWith('webhooks_registry', 'http://webhook.target');
    });

    test('GET /admin/webhooks should retrieve URLs', async () => {
      client.sMembers.mockResolvedValue(['http://webhook1', 'http://webhook2']);

      const res = await request(app)
        .get('/admin/webhooks');

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(['http://webhook1', 'http://webhook2']);
    });

    test('DELETE /admin/webhooks should delete a URL', async () => {
      client.sRem.mockResolvedValue(1);

      const res = await request(app)
        .delete('/admin/webhooks')
        .send({ url: 'http://webhook.target' });

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('unregistered successfully');
      expect(client.sRem).toHaveBeenCalledWith('webhooks_registry', 'http://webhook.target');
    });
  });
});
