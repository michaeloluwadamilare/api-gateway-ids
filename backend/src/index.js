require('dotenv').config();

const createApp = require('./app');
const initializeDatabase = require('./db/init');

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await initializeDatabase();
    const app = createApp();
    app.listen(PORT, () => {
      console.log(`[backend] listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('[backend] Failed to start:', err);
    process.exit(1);
  }
}

start();

