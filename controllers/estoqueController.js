'use strict';

const sql = require('mssql');
const { Op } = require('sequelize');
const sequelize = require('../database/sequelize');
const Vaga = require('../models/Vaga');

function formatDate(dt) {
  if (!dt) return null;
  const d = new Date(dt);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function formatDateTime(dt) {
  if (!dt) return null;
  const d = new Date(dt);
  return `${formatDate(dt)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
const dbConfigDw = require('../database/dbConfigDw');
const EstoqueTI = require('../models/EstoqueTI');
const EstoqueItem = require('../models/EstoqueItem');
const PedidoCompraTI = require('../models/PedidoCompraTI');
const notificacaoModel = require('../models/notificacaoModel');

const DESTINATARIOS_PEDIDO = [
  'antonioneto3260@gmail.com',
  'antonioneto3260@gmail.com',
  'antonioneto3260@gmail.com',
  'antonioneto3260@gmail.com',
  'antonioneto3260@gmail.com',
];

function buildEmailPedido({ id_vaga, itens, funcao, setor, prazo, solicitante }) {
  const itensHtml = (itens || []).map(i =>
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">${i.tipo}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;"><strong>${i.qtd}</strong></td></tr>`
  ).join('');

  return `<!DOCTYPE html><html lang="pt-br"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;">
<div style="max-width:600px;margin:30px auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
  <div style="background:linear-gradient(135deg,#2B286F,#D11F3F);padding:24px 30px;color:white;">
    <h2 style="margin:0;font-size:1.3rem;">Pedido de Compra - Equipamentos TI</h2>
    <p style="margin:4px 0 0;opacity:.85;font-size:.9rem;">Portal Vagas RH - Cini</p>
  </div>
  <div style="padding:24px 30px;">
    <p style="margin:0 0 16px;color:#374151;">Foi solicitado um pedido de compra de equipamentos de TI para a seguinte vaga:</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;background:#f9fafb;border-radius:6px;">
      <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#6b7280;font-size:.85rem;">Vaga</td><td style="padding:8px 12px;border-bottom:1px solid #eee;"><strong>#${id_vaga} - ${funcao || '-'}</strong></td></tr>
      <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#6b7280;font-size:.85rem;">Area / Setor</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${setor || '-'}</td></tr>
      <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#6b7280;font-size:.85rem;">Solicitante</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${solicitante || '-'}</td></tr>
      <tr><td style="padding:8px 12px;color:#6b7280;font-size:.85rem;">Data Necessaria</td><td style="padding:8px 12px;">${prazo || '-'}</td></tr>
    </table>
    <p style="margin:0 0 10px;font-weight:600;color:#1f2937;">Itens Solicitados:</p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
      <thead><tr style="background:#2B286F;color:white;font-size:.85rem;">
        <th style="padding:8px 12px;text-align:left;">Equipamento</th>
        <th style="padding:8px 12px;text-align:center;">Quantidade</th>
      </tr></thead>
      <tbody>${itensHtml}</tbody>
    </table>
    <p style="margin:20px 0 0;font-size:.82rem;color:#9ca3af;">Este e um email automatico gerado pelo Portal Vagas RH - Cini.</p>
  </div>
</div>
</body></html>`;
}

async function renderEstoque(req, res) {
  try {
    const [itensRaw, pedidosOrm] = await Promise.all([
      EstoqueTI.findAll({
        attributes: [
          'ID', 'TIPO_PRODUTO', 'DESCRICAO', 'MODELO',
          [sequelize.fn('ISNULL', sequelize.col('QUANTIDADE'), 1), 'QUANTIDADE'],
          'DTINCLUSAO',
          [sequelize.literal('(SELECT COUNT(*) FROM RH_ESTOQUE_ITENS WHERE ID_ESTOQUE = [EstoqueTI].[ID])'), 'TOTAL_ALOCACOES'],
        ],
        order: [['TIPO_PRODUTO', 'ASC'], ['DTINCLUSAO', 'DESC']],
      }),
      PedidoCompraTI.findAll({
        include: [{ model: Vaga, as: 'vaga', attributes: ['FUNCAO', 'SETOR', 'PRAZO_CONTRATACAO'], required: false }],
        order: [['DTPEDIDO', 'DESC']],
      }),
    ]);

    const itens = itensRaw.map(e => { const o = e.toJSON(); return { ...o, DTINCLUSAO: formatDate(o.DTINCLUSAO) }; });
    const pedidosRaw = pedidosOrm.map(p => {
      const { vaga, DTPEDIDO, ...rest } = p.toJSON();
      return { ...rest, DTPEDIDO: formatDate(DTPEDIDO), VAGA_FUNCAO: vaga?.FUNCAO || null, VAGA_SETOR: vaga?.SETOR || null, VAGA_PRAZO: formatDate(vaga?.PRAZO_CONTRATACAO) };
    });

    let pedidos = pedidosRaw;
    try {
      const matriculas = [...new Set(pedidos.map(p => p.USUARIO_PEDIDO).filter(Boolean))];
      if (matriculas.length) {
        const poolDw = await new sql.ConnectionPool(dbConfigDw).connect();
        try {
          const mList = matriculas.map(m => `'${m.replace(/'/g, "''")}'`).join(',');
          const nomeResult = await poolDw.request().query(
            `SELECT RTRIM(LTRIM(MATRICULA)) AS MATRICULA, RTRIM(LTRIM(NOME)) AS NOME
             FROM V_RECURSOS_HUMANOS
             WHERE MATRICULA IN (${mList})`
          );
          const nomeMap = {};
          (nomeResult.recordset || []).forEach(r => { nomeMap[r.MATRICULA] = r.NOME; });
          pedidos = pedidos.map(p => ({
            ...p,
            NOME_SOLICITANTE: p.USUARIO_PEDIDO && nomeMap[p.USUARIO_PEDIDO]
              ? nomeMap[p.USUARIO_PEDIDO]
              : null,
          }));
        } finally {
          try { await poolDw.close(); } catch {}
        }
      }
    } catch (dwErr) {
      console.warn('Aviso: nao foi possivel buscar nomes do DW:', dwErr.message);
    }

    res.render('Vagas/estoque', {
      itens,
      pedidos,
      username: req.session.username,
      isAdmin: req.session.isAdmin === true,
      isProtheus: req.session.isProtheus,
      protheusId: req.session.protheusId || null,
      podeCadastrar: req.session.isAdmin === true,
      currentPath: '/estoque',
    });
  } catch (err) {
    console.error('Erro ao carregar estoque:', err);
    res.status(500).send('Erro ao carregar estoque.');
  }
}

async function listarEstoque(_req, res) {
  try {
    const rows = await EstoqueTI.findAll({
      attributes: [
        'ID', 'TIPO_PRODUTO', 'DESCRICAO', 'MODELO',
        [sequelize.fn('ISNULL', sequelize.col('QUANTIDADE'), 1), 'QUANTIDADE'],
        'DTINCLUSAO',
        [sequelize.literal('(SELECT COUNT(*) FROM RH_ESTOQUE_ITENS WHERE ID_ESTOQUE = [EstoqueTI].[ID])'), 'TOTAL_ALOCACOES'],
      ],
      order: [['TIPO_PRODUTO', 'ASC'], ['DTINCLUSAO', 'DESC']],
    });
    res.json(rows.map(e => { const o = e.toJSON(); return { ...o, DTINCLUSAO: formatDate(o.DTINCLUSAO) }; }));
  } catch (err) {
    console.error('Erro ao listar estoque:', err);
    res.status(500).json({ error: 'Erro ao listar estoque.' });
  }
}

async function cadastrarItem(req, res) {
  const { tipo_produto, descricao, modelo, quantidade } = req.body;
  if (!tipo_produto) return res.status(400).json({ error: 'Tipo de produto e obrigatorio.' });
  const qtd = Math.max(1, parseInt(quantidade) || 1);
  try {
    await EstoqueTI.create({
      TIPO_PRODUTO: tipo_produto,
      DESCRICAO: descricao || null,
      MODELO: modelo || null,
      QUANTIDADE: qtd,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao cadastrar item:', err);
    res.status(500).json({ error: 'Erro interno ao cadastrar item.' });
  }
}

async function editarItem(req, res) {
  const { id } = req.params;
  const { tipo_produto, descricao, modelo, quantidade } = req.body;
  if (!tipo_produto) return res.status(400).json({ error: 'Tipo de produto e obrigatorio.' });
  const qtd = Math.max(0, parseInt(quantidade) || 1);
  try {
    await EstoqueTI.update(
      { TIPO_PRODUTO: tipo_produto, DESCRICAO: descricao || null, MODELO: modelo || null, QUANTIDADE: qtd },
      { where: { ID: parseInt(id) } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao editar item:', err);
    res.status(500).json({ error: 'Erro interno ao editar item.' });
  }
}

async function excluirItem(req, res) {
  const { id } = req.params;
  try {
    const item = await EstoqueTI.findOne({ where: { ID: parseInt(id) } });
    if (!item) return res.status(404).json({ error: 'Item nao encontrado.' });

    const activeLinked = await EstoqueItem.count({
      where: {
        ID_ESTOQUE: parseInt(id),
        STATUS: { [Op.ne]: 'DISPONIVEL' },
      },
    });
    if (activeLinked > 0) {
      return res.status(400).json({ error: 'Existem itens alocados ativos. Nao e possivel excluir.' });
    }

    await EstoqueTI.destroy({ where: { ID: parseInt(id) } });
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir item:', err);
    res.status(500).json({ error: 'Erro interno ao excluir item.' });
  }
}

async function verificarDisponibilidade(req, res) {
  const qtdNb = Math.max(0, parseInt(req.query.notebook) || 0);
  const qtdCel = Math.max(0, parseInt(req.query.celular) || 0);
  if (qtdNb === 0 && qtdCel === 0) return res.json({ disponivel: true, faltaNb: 0, faltaCel: 0, dispNb: 0, dispCel: 0 });

  try {
    const rows = await EstoqueTI.findAll({
      where: { TIPO_PRODUTO: { [Op.in]: ['NOTEBOOK', 'CELULAR'] } },
      attributes: [
        'TIPO_PRODUTO',
        [sequelize.fn('SUM', sequelize.fn('ISNULL', sequelize.col('QUANTIDADE'), 1)), 'QTDE'],
      ],
      group: ['TIPO_PRODUTO'],
      raw: true,
    });
    const disp = {};
    rows.forEach(r => { disp[r.TIPO_PRODUTO] = r.QTDE; });
    const dispNb = disp['NOTEBOOK'] || 0;
    const dispCel = disp['CELULAR'] || 0;
    const faltaNb = Math.max(0, qtdNb - dispNb);
    const faltaCel = Math.max(0, qtdCel - dispCel);
    res.json({ disponivel: faltaNb === 0 && faltaCel === 0, faltaNb, faltaCel, dispNb, dispCel });
  } catch (err) {
    console.error('Erro ao verificar disponibilidade:', err);
    res.status(500).json({ error: 'Erro ao verificar disponibilidade.' });
  }
}

async function criarPedidoCompra(req, res) {
  const { id_vaga, itens, funcao, setor, prazo, solicitante } = req.body;
  const usuario = req.session.protheusId || req.session.username || 'ADMIN';
  if (!id_vaga || !itens || !itens.length) {
    return res.status(400).json({ error: 'Dados invalidos para pedido de compra.' });
  }
  try {
    await PedidoCompraTI.create({
      ID_VAGA: parseInt(id_vaga),
      ITENS_JSON: JSON.stringify(itens),
      USUARIO_PEDIDO: usuario,
    });

    const itensTexto = itens.map(i => `${i.qtd}x ${i.tipo}`).join(', ');
    const assunto = `Pedido de Compra TI - Vaga #${id_vaga} - ${funcao || ''}`;
    const corpo = buildEmailPedido({ id_vaga, itens, funcao, setor, prazo, solicitante });

    const emailsUnicos = [...new Set(DESTINATARIOS_PEDIDO)];
    for (const email of emailsUnicos) {
      try {
        await notificacaoModel.enqueue({
          tipo: 'EMAIL',
          destinatario: email,
          mensagem: `Pedido de compra TI - Vaga #${id_vaga}: ${itensTexto}`,
          metadados: JSON.stringify({
            assunto, corpo,
            sistema: 'portal-vagas-rh',
            fluxo: 'pedido-compra-ti',
            destinatario: email,
          }),
        });
      } catch (emailErr) {
        console.error('Erro ao enfileirar email pedido:', emailErr.message);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao criar pedido de compra:', err);
    res.status(500).json({ error: 'Erro interno ao criar pedido.' });
  }
}

async function listarPedidos(_req, res) {
  try {
    const rows = await PedidoCompraTI.findAll({
      include: [{ model: Vaga, as: 'vaga', attributes: ['FUNCAO', 'SETOR'], required: false }],
      order: [['DTPEDIDO', 'DESC']],
    });
    res.json(rows.map(p => {
      const { vaga, DTPEDIDO, ...rest } = p.toJSON();
      return { ...rest, DTPEDIDO: formatDate(DTPEDIDO), VAGA_FUNCAO: vaga?.FUNCAO || null, VAGA_SETOR: vaga?.SETOR || null };
    }));
  } catch (err) {
    console.error('Erro ao listar pedidos:', err);
    res.status(500).json({ error: 'Erro ao listar pedidos.' });
  }
}

async function atualizarStatusPedido(req, res) {
  const { id } = req.params;
  const { status } = req.body;
  const statusValido = ['PENDENTE', 'ATENDIDO', 'CANCELADO'].includes(status) ? status : null;
  if (!statusValido) return res.status(400).json({ error: 'Status invalido.' });
  try {
    await PedidoCompraTI.update(
      { STATUS: statusValido, DTATUALIZACAO: new Date() },
      { where: { ID: parseInt(id) } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao atualizar pedido:', err);
    res.status(500).json({ error: 'Erro interno.' });
  }
}

async function listarItens(req, res) {
  const { id } = req.params;
  try {
    const rows = await EstoqueItem.findAll({
      where: { ID_ESTOQUE: parseInt(id) },
      include: [{ model: Vaga, as: 'vaga', attributes: ['FUNCAO', 'SETOR'], required: false }],
      order: [['DTALOCACAO', 'DESC']],
    });
    res.json(rows.map(a => {
      const { vaga, DTALOCACAO, ...rest } = a.toJSON();
      return { ...rest, DTALOCACAO: formatDateTime(DTALOCACAO), VAGA_FUNCAO: vaga?.FUNCAO || null, VAGA_SETOR: vaga?.SETOR || null };
    }));
  } catch (err) {
    if (err.number === 208 || (err.message && err.message.includes('RH_ESTOQUE_ITENS'))) {
      console.warn('Aviso: tabela RH_ESTOQUE_ITENS nao encontrada, retornando lista vazia.');
      return res.json([]);
    }
    console.error('Erro ao listar itens:', err);
    res.status(500).json({ error: 'Erro ao listar itens.' });
  }
}

module.exports = {
  renderEstoque,
  listarEstoque,
  cadastrarItem,
  editarItem,
  excluirItem,
  verificarDisponibilidade,
  criarPedidoCompra,
  listarPedidos,
  atualizarStatusPedido,
  listarItens,
};
