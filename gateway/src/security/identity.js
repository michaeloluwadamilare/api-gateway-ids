// Composite client identity: IP alone is defeated by NAT and doesn't
// distinguish two attackers behind the same address, so it's combined with
// the authenticated JWT subject where one exists (Dissertation Proposal,
// 2.5/3.2).
function getCompositeIdentity(req) {
  const subject = req.auth?.sub || 'anon';
  return `${req.ip}:${subject}`;
}

module.exports = { getCompositeIdentity };
