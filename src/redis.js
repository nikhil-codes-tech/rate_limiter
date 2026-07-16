const { createClient, defineScript } = require('redis');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const config = require('./config');

// Load the Lua scripts synchronously during startup
const slidingWindowPath = path.join(__dirname, 'limiter', 'lua', 'sliding_window.lua');
const tokenBucketPath = path.join(__dirname, 'limiter', 'lua', 'token_bucket.lua');
let slidingScriptContent;
let tokenScriptContent;
try {
  slidingScriptContent = fs.readFileSync(slidingWindowPath, 'utf8');
  tokenScriptContent = fs.readFileSync(tokenBucketPath, 'utf8');
} catch (err) {
  logger.error({ err }, 'Failed to read rate limiter Lua scripts');
  process.exit(1);
}

let redisUrl = config.redis.url;
const isLocalRedis = redisUrl.includes('localhost') || 
                     redisUrl.includes('127.0.0.1') || 
                     redisUrl.includes('rate-limiter-redis');

if (!isLocalRedis && redisUrl.startsWith('redis://')) {
  redisUrl = redisUrl.replace('redis://', 'rediss://');
}

const client = createClient({
  url: redisUrl,
  scripts: {
    checkLimit: defineScript({
      NUMBER_OF_KEYS: 1,
      SCRIPT: slidingScriptContent,
      parseCommand(parser, key, now, windowMs, limit, requestId) {
        parser.pushKey(key);
        parser.push(now);
        parser.push(windowMs);
        parser.push(limit);
        parser.push(requestId);
      },
      transformReply(reply) {
        return reply;
      }
    }),
    checkBucket: defineScript({
      NUMBER_OF_KEYS: 1,
      SCRIPT: tokenScriptContent,
      parseCommand(parser, key, now, windowMs, limit) {
        parser.pushKey(key);
        parser.push(now);
        parser.push(windowMs);
        parser.push(limit);
      },
      transformReply(reply) {
        return reply;
      }
    })
  }
});

client.on('error', (err) => {
  logger.error({ err }, 'Redis client error');
});

client.on('connect', () => {
  logger.info('Redis connection initiated');
});

client.on('ready', () => {
  logger.info('Redis client connected and ready');
});

async function connectRedis() {
  if (!client.isOpen) {
    await client.connect();
  }
  return client;
}

module.exports = {
  client,
  connectRedis
};
