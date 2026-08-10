const createApp = require('./app');
const { port } = require('./config');
const { connectRedis } = require('./redisClient');

async function start() {
  try {
    await connectRedis();
    const app = createApp();
    app.listen(port, () => {
      console.log(`[gateway] listening on port ${port}`);
    });
  } catch (err) {
    console.error('[gateway] Failed to start:', err);
    process.exit(1);
  }
}

start();
