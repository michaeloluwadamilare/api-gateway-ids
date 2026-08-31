const { findUserById } = require('../models/userModel');

// No ownership check on purpose - the BOLA/enumeration target.
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
