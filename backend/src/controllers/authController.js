const bcrypt = require('bcryptjs');
const { findUserByEmail } = require('../models/userModel');
const { signToken } = require('../security/jwt');

async function register(req, res, next) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'an account with that email already exists' });
    }

    // Not persisted - this stub only needs to exist so the endpoint shape is
    // testable, the seeded users in database cover the login/brute-force cases.
    return res.status(201).json({ message: 'account created', email });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await findUserByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    return res.json({
      token: signToken(user),
      user: { id: user.id, email: user.email, displayName: user.displayName },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login };
