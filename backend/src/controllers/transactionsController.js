const { searchTransactions } = require('../models/transactionModel');

async function search(req, res, next) {
  try {
    const { q } = req.query;
    const transactions = await searchTransactions(q);
    return res.json(transactions);
  } catch (err) {
    next(err);
  }
}

module.exports = { search };
