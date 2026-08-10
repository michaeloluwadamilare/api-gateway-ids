const { Router } = require('express');

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'gateway', uptime: process.uptime() });
});

module.exports = router;
