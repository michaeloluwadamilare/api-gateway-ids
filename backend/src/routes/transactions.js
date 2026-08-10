const { Router } = require('express');
const { search } = require('../controllers/transactionsController');

const router = Router();

router.get('/transactions/search', search);

module.exports = router;
