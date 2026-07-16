const logger = require('./logger');

const URL = 'http://localhost:3000/api/v1/check-limit';
const ENDPOINTS = ['/api/data-stream', '/api/upload', '/api/billing', '/api/users'];
const TIERS = ['free', 'pro', 'enterprise'];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Send a single simulated rate-limit check query
 */
async function sendRequest() {
  const tier = getRandomItem(TIERS);
  const userId = `${tier}_user_${Math.floor(Math.random() * 30)}`;
  const endpoint = getRandomItem(ENDPOINTS);

  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Tier': tier
      },
      body: JSON.stringify({
        user_id: userId,
        endpoint,
        timestamp: Date.now()
      })
    });

    const data = await res.json();
    
    // Log outcomes
    if (data.allowed) {
      logger.info({ userId, endpoint, tier, status: res.status, remaining: data.remaining }, 'Request Allowed');
    } else {
      logger.warn({ userId, endpoint, tier, status: res.status, retryAfter: data.retry_after }, 'Request Rejected (Rate Limited)');
    }
  } catch (err) {
    logger.error({ error: err.message }, 'Simulation request connection error');
  }
}

/**
 * Trigger a burst of traffic for 15 seconds to generate analytics data
 */
function runSimulation() {
  logger.info('Starting rate limiter traffic simulation. Generating telemetry...');
  
  // Fire 6 requests every 150ms
  const intervalId = setInterval(() => {
    for (let i = 0; i < 6; i++) {
      sendRequest();
    }
  }, 150);

  // Stop after 15 seconds
  setTimeout(() => {
    clearInterval(intervalId);
    logger.info('Traffic simulation run completed. Check http://localhost:3000/dashboard to view the telemetry!');
  }, 15000);
}

runSimulation();
