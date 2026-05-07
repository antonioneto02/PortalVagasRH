const express = require('express');
const router = express.Router();
const { requireAuth } = require('../controllers/loginController');
const { listarVagas, cadastrarVaga } = require('../controllers/vagasController');

router.get('/vagas', requireAuth, listarVagas);
router.post('/vagas', requireAuth, cadastrarVaga);

module.exports = router;
