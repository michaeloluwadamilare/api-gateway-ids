const { jsonPost } = require('./httpClient');

async function login(baseUrl, email, password, forwardedFor) {
  const obs = await jsonPost(`${baseUrl}/api/auth/login`, { email, password }, { forwardedFor });
  const token = obs.body?.token || null;
  return { token, observation: obs };
}

module.exports = { login };
