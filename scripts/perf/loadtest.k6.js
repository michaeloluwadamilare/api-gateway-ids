import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.TARGET_URL;
const TOKENS = __ENV.TOKENS_FILE ? JSON.parse(open(__ENV.TOKENS_FILE)) : [];
const blockedResponses = new Counter('gateway_blocked_responses');

export const options = {
  scenarios: {
    constant_load: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 10),
      duration: __ENV.DURATION || '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<1.0'],
  },
};

function randomToken() {
  if (TOKENS.length === 0) return __ENV.AUTH_TOKEN || '';
  return TOKENS[Math.floor(Math.random() * TOKENS.length)].token;
}

export default function () {
  const res = http.get(`${BASE_URL}/api/accounts/1`, {
    headers: { Authorization: `Bearer ${randomToken()}` },
  });
  if (res.status === 403 || res.status === 429) {
    blockedResponses.add(1);
  }
  check(res, { 'not a server error': (r) => r.status < 500 });
}
