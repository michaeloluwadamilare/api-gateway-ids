const { Router } = require('express');
const {
  getAccountById,
  listAccountTransactions,
  createAccountTransaction,
} = require('../controllers/accountsController');

const router = Router();

router.get('/accounts/:id', getAccountById);
router.get('/accounts/:id/transactions', listAccountTransactions);
router.post('/accounts/:id/transactions', createAccountTransaction);

module.exports = router;
