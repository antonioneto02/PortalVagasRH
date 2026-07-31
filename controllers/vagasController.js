'use strict';

const sql = require('mssql');
const { QueryTypes, Op } = require('sequelize');
const sequelize = require('../database/sequelize');
const dbConfigDw = require('../database/dbConfigDw');
const Vaga = require('../models/Vaga');
const SlaConfig = require('../models/SlaConfig');
const MercadoSul = require('../models/MercadoSul');
const EstoqueItem = require('../models/EstoqueItem');
const Candidatura = require('../models/Candidatura');
const EstoqueTI = require('../models/EstoqueTI');
const PedidoCompraTI = require('../models/PedidoCompraTI');

function formatDateBR(dt) {
  if (!dt) return null;
  const d = new Date(dt);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function podeCadastrarFn(session) {
  return session.isAdmin === true;
}

async function listarVagas(req, res) {
  const isProtheus = req.session.isProtheus;
  const isAdmin = req.session.isAdmin === true;
  const podeCadastrar = podeCadastrarFn(req.session);

  try {
    const where = isAdmin ? {} : { TIPO_VAGA: 'EXTERNA', STATUS: { [Op.ne]: 'FECHADA' } };
    const rawRows = await Vaga.findAll({
      where,
      attributes: [
        'ID', 'FUNCAO', 'DATA_ABERTURA', 'TIPO_VAGA', 'SOLICITANTE', 'SETOR',
        'NOTEBOOK', 'CELULAR', 'REQUISITOS_VAGA', 'SLA_DIAS', 'CLASSIFICACAO',
        'CANDIDATOS', 'ENTREVISTAS', 'PRAZO_CONTRATACAO', 'DT_CONTRATACAO',
        'MATRICULA', 'STATUS', 'EMPRESA', 'USUARIO_CADASTRO', 'DTINCLUSAO',
        [sequelize.literal(`(CASE
           WHEN NOTEBOOK='SIM' AND NOT EXISTS (SELECT 1 FROM RH_ESTOQUE_TI WHERE TIPO_PRODUTO='NOTEBOOK' AND ISNULL(QUANTIDADE,0)>0) THEN 0
           WHEN CELULAR='SIM'  AND NOT EXISTS (SELECT 1 FROM RH_ESTOQUE_TI WHERE TIPO_PRODUTO='CELULAR'  AND ISNULL(QUANTIDADE,0)>0) THEN 0
           WHEN NOTEBOOK='SIM' OR CELULAR='SIM' THEN 1
           ELSE 0
         END)`), 'ITENS_RESERVADOS'],
        [sequelize.literal(`(SELECT COUNT(*) FROM RH_PEDIDOS_COMPRA_TI WHERE ID_VAGA = [Vaga].[ID] AND STATUS = 'PENDENTE')`), 'PEDIDOS_PENDENTES'],
      ],
      order: [['DTINCLUSAO', 'DESC']],
      raw: true,
    });
    const rows = rawRows.map(v => ({
      ...v,
      DATA_ABERTURA: formatDateBR(v.DATA_ABERTURA),
      PRAZO_CONTRATACAO: formatDateBR(v.PRAZO_CONTRATACAO),
      DT_CONTRATACAO: formatDateBR(v.DT_CONTRATACAO),
      DTINCLUSAO: formatDateBR(v.DTINCLUSAO),
    }));

    let vagasFinal = rows;
    if (!isAdmin) {
      const groupMap = new Map();
      for (const row of rows) {
        const key = String(row.FUNCAO || '').trim().toUpperCase();
        if (!groupMap.has(key)) {
          groupMap.set(key, { ...row, TOTAL_VAGAS: 1, ALL_IDS: [row.ID] });
        } else {
          const g = groupMap.get(key);
          g.TOTAL_VAGAS++;
          g.ALL_IDS.push(row.ID);
          g.CANDIDATOS = (g.CANDIDATOS || 0) + (row.CANDIDATOS || 0);
          if (row.NOTEBOOK === 'SIM') g.NOTEBOOK = 'SIM';
          if (row.CELULAR === 'SIM') g.CELULAR = 'SIM';
        }
      }
      vagasFinal = [...groupMap.values()];
    }

    res.render('Vagas/listagem', {
      vagas: vagasFinal,
      isProtheus,
      isAdmin,
      podeCadastrar,
      username: req.session.username,
      protheusId: req.session.protheusId || null,
      candidaturasFeitas: req.session.candidaturasFeitas || [],
      currentPath: '/vagas',
    });
  } catch (err) {
    console.error('Erro ao listar vagas:', err);
    res.status(500).send('Erro ao carregar vagas.');
  }
}

async function cadastrarVaga(req, res) {
  const protheusId = req.session.protheusId || req.session.username || 'ADMIN';
  if (!podeCadastrarFn(req.session)) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  const {
    funcao, data_abertura, tipo_vaga, solicitante, setor,
    notebook, celular, requisitos_vaga, sla_dias, classificacao,
    candidatos, entrevistas, prazo_contratacao, dt_contratacao,
    matricula, status, empresa,
  } = req.body;

  if (!funcao || !data_abertura || !tipo_vaga) {
    return res.status(400).json({ error: 'Campos obrigatórios: Função, Data Abertura, Tipo Vaga.' });
  }

  const notebookFinal = notebook === 'SIM' ? 'SIM' : 'NAO';
  const celularFinal  = celular === 'SIM' ? 'SIM' : 'NAO';
  let sla_dias_final = sla_dias ? parseInt(sla_dias) : null;
  let classificacao_final = classificacao || null;

  try {
    if (!sla_dias_final || !classificacao_final) {
      try {
        const slaRow = await SlaConfig.findOne({
          where: sequelize.where(
            sequelize.fn('UPPER', sequelize.fn('RTRIM', sequelize.col('FUNCAO'))),
            sequelize.fn('UPPER', sequelize.fn('RTRIM', funcao))
          ),
        });
        if (slaRow) {
          sla_dias_final = sla_dias_final || slaRow.SLA_DIAS;
          classificacao_final = classificacao_final || slaRow.CLASSIFICACAO;
        }
      } catch {}
    }

    const novaVaga = await Vaga.create({
      FUNCAO: funcao,
      DATA_ABERTURA: new Date(data_abertura),
      TIPO_VAGA: tipo_vaga,
      SOLICITANTE: solicitante || null,
      SETOR: setor || null,
      NOTEBOOK: notebookFinal,
      CELULAR: celularFinal,
      REQUISITOS_VAGA: requisitos_vaga || null,
      SLA_DIAS: sla_dias_final,
      CLASSIFICACAO: classificacao_final,
      CANDIDATOS: candidatos ? parseInt(candidatos) : 0,
      ENTREVISTAS: entrevistas ? parseInt(entrevistas) : 0,
      PRAZO_CONTRATACAO: prazo_contratacao ? new Date(prazo_contratacao) : null,
      DT_CONTRATACAO: dt_contratacao ? new Date(dt_contratacao) : null,
      MATRICULA: matricula || null,
      STATUS: status || 'ABERTA',
      EMPRESA: empresa || null,
      USUARIO_CADASTRO: protheusId,
    });

    return res.json({ success: true, id: novaVaga.ID });
  } catch (err) {
    console.error('Erro ao cadastrar vaga:', err);
    return res.status(500).json({ error: 'Erro interno ao cadastrar vaga.' });
  }
}

async function getFuncoes(req, res) {
  const q = req.query.q || '';
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfigDw).connect();
    const result = await pool.request()
      .input('Q', sql.VarChar(200), '%' + q.toUpperCase() + '%')
      .query(`SELECT DISTINCT RTRIM(LTRIM(FUNCAO)) AS FUNCAO
              FROM V_RECURSOS_HUMANOS
              WHERE FUNCAO IS NOT NULL AND FUNCAO <> '' AND UPPER(FUNCAO) LIKE @Q
              ORDER BY FUNCAO`);
    res.json(result.recordset.map(r => r.FUNCAO));
  } catch (err) {
    console.error('Erro ao buscar funcoes:', err);
    res.json([]);
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function getPessoas(req, res) {
  const q = req.query.q || '';
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfigDw).connect();
    const result = await pool.request()
      .input('Q', sql.VarChar(200), '%' + q.toUpperCase() + '%')
      .query(`SELECT DISTINCT RTRIM(LTRIM(Nome)) AS Nome
              FROM V_PESSOAS
              WHERE Nome IS NOT NULL AND Nome <> '' AND UPPER(Nome) LIKE @Q
              ORDER BY Nome`);
    try {
      console.log('[getPessoas] q="' + q + '", results=' + (result.recordset ? result.recordset.length : 0));
    } catch (e) {}
    res.json(result.recordset.map(r => ({ id: r.Nome, text: r.Nome })));
  } catch (err) {
    console.error('Erro ao buscar pessoas:', err);
    res.json([]);
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function getEmpresas(_req, res) {
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfigDw).connect();
    const result = await pool.request()
      .query(`SELECT DISTINCT RTRIM(LTRIM(EMPRESA)) AS EMPRESA FROM DIM_FILIAIS WHERE EMPRESA IS NOT NULL AND EMPRESA <> '' ORDER BY EMPRESA`);
    res.json(result.recordset.map(r => ({ id: r.EMPRESA, text: r.EMPRESA })));
  } catch (err) {
    console.error('Erro ao buscar empresas:', err);
    res.json([]);
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function getMatriculas(req, res) {
  const q = req.query.q || '';
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfigDw).connect();
    const result = await pool.request()
      .input('Q', sql.VarChar(200), '%' + q.toUpperCase() + '%')
      .query(`SELECT DISTINCT RTRIM(LTRIM(MATRICULA)) AS MATRICULA, RTRIM(LTRIM(NOME)) AS NOME
              FROM V_RECURSOS_HUMANOS
              WHERE MATRICULA IS NOT NULL AND MATRICULA <> ''
              AND (UPPER(MATRICULA) LIKE @Q OR UPPER(NOME) LIKE @Q)
              ORDER BY MATRICULA`);
    try {
      console.log('[getMatriculas] q="' + q + '", results=' + (result.recordset ? result.recordset.length : 0));
    } catch (e) {}
    res.json(result.recordset.map(r => ({ id: r.MATRICULA, text: r.MATRICULA + ' - ' + r.NOME })));
  } catch (err) {
    console.error('Erro ao buscar matriculas:', err);
    res.json([]);
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function fecharVaga(req, res) {
  if (!podeCadastrarFn(req.session)) return res.status(403).json({ error: 'Acesso negado.' });
  const id = parseInt(req.params.id, 10);
  const { matricula, entrevistas, dt_contratacao } = req.body;
  if (!id) return res.status(400).json({ error: 'ID da vaga e obrigatorio.' });

  try {
    const vagaInfo = await Vaga.findOne({
      where: { ID: id },
      attributes: ['SETOR', 'FUNCAO', 'NOTEBOOK', 'CELULAR'],
    });

    const { SETOR: setor, FUNCAO: funcao, NOTEBOOK: notebook, CELULAR: celular } = vagaInfo || {};

    if (!matricula) return res.status(400).json({ error: 'Matricula e obrigatoria para fechar a vaga.' });
    if (entrevistas === undefined || entrevistas === null || entrevistas === '') {
      return res.status(400).json({ error: 'Numero de entrevistas e obrigatorio para fechar a vaga.' });
    }

    await Vaga.update(
      {
        MATRICULA: matricula,
        ENTREVISTAS: parseInt(entrevistas),
        DT_CONTRATACAO: dt_contratacao ? new Date(dt_contratacao) : null,
        STATUS: 'FECHADA',
      },
      { where: { ID: id } }
    );

    try {
      const areaLabel = [setor, funcao].filter(Boolean).join(' - ') || null;
      const matriculaUsada = matricula || null;
      const usuarioFechamento = req.session.username || req.session.protheusId || 'ADMIN';

      for (const tipo of ['NOTEBOOK', 'CELULAR']) {
        const precisaTipo = tipo === 'NOTEBOOK' ? notebook === 'SIM' : celular === 'SIM';
        if (!precisaTipo) continue;

        const updResult = await sequelize.query(
          `UPDATE TOP (1) RH_ESTOQUE_TI
           SET QUANTIDADE = QUANTIDADE - 1, DTALTERACAO = GETDATE()
           OUTPUT INSERTED.ID
           WHERE TIPO_PRODUTO = :tipo AND ISNULL(QUANTIDADE, 0) > 0`,
          { replacements: { tipo }, type: QueryTypes.SELECT }
        );

        const estoqueId = updResult[0]?.ID;
        if (estoqueId) {
          await EstoqueItem.create({
            ID_ESTOQUE: estoqueId,
            ID_VAGA: id,
            MATRICULA: matriculaUsada,
            AREA: areaLabel,
            USUARIO: usuarioFechamento,
            STATUS: 'EM_USO',
          });
        }
      }
    } catch (estoqueErr) {
      console.error('Aviso: nao foi possivel decrementar/registrar item de estoque:', estoqueErr.message);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao fechar vaga:', err);
    res.status(500).json({ error: 'Erro ao fechar vaga.' });
  }
}

async function renderCadSla(req, res) {
  try {
    const slaConfig = await SlaConfig.findAll({ order: [['FUNCAO', 'ASC']] });
    res.render('Vagas/cad_sla', {
      slaConfig: slaConfig.map(r => r.toJSON()),
      username: req.session.username,
      isProtheus: req.session.isProtheus,
      isAdmin: req.session.isAdmin === true,
      protheusId: req.session.protheusId || null,
      podeCadastrar: podeCadastrarFn(req.session),
      currentPath: '/cad-sla',
    });
  } catch (err) {
    console.error('Erro ao carregar CAD SLA:', err);
    res.status(500).send('Erro ao carregar CAD SLA.');
  }
}

async function listarSlaApi(_req, res) {
  try {
    const rows = await SlaConfig.findAll({ order: [['FUNCAO', 'ASC']] });
    res.json(rows.map(r => r.toJSON()));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar SLA.' });
  }
}

async function slaByFuncao(req, res) {
  const funcao = req.query.funcao || '';
  if (!funcao) return res.json({});
  try {
    try { console.log('[slaByFuncao] funcao="' + funcao + '"'); } catch (e) {}

    const exactRow = await SlaConfig.findOne({
      where: sequelize.where(
        sequelize.fn('UPPER', sequelize.col('FUNCAO')),
        { [Op.like]: '%' + funcao.toUpperCase() + '%' }
      ),
    });

    if (exactRow) {
      try { console.log('[slaByFuncao] matched="' + exactRow.FUNCAO + '"'); } catch (e) {}
      return res.json({ sla_dias: exactRow.SLA_DIAS, classificacao: exactRow.CLASSIFICACAO });
    }

    const all = await SlaConfig.findAll();
    const removeDiacritics = s => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const clean = s => removeDiacritics(String(s || '')).toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const abbrev = { PL: 'PLENO', JR: 'JUNIOR', SR: 'SENIOR' };
    const stopWords = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'O', 'A', 'POR', 'PARA', 'EM']);
    const normalizeTokens = s => clean(s).split(' ').map(w => (abbrev[w] || w)).filter(w => w && !stopWords.has(w));
    const targetTokens = normalizeTokens(funcao);

    let best = { score: 0, row: null };
    for (const row of all) {
      const candTokens = normalizeTokens(row.FUNCAO);
      if (!candTokens.length) continue;
      const candSet = new Set(candTokens);
      let inter = 0;
      for (const t of targetTokens) if (candSet.has(t)) inter++;
      let interReverse = 0;
      const targetSet = new Set(targetTokens);
      for (const c of candTokens) if (targetSet.has(c)) interReverse++;
      const score = Math.max(inter, interReverse);
      if (score > best.score) best = { score, row };
    }
    if (best.row && best.score > 0 && best.score >= Math.max(1, Math.floor(targetTokens.length / 2))) {
      try { console.log('[slaByFuncao] matched FUNCAO="' + best.row.FUNCAO + '" score=' + best.score); } catch (e) {}
      return res.json({ sla_dias: best.row.SLA_DIAS, classificacao: best.row.CLASSIFICACAO });
    }

    res.json({});
  } catch (err) {
    res.json({});
  }
}

async function salvarSla(req, res) {
  if (!podeCadastrarFn(req.session)) return res.status(403).json({ error: 'Acesso negado.' });
  const { funcao, sla_dias, classificacao } = req.body;
  if (!funcao || !sla_dias || !classificacao) return res.status(400).json({ error: 'Campos obrigatorios.' });
  try {
    await SlaConfig.create({ FUNCAO: funcao, SLA_DIAS: parseInt(sla_dias), CLASSIFICACAO: classificacao });
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao salvar SLA:', err);
    res.status(500).json({ error: 'Erro interno.' });
  }
}

async function atualizarSla(req, res) {
  if (!podeCadastrarFn(req.session)) return res.status(403).json({ error: 'Acesso negado.' });
  const { id } = req.params;
  const { funcao, sla_dias, classificacao } = req.body;
  if (!funcao || !sla_dias || !classificacao) return res.status(400).json({ error: 'Campos obrigatorios.' });
  try {
    await SlaConfig.update(
      { FUNCAO: funcao, SLA_DIAS: parseInt(sla_dias), CLASSIFICACAO: classificacao },
      { where: { ID: parseInt(id) } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao atualizar SLA:', err);
    res.status(500).json({ error: 'Erro interno.' });
  }
}

async function deletarSla(req, res) {
  if (!podeCadastrarFn(req.session)) return res.status(403).json({ error: 'Acesso negado.' });
  const { id } = req.params;
  try {
    await SlaConfig.destroy({ where: { ID: parseInt(id) } });
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao deletar SLA:', err);
    res.status(500).json({ error: 'Erro interno.' });
  }
}

async function renderMercadoSul(req, res) {
  try {
    const mercado = await MercadoSul.findAll({ order: [['FUNCAO_ORIGINAL', 'ASC']] });
    res.render('Vagas/mercado_sul', {
      mercado: mercado.map(r => r.toJSON()),
      username: req.session.username,
      isProtheus: req.session.isProtheus,
      isAdmin: req.session.isAdmin === true,
      protheusId: req.session.protheusId || null,
      podeCadastrar: podeCadastrarFn(req.session),
      currentPath: '/mercado-sul',
    });
  } catch (err) {
    console.error('Erro ao carregar Mercado Sul:', err);
    res.status(500).send('Erro ao carregar Mercado Sul.');
  }
}

async function salvarMercadoSul(req, res) {
  if (!podeCadastrarFn(req.session)) return res.status(403).json({ error: 'Acesso negado.' });
  const { funcao, cargo, nivel, media_pr, media_sul, faixa_min, faixa_max } = req.body;
  if (!funcao) return res.status(400).json({ error: 'Funcao e obrigatoria.' });
  try {
    await MercadoSul.create({
      FUNCAO_ORIGINAL: funcao,
      CARGO_MERCADO: cargo || null,
      NIVEL_HIERARQUICO: nivel || null,
      MEDIA_SALARIAL_PR: media_pr ? parseFloat(media_pr) : null,
      MEDIA_SALARIAL_SUL: media_sul ? parseFloat(media_sul) : null,
      FAIXA_MIN: faixa_min ? parseFloat(faixa_min) : null,
      FAIXA_MAX: faixa_max ? parseFloat(faixa_max) : null,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao salvar Mercado Sul:', err);
    res.status(500).json({ error: 'Erro interno.' });
  }
}

async function atualizarMercadoSul(req, res) {
  if (!podeCadastrarFn(req.session)) return res.status(403).json({ error: 'Acesso negado.' });
  const { id } = req.params;
  const { funcao, cargo, nivel, media_pr, media_sul, faixa_min, faixa_max } = req.body;
  if (!funcao) return res.status(400).json({ error: 'Funcao e obrigatoria.' });
  try {
    await MercadoSul.update(
      {
        FUNCAO_ORIGINAL: funcao,
        CARGO_MERCADO: cargo || null,
        NIVEL_HIERARQUICO: nivel || null,
        MEDIA_SALARIAL_PR: media_pr ? parseFloat(media_pr) : null,
        MEDIA_SALARIAL_SUL: media_sul ? parseFloat(media_sul) : null,
        FAIXA_MIN: faixa_min ? parseFloat(faixa_min) : null,
        FAIXA_MAX: faixa_max ? parseFloat(faixa_max) : null,
      },
      { where: { ID: parseInt(id) } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao atualizar Mercado Sul:', err);
    res.status(500).json({ error: 'Erro interno.' });
  }
}

async function deletarMercadoSul(req, res) {
  if (!podeCadastrarFn(req.session)) return res.status(403).json({ error: 'Acesso negado.' });
  const { id } = req.params;
  try {
    await MercadoSul.destroy({ where: { ID: parseInt(id) } });
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao deletar Mercado Sul:', err);
    res.status(500).json({ error: 'Erro interno.' });
  }
}

async function limparDados(req, res) {
  if (!podeCadastrarFn(req.session)) return res.status(403).json({ error: 'Acesso negado.' });
  try {
    await EstoqueItem.destroy({ where: {} });
    await Candidatura.destroy({ where: {} });
    await PedidoCompraTI.destroy({ where: {} });
    await EstoqueTI.destroy({ where: {} });
    await Vaga.destroy({ where: {} });
    await SlaConfig.destroy({ where: {} });
    await MercadoSul.destroy({ where: {} });
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao limpar dados:', err);
    res.status(500).json({ error: 'Erro ao limpar dados: ' + err.message });
  }
}

module.exports = {
  listarVagas, cadastrarVaga,
  getFuncoes, getPessoas,
  renderCadSla, listarSlaApi, slaByFuncao,
  salvarSla, atualizarSla, deletarSla,
  renderMercadoSul, salvarMercadoSul, atualizarMercadoSul, deletarMercadoSul,
  getEmpresas, getMatriculas, fecharVaga, limparDados,
};
