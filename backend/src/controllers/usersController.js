const { findUserById } = require('../models/userModel');

// Sequential, guessable IDs are deliberate here - this is the BOLA
// enumeration target described in Table 4 (no ownership check is performed
// on purpose; that check is the gateway's R5 rule, not this stub's job).
async function getUserById(req, res, next) {
  try {
    const user = await findUserById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'user not found' });
    }

    return res.json({ id: user.id, email: user.email, displayName: user.displayName });
  } catch (err) {
    next(err);
  }
}

module.exports = { getUserById };
