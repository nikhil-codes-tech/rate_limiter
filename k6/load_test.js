import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '5s', target: 50 },   // Warmup: Ramp up to 50 concurrent users
    { duration: '15s', target: 150 }, // Stress: Ramp up to 150 concurrent users
    { duration: '5s', target: 0 },    // Ramp down
  ],
  thresholds: {
    // Latency checks to ensure sub-millisecond to low millisecond decision limits
    http_req_duration: ['p(90)<5', 'p(99)<10'], // 90% under 5ms, 99% under 10ms
  },
};

export default function () {
  const url = 'http://localhost:3000/api/v1/check-limit';
  
  // Randomly distribute requests across tiers and users
  const rand = Math.random();
  let userId;
  let tier;
  
  if (rand > 0.8) {
    userId = `enterprise_user_${Math.floor(Math.random() * 10)}`;
    tier = 'enterprise';
  } else if (rand > 0.5) {
    userId = `pro_user_${Math.floor(Math.random() * 50)}`;
    tier = 'pro';
  } else {
    userId = `free_user_${Math.floor(Math.random() * 100)}`;
    tier = 'free';
  }

  const payload = JSON.stringify({
    user_id: userId,
    endpoint: '/api/data-stream',
    timestamp: Date.now()
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-User-Tier': tier,
    },
  };

  const res = http.post(url, payload, params);

  // Assert response code is either 200 OK or 429 Too Many Requests, and headers are present
  check(res, {
    'status is 200 or 429': (r) => r.status === 200 || r.status === 429,
    'contains ratelimit limit header': (r) => r.headers['Ratelimit-Limit'] !== undefined,
    'contains ratelimit remaining header': (r) => r.headers['Ratelimit-Remaining'] !== undefined,
    'contains ratelimit reset header': (r) => r.headers['Ratelimit-Reset'] !== undefined,
  });

  // Short pause to control loop execution throughput
  sleep(0.01);
}
