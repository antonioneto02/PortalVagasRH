const express = require('express');
const router = express.Router();
const { requireAuth } = require('../controllers/loginController');
const {
  listarVagas, cadastrarVaga,
  getFuncoes, getPessoas, getEmpresas,
  renderCadSla, listarSlaApi, slaByFuncao,
  salvarSla, atualizarSla, deletarSla,
  renderMercadoSul, salvarMercadoSul, atualizarMercadoSul, deletarMercadoSul,
  fecharVaga,
} = require('../controllers/vagasController');

router.get('/vagas', requireAuth, listarVagas);
router.post('/vagas', requireAuth, cadastrarVaga);
router.get('/cad-sla', requireAuth, renderCadSla);
router.get('/mercado-sul', requireAuth, renderMercadoSul);
router.get('/api/funcoes', requireAuth, getFuncoes);
router.get('/api/pessoas', requireAuth, getPessoas);
router.get('/api/empresas', requireAuth, getEmpresas);
router.get('/api/sla/by-funcao', requireAuth, slaByFuncao);
router.get('/api/sla', requireAuth, listarSlaApi);
router.post('/api/sla', requireAuth, salvarSla);
router.put('/api/sla/:id', requireAuth, atualizarSla);
router.delete('/api/sla/:id', requireAuth, deletarSla);
router.post('/api/mercado-sul', requireAuth, salvarMercadoSul);
router.put('/api/mercado-sul/:id', requireAuth, atualizarMercadoSul);
router.delete('/api/mercado-sul/:id', requireAuth, deletarMercadoSul);
router.put('/vagas/fechar/:id', requireAuth, fecharVaga);
module.exports = router;
