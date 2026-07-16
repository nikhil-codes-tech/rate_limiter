const { createClient, defineScript } = require('redis');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const config = require('./config');

// Load the Lua script synchronously during startup
const luaScriptPath = path.join(__dirname, 'limiter', 'lua', 'sliding_window.lua');
let luaScriptContent;
try {
  luaScriptContent = fs.readFileSync(luaScriptPath, 'utf8');
} catch (err) {
  logger.error({ err, path: luaScriptPath }, 'Failed to read sliding_window.lua script');
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
      SCRIPT: luaScriptContent,
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
