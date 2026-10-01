'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { DIALETO, ativo, prepararBanco, emTransacaoDesfeita, restaurarIdentidades, semPermissaoDeGravar, respostaFalsa } = require('./ambiente');

describe(`Vagas RH no banco real (${DIALETO || 'desligado'})`, { skip: !ativo && 'defina TESTE_DIALETO=mssql ou TESTE_DIALETO=postgres + TESTE_PG_*' }, () => {
  let sequelize, m, vagas, estoque, semPermissao;
  const admin = { isAdmin: true, username: 'TESTE ORM', protheusId: '999999' };

  before(async () => {
    sequelize = require('../../database/sequelize');
    m = require('../../models');
    vagas = require('../../controllers/vagasController');
    estoque = require('../../controllers/estoqueController');
    assert.equal(sequelize.getDialect(), DIALETO);
    await prepararBanco(sequelize);
    semPermissao = await semPermissaoDeGravar(sequelize);
  });

  const gravando = fn => t => (semPermissao ? t.skip(semPermissao) : emTransacaoDesfeita(sequelize, fn));

  after(async () => {
    if (!semPermissao) await restaurarIdentidades(sequelize);
    await sequelize.close();
  });

  const novaVaga = (extra = {}) => m.Vaga.create({
    FUNCAO: 'ZZ TESTE ORM', DATA_ABERTURA: '2026-09-01', TIPO_VAGA: 'EXTERNA', NOTEBOOK: 'NAO', CELULAR: 'NAO',
    CANDIDATOS: 0, ENTREVISTAS: 0, STATUS: 'ABERTA', DTINCLUSAO: new Date(), DTALTERACAO: new Date(), ...extra,
  });
  const zerarEstoque = () => m.EstoqueTI.update({ QUANTIDADE: 0 }, { where: {} });

  test('listagem calcula itens reservados e pedidos pendentes', gravando(async () => {
    await zerarEstoque();
    const comNotebook = await novaVaga({ NOTEBOOK: 'SIM' });
    const semItens = await novaVaga();
    await m.PedidoCompraTI.create({ ID_VAGA: comNotebook.ID, ITENS_JSON: '[]', STATUS: 'PENDENTE', DTPEDIDO: new Date() });
    await m.PedidoCompraTI.create({ ID_VAGA: comNotebook.ID, ITENS_JSON: '[]', STATUS: 'PENDENTE', DTPEDIDO: new Date() });
    await m.PedidoCompraTI.create({ ID_VAGA: comNotebook.ID, ITENS_JSON: '[]', STATUS: 'ATENDIDO', DTPEDIDO: new Date() });

    let res = respostaFalsa();
    await vagas.listarVagas({ session: admin }, res);
    let lista = res.corpo.vagas;
    let a = lista.find(v => v.ID === comNotebook.ID);
    assert.equal(a.ITENS_RESERVADOS, 0);
    assert.equal(a.PEDIDOS_PENDENTES, 2);
    assert.equal(lista.find(v => v.ID === semItens.ID).ITENS_RESERVADOS, 0);
    assert.equal(lista.find(v => v.ID === semItens.ID).PEDIDOS_PENDENTES, 0);

    await m.EstoqueTI.create({ TIPO_PRODUTO: 'NOTEBOOK', DESCRICAO: 'ZZ', QUANTIDADE: 2, DTINCLUSAO: new Date() });
    res = respostaFalsa();
    await vagas.listarVagas({ session: admin }, res);
    a = res.corpo.vagas.find(v => v.ID === comNotebook.ID);
    assert.equal(a.ITENS_RESERVADOS, 1);
    assert.match(a.DATA_ABERTURA, /^01\/09\/2026$/);
  }));

  test('fechar vaga baixa um item do estoque e registra a alocação', gravando(async () => {
    await zerarEstoque();
    const item = await m.EstoqueTI.create({ TIPO_PRODUTO: 'CELULAR', DESCRICAO: 'ZZ', QUANTIDADE: 1, DTINCLUSAO: new Date() });
    const vaga = await novaVaga({ CELULAR: 'SIM', NOTEBOOK: 'SIM' });
    const res = respostaFalsa();
    await vagas.fecharVaga({ session: admin, params: { id: String(vaga.ID) }, body: { matricula: '000123', entrevistas: 3, dt_contratacao: '2026-09-20' } }, res);
    assert.deepEqual(res.corpo, { success: true });
    const depois = await m.EstoqueTI.findByPk(item.ID, { raw: true });
    assert.equal(depois.QUANTIDADE, 0);
    assert.ok(depois.DTALTERACAO);
    const alocacoes = await m.EstoqueItem.findAll({ where: { ID_VAGA: vaga.ID }, raw: true });
    assert.deepEqual(alocacoes.map(x => [x.ID_ESTOQUE, x.STATUS, x.MATRICULA]), [[item.ID, 'EM_USO', '000123']]);
    const fechada = await m.Vaga.findByPk(vaga.ID, { raw: true });
    assert.equal(fechada.STATUS, 'FECHADA');
    assert.equal(fechada.DT_CONTRATACAO, '2026-09-20');
  }));

  test('estoque lista total de alocações e disponibilidade soma por tipo', gravando(async () => {
    await zerarEstoque();
    const nb = await m.EstoqueTI.create({ TIPO_PRODUTO: 'NOTEBOOK', DESCRICAO: 'ZZ NB', QUANTIDADE: 3, DTINCLUSAO: new Date() });
    await m.EstoqueTI.create({ TIPO_PRODUTO: 'NOTEBOOK', DESCRICAO: 'ZZ NB2', QUANTIDADE: 2, DTINCLUSAO: new Date() });
    const vaga = await novaVaga();
    await m.EstoqueItem.create({ ID_ESTOQUE: nb.ID, ID_VAGA: vaga.ID, STATUS: 'EM_USO' });
    await m.EstoqueItem.create({ ID_ESTOQUE: nb.ID, ID_VAGA: vaga.ID, STATUS: 'EM_USO' });

    const lista = respostaFalsa();
    await estoque.listarEstoque({}, lista);
    const linha = lista.corpo.find(x => x.ID === nb.ID);
    assert.equal(linha.TOTAL_ALOCACOES, 2);
    assert.equal(linha.QUANTIDADE, 3);

    const disp = respostaFalsa();
    await estoque.verificarDisponibilidade({ query: { notebook: '4', celular: '1' } }, disp);
    assert.equal(disp.corpo.dispNb, 5);
    assert.equal(disp.corpo.dispCel, 0);
    assert.equal(disp.corpo.disponivel, false);
  }));

  test('datas sem hora aparecem na listagem iguais ao banco', async () => {
    if (DIALETO === 'postgres') await m.Vaga.create({ FUNCAO: 'ZZ DATA', DATA_ABERTURA: '2026-05-13', TIPO_VAGA: 'EXTERNA', NOTEBOOK: 'NAO', CELULAR: 'NAO', CANDIDATOS: 0, ENTREVISTAS: 0, STATUS: 'ABERTA', DTINCLUSAO: new Date(), DTALTERACAO: new Date() });
    const banco = await sequelize.query(DIALETO === 'mssql' ? 'SELECT ID, CONVERT(varchar(10), DATA_ABERTURA, 120) AS D FROM RH_VAGAS' : `SELECT "ID", to_char("DATA_ABERTURA", 'YYYY-MM-DD') AS "D" FROM "RH_VAGAS"`, { type: 'SELECT' });
    assert.ok(banco.length > 0);
    const res = respostaFalsa();
    await vagas.listarVagas({ session: admin }, res);
    for (const b of banco) {
      const v = res.corpo.vagas.find(x => x.ID === b.ID);
      assert.equal(v.DATA_ABERTURA, b.D.split('-').reverse().join('/'), 'vaga ' + b.ID);
    }
  });

  test('no SQL Server as datas continuam gravadas em UTC, como antes', { skip: DIALETO !== 'mssql' && 'só no SQL Server' }, gravando(async () => {
    const vaga = await novaVaga();
    const c = await m.Candidatura.create({ ID_VAGA: vaga.ID, NOME: 'ZZ', CELULAR: '0', EMAIL: 'zz@zz' });
    const [linha] = await sequelize.query('SELECT CONVERT(varchar(19), DTINCLUSAO, 120) AS TXT FROM RH_CANDIDATURAS WHERE ID = :id', { replacements: { id: c.ID }, type: 'SELECT' });
    const lido = await m.Candidatura.findByPk(c.ID, { raw: true });
    assert.equal(linha.TXT, new Date(lido.DTINCLUSAO).toISOString().slice(0, 19).replace('T', ' '));
    assert.ok(Math.abs(new Date(lido.DTINCLUSAO) - Date.now()) < 5 * 60 * 1000);
  }));
});
