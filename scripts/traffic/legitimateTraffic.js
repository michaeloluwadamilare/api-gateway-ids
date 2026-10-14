const { authedGet, sleep } = require('../lib/httpClient');
const { login } = require('../lib/auth');

const LEG_SEARCH_TERMS = ['Tesco', 'Amazon', 'rent', 'salary', 'coffee', 'gym', 'Netflix', 'groceries'];

function randomOf(list) {
  return list[Math.floor(Math.random() * list.length)];
}

async function runLegitimateUser(baseUrl, user, { count = 20, requestsPerSecond = 3 } = {}) {
  const intervalMs = 1000 / requestsPerSecond;
  const observations = [];

  const { token, observation: loginObs } = await login(baseUrl, user.email, user.password, user.ip);
  observations.push(loginObs);
  if (!token) {
    return { category: 'legitimate', observations };
  }
  await sleep(intervalMs);

  for (let i = 0; i < count; i++) {
    const roll = Math.random();
    let url;
    if (roll < 0.35) {
      url = `${baseUrl}/api/accounts/${user.id}`;
    } else if (roll < 0.6) {
      url = `${baseUrl}/api/accounts/${user.id}/transactions`;
    } else if (roll < 0.85) {
      url = `${baseUrl}/api/transactions/search?q=${encodeURIComponent(randomOf(LEG_SEARCH_TERMS))}`;
    } else {
      url = `${baseUrl}/api/users/${user.id}`;
    }
    observations.push(await authedGet(url, token, user.ip));
    await sleep(intervalMs);
  }

  return { category: 'legitimate', observations };
}

async function runLegitimateBatch(baseUrl, users, { usersCount = 3, requestsPerUser = 20, requestsPerSecond = 3 } = {}) {
  const selected = Array.from({ length: usersCount }, (_, i) => users[i % users.length]);
  const runs = await Promise.all(
    selected.map((user) => runLegitimateUser(baseUrl, user, { count: requestsPerUser, requestsPerSecond }))
  );
  return runs;
}

module.exports = { runLegitimateUser, runLegitimateBatch };
