const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../controllers/loginController');
const {
  listarVagas, cadastrarVaga,
  getFuncoes, getPessoas, getEmpresas, getMatriculas,
  renderCadSla, listarSlaApi, slaByFuncao,
  salvarSla, atualizarSla, deletarSla,
  renderMercadoSul, salvarMercadoSul, atualizarMercadoSul, deletarMercadoSul,
  fecharVaga,
} = require('../controllers/vagasController');
const { salvarCandidatura, renderCandidaturasAdmin, listarCandidaturasPorVagaApi, listarCandidaturasPorFuncaoApi, abrirCurriculoCandidatura } = require('../controllers/candidaturasController');
const {
  renderUsuarios,
  atualizarAdmUsuario,
  criarUsuario,
  buscarUsuariosProtheus,
  incluirUsuarioProtheus,
} = require('../controllers/usuariosController');
const {
  renderEstoque, listarEstoque, cadastrarItem, editarItem, excluirItem,
  verificarDisponibilidade, criarPedidoCompra, listarPedidos, atualizarStatusPedido, listarItens,
} = require('../controllers/estoqueController');

router.get('/vagas', requireAuth, listarVagas);
router.post('/vagas', requireAuth, cadastrarVaga);
router.get('/cad-sla', requireAuth, requireAdmin, renderCadSla);
router.get('/mercado-sul', requireAuth, requireAdmin, renderMercadoSul);
router.get('/usuarios', requireAuth, requireAdmin, renderUsuarios);
router.get('/candidaturas', requireAuth, requireAdmin, renderCandidaturasAdmin);
router.get('/api/funcoes', requireAuth, getFuncoes);
router.get('/api/pessoas', requireAuth, getPessoas);
router.get('/api/empresas', requireAuth, getEmpresas);
router.get('/api/matriculas', requireAuth, getMatriculas);
router.get('/api/candidaturas/por-funcao', requireAuth, requireAdmin, listarCandidaturasPorFuncaoApi);
router.get('/api/vagas/:id/candidaturas', requireAuth, requireAdmin, listarCandidaturasPorVagaApi);
router.get('/api/candidaturas/:id/curriculo', requireAuth, requireAdmin, abrirCurriculoCandidatura);
router.get('/api/sla/by-funcao', requireAuth, slaByFuncao);
router.get('/api/sla', requireAuth, listarSlaApi);
router.post('/api/sla', requireAuth, requireAdmin, salvarSla);
router.put('/api/sla/:id', requireAuth, requireAdmin, atualizarSla);
router.delete('/api/sla/:id', requireAuth, requireAdmin, deletarSla);
router.post('/api/mercado-sul', requireAuth, requireAdmin, salvarMercadoSul);
router.put('/api/mercado-sul/:id', requireAuth, requireAdmin, atualizarMercadoSul);
router.delete('/api/mercado-sul/:id', requireAuth, requireAdmin, deletarMercadoSul);
router.put('/vagas/fechar/:id', requireAuth, requireAdmin, fecharVaga);
router.post('/api/usuarios', requireAuth, requireAdmin, criarUsuario);
router.put('/api/usuarios/:id/adm', requireAuth, requireAdmin, atualizarAdmUsuario);
router.get('/api/protheus/usuarios', requireAuth, requireAdmin, buscarUsuariosProtheus);
router.post('/api/usuarios/protheus', requireAuth, requireAdmin, incluirUsuarioProtheus);
router.post('/api/candidatura', salvarCandidatura);

// Estoque TI (apenas ADM)
router.get('/estoque', requireAuth, requireAdmin, renderEstoque);
router.get('/api/estoque', requireAuth, requireAdmin, listarEstoque);
router.post('/api/estoque', requireAuth, requireAdmin, cadastrarItem);
router.put('/api/estoque/:id', requireAuth, requireAdmin, editarItem);
router.delete('/api/estoque/:id', requireAuth, requireAdmin, excluirItem);
router.get('/api/estoque/:id/itens', requireAuth, requireAdmin, listarItens);
router.get('/api/estoque/verificar', requireAuth, requireAdmin, verificarDisponibilidade);
router.post('/api/estoque/pedido', requireAuth, requireAdmin, criarPedidoCompra);
router.get('/api/estoque/pedidos', requireAuth, requireAdmin, listarPedidos);
router.put('/api/estoque/pedidos/:id/status', requireAuth, requireAdmin, atualizarStatusPedido);

module.exports = router;
