const crypto = require('crypto');

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8080';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';


function syntheticIp(label) {
  const hash = crypto.createHash('md5').update(label).digest();
  return `10.${hash[0]}.${hash[1]}.${hash[2]}`;
}

const CONDITIONS = {
  A: { label: 'unprotected', baseUrl: BACKEND_URL, gatewayMode: null },
  B: { label: 'static', baseUrl: GATEWAY_URL, gatewayMode: 'static' },
  C: { label: 'adaptive', baseUrl: GATEWAY_URL, gatewayMode: 'adaptive' },
};

// Seeded users
const SEEDED_USERS = [
  { email: 'alice@example.com', password: 'Password123!', id: 1, ip: syntheticIp('alice@example.com') },
  { email: 'bob@example.com', password: 'Password123!', id: 2, ip: syntheticIp('bob@example.com') },
  { email: 'chloe@example.com', password: 'Password123!', id: 3, ip: syntheticIp('chloe@example.com') },
];

// runExperiment.js runs an attack concurrently with legitimate traffic

const LEGITIMATE_POOL_USERS = SEEDED_USERS.slice(0, 2); // alice, bob
const ATTACKER_USER = SEEDED_USERS[2];
const R2_ATTACKER_IP = syntheticIp('r2-jwt-manipulation-attacker');
const R3_ATTACKER_IP = syntheticIp('r3-brute-force-attacker');
const R4_ATTACKER_IP = syntheticIp('r4-credential-stuffing-attacker');


const GATEWAY_ERROR_MARKERS = new Set(['unauthorized', 'blocked by IDS', 'challenge required']);
const ESCALATED_TIERS = new Set(['T3', 'T4']);

function isDetectedResponse({ tier, body }) {
  if (body && GATEWAY_ERROR_MARKERS.has(body.error)) return true;
  if (tier && ESCALATED_TIERS.has(tier)) return true;
  return false;
}

module.exports = {
  GATEWAY_URL,
  BACKEND_URL,
  CONDITIONS,
  SEEDED_USERS,
  LEGITIMATE_POOL_USERS,
  ATTACKER_USER,
  R2_ATTACKER_IP,
  R3_ATTACKER_IP,
  R4_ATTACKER_IP,
  syntheticIp,
  isDetectedResponse,
};
