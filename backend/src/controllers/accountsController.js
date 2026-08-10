const { findAccountById } = require('../models/accountModel');
const { findTransactionsByAccountId, addTransaction } = require('../models/transactionModel');

async function getAccountById(req, res, next) {
  try {
    const account = await findAccountById(req.params.id);

    if (!account) {
      return res.status(404).json({ error: 'account not found' });
    }

    return res.json(account);
  } catch (err) {
    next(err);
  }
}

async function listAccountTransactions(req, res, next) {
  try {
    const account = await findAccountById(req.params.id);

    if (!account) {
      return res.status(404).json({ error: 'account not found' });
    }

    const transactions = await findTransactionsByAccountId(account.id);
    return res.json(transactions);
  } catch (err) {
    next(err);
  }
}

async function createAccountTransaction(req, res, next) {
  try {
    const account = await findAccountById(req.params.id);

    if (!account) {
      return res.status(404).json({ error: 'account not found' });
    }

    const { amount, description } = req.body || {};
    if (amount === undefined || Number.isNaN(Number(amount))) {
      return res.status(400).json({ error: 'amount must be a number' });
    }

    const transaction = await addTransaction({ accountId: account.id, amount, description });
    return res.status(201).json(transaction);
  } catch (err) {
    next(err);
  }
}

module.exports = { getAccountById, listAccountTransactions, createAccountTransaction };
