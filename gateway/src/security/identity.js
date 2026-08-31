// IP alone is defeated by NAT, so it's combined with the JWT subject where one exists.
function getCompositeIdentity(req) {
  const subject = req.auth?.sub || 'anon';
  return `${req.ip}:${subject}`;
}

module.exports = { getCompositeIdentity };
