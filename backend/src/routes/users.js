const { Router } = require('express');
const { getUserById } = require('../controllers/usersController');

const router = Router();

router.get('/users/:id', getUserById);

module.exports = router;
