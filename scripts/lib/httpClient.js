const { isDetectedResponse } = require('./config');

async function timedRequest(url, options = {}) {
  const startedAt = process.hrtime.bigint();
  try {
    const res = await fetch(url, options);
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const tier = res.headers.get('x-ids-tier');
    const score = res.headers.get('x-ids-score');
    let body = null;
    try {
      body = await res.json();
    } catch {
      // non-JSON or empty body - fine, not every response needs inspecting
    }

    const observation = {
      timestamp: new Date().toISOString(),
      url,
      method: options.method || 'GET',
      statusCode: res.status,
      tier: tier || null,
      score: score ? Number(score) : null,
      latencyMs,
      body,
    };
    observation.detected = isDetectedResponse(observation);
    return observation;
  } catch (err) {
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    return {
      timestamp: new Date().toISOString(),
      url,
      method: options.method || 'GET',
      statusCode: null,
      tier: null,
      score: null,
      latencyMs,
      error: err.message,
      detected: false,
    };
  }
}

function forwardedForHeader(forwardedFor) {
  return forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {};
}

function jsonPost(url, body, { headers = {}, forwardedFor } = {}) {
  return timedRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...forwardedForHeader(forwardedFor), ...headers },
    body: JSON.stringify(body),
  });
}

function authedGet(url, token, forwardedFor) {
  return timedRequest(url, {
    headers: { Authorization: `Bearer ${token}`, ...forwardedForHeader(forwardedFor) },
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { timedRequest, jsonPost, authedGet, sleep };
