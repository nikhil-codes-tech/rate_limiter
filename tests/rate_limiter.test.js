const { isRateLimited, breaker } = require('../src/limiter/slidingWindow');
const { client } = require('../src/redis');

jest.mock('../src/redis', () => {
  return {
    client: {
      isOpen: true,
      checkLimit: jest.fn()
    }
  };
});

describe('Sliding Window Rate Limiter Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    breaker.close(); // Reset breaker to closed state
  });

  test('should allow request and return correct remaining count', async () => {
    client.checkLimit.mockResolvedValue([1, 4, 1000]);

    const res = await isRateLimited('user123', '/api/test', { limit: 5, windowMs: 1000 }, 100);

    expect(res).toEqual({
      allowed: true,
      remaining: 4,
      resetAt: 1000
    });
    expect(client.checkLimit).toHaveBeenCalledWith(
      'rate_limit:user123:/api/test',
      '100',
      '1000',
      '5',
      expect.any(String)
    );
  });

  test('should reject request when rate limit exceeded', async () => {
    client.checkLimit.mockResolvedValue([0, 0, 1050]);

    const res = await isRateLimited('user123', '/api/test', { limit: 5, windowMs: 1000 }, 100);

    expect(res).toEqual({
      allowed: false,
      remaining: 0,
      resetAt: 1050
    });
  });

  test('should fail open when Redis throws an error', async () => {
    client.checkLimit.mockRejectedValue(new Error('Redis connection lost'));

    const res = await isRateLimited('user123', '/api/test', { limit: 5, windowMs: 1000 }, 100);

    expect(res).toEqual({
      allowed: true,
      remaining: 0,
      resetAt: 1100, // 100 + 1000
      fallback: true
    });
  });
});
