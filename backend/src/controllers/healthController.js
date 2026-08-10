function getHealth(req, res) {
  res.json({ status: 'ok', service: 'backend', uptime: process.uptime() });
}

module.exports = { getHealth };
