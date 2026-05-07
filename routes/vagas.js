const express = require('express');
const router = express.Router();
const { requireAuth } = require('../controllers/loginController');
const {
  listarVagas, cadastrarVaga,
  getFuncoes, getPessoas,
  renderCadSla, listarSlaApi, slaByFuncao,
  salvarSla, atualizarSla, deletarSla,
} = require('../controllers/vagasController');

router.get('/vagas', requireAuth, listarVagas);
router.post('/vagas', requireAuth, cadastrarVaga);

router.get('/cad-sla', requireAuth, renderCadSla);

router.get('/api/funcoes', requireAuth, getFuncoes);
router.get('/api/pessoas', requireAuth, getPessoas);
router.get('/api/sla/by-funcao', requireAuth, slaByFuncao);
router.get('/api/sla', requireAuth, listarSlaApi);
router.post('/api/sla', requireAuth, salvarSla);
router.put('/api/sla/:id', requireAuth, atualizarSla);
router.delete('/api/sla/:id', requireAuth, deletarSla);

module.exports = router;
