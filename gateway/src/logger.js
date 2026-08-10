const fs = require('fs');
const path = require('path');
const morgan = require('morgan');

const logDir = path.join(__dirname, '..', 'logs');
fs.mkdirSync(logDir, { recursive: true });

morgan.token('id', (req) => req.id);

const consoleFormat = ':date[iso] :id :method :url :status :response-time ms';
const fileFormat = ':date[iso] :id :remote-addr :method :url :status :res[content-length] :response-time ms';

const accessLogStream = fs.createWriteStream(path.join(logDir, 'access.log'), { flags: 'a' });

const consoleLogger = morgan(consoleFormat);
const fileLogger = morgan(fileFormat, { stream: accessLogStream });

module.exports = { consoleLogger, fileLogger };
