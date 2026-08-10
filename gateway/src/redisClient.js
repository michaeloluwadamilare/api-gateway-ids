const { createClient } = require('redis');
const { redisUrl } = require('./config');

const redisClient = createClient({ url: redisUrl });

redisClient.on('error', (err) => console.error('[gateway] Redis client error:', err.message));

async function connectRedis() {
  await redisClient.connect();
  console.log(`[gateway] connected to Redis at ${redisUrl}`);
}

module.exports = { redisClient, connectRedis };
