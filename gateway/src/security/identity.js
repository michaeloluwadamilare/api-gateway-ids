function getCompositeIdentity(req) {
  const subject = req.auth?.sub || 'anon';
  return `${req.ip}:${subject}`;
}

module.exports = { getCompositeIdentity };
