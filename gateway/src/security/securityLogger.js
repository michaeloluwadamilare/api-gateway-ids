const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '..', '..', 'logs');
fs.mkdirSync(logDir, { recursive: true });

const securityLogStream = fs.createWriteStream(path.join(logDir, 'security.log'), { flags: 'a' });

function logSecurityEvent(event) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...event });
  securityLogStream.write(`${line}\n`);
  console.warn(`[security] ${line}`);
}

module.exports = { logSecurityEvent };
