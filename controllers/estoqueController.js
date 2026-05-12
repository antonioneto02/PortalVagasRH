'use strict';

const sql = require('mssql');
const dbConfig = require('../database/dbConfig');
const notificacaoModel = require('../models/notificacaoModel');

// Destinatários do pedido de compra (para teste, todos o mesmo email)
const DESTINATARIOS_PEDIDO = [
  'antonioneto3260@gmail.com', // TI
  'antonioneto3260@gmail.com', // Compras
  'antonioneto3260@gmail.com', // Solicitante
  'antonioneto3260@gmail.com', // RH
  'antonioneto3260@gmail.com', // Gestor
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
      <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#6b7280;font-size:.85rem;">Área / Setor</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${setor || '-'}</td></tr>
      <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#6b7280;font-size:.85rem;">Solicitante</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${solicitante || '-'}</td></tr>
      <tr><td style="padding:8px 12px;color:#6b7280;font-size:.85rem;">Data Necessária</td><td style="padding:8px 12px;">${prazo || '-'}</td></tr>
    </table>
    <p style="margin:0 0 10px;font-weight:600;color:#1f2937;">Itens Solicitados:</p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
      <thead><tr style="background:#2B286F;color:white;font-size:.85rem;">
        <th style="padding:8px 12px;text-align:left;">Equipamento</th>
        <th style="padding:8px 12px;text-align:center;">Quantidade</th>
      </tr></thead>
      <tbody>${itensHtml}</tbody>
    </table>
    <p style="margin:20px 0 0;font-size:.82rem;color:#9ca3af;">Este é um email automático gerado pelo Portal Vagas RH - Cini.</p>
  </div>
</div>
</body></html>`;
}

async function renderEstoque(req, res) {
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();

    const [itensResult, pedidosResult] = await Promise.all([
      pool.request().query(`
        SELECT e.ID, e.TIPO_PRODUTO, e.DESCRICAO, e.MODELO,
               ISNULL(e.QUANTIDADE, 1) AS QUANTIDADE,
               e.STATUS,
               CONVERT(VARCHAR, e.DTINCLUSAO, 103) AS DTINCLUSAO,
               (SELECT COUNT(*) FROM RH_ESTOQUE_ITENS WHERE ID_ESTOQUE = e.ID) AS TOTAL_ALOCACOES
        FROM RH_ESTOQUE_TI e
        ORDER BY e.TIPO_PRODUTO, e.DTINCLUSAO DESC
      `),
      pool.request().query(`
        SELECT p.ID, p.ID_VAGA, p.ITENS_JSON, p.STATUS, p.OBSERVACOES,
               p.USUARIO_PEDIDO,
               CONVERT(VARCHAR, p.DTPEDIDO, 103) AS DTPEDIDO,
               v.FUNCAO AS VAGA_FUNCAO, v.SETOR AS VAGA_SETOR,
               CONVERT(VARCHAR, v.PRAZO_CONTRATACAO, 103) AS VAGA_PRAZO
        FROM RH_PEDIDOS_COMPRA_TI p
        LEFT JOIN RH_VAGAS v ON v.ID = p.ID_VAGA
        ORDER BY p.DTPEDIDO DESC
      `)
    ]);

    res.render('Vagas/estoque', {
      itens: itensResult.recordset,
      pedidos: pedidosResult.recordset,
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
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function listarEstoque(req, res) {
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    const result = await pool.request().query(`
      SELECT e.ID, e.TIPO_PRODUTO, e.DESCRICAO, e.MODELO,
             ISNULL(e.QUANTIDADE, 1) AS QUANTIDADE,
             e.STATUS,
             CONVERT(VARCHAR, e.DTINCLUSAO, 103) AS DTINCLUSAO,
             (SELECT COUNT(*) FROM RH_ESTOQUE_ITENS WHERE ID_ESTOQUE = e.ID) AS TOTAL_ALOCACOES
      FROM RH_ESTOQUE_TI e
      ORDER BY e.TIPO_PRODUTO, e.DTINCLUSAO DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('Erro ao listar estoque:', err);
    res.status(500).json({ error: 'Erro ao listar estoque.' });
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function cadastrarItem(req, res) {
  const { tipo_produto, descricao, modelo, status, quantidade } = req.body;

  if (!tipo_produto) return res.status(400).json({ error: 'Tipo de produto é obrigatório.' });

  const statusValido = ['DISPONIVEL', 'RESERVADO', 'EM_USO', 'MANUTENCAO'].includes(status)
    ? status : 'DISPONIVEL';
  const qtd = Math.max(1, parseInt(quantidade) || 1);

  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    await pool.request()
      .input('TIPO', sql.VarChar(50), tipo_produto)
      .input('DESC', sql.VarChar(200), descricao || null)
      .input('MODELO', sql.VarChar(200), modelo || null)
      .input('STATUS', sql.VarChar(20), statusValido)
      .input('QTD', sql.Int, qtd)
      .query(`INSERT INTO RH_ESTOQUE_TI (TIPO_PRODUTO, DESCRICAO, MODELO, STATUS, QUANTIDADE)
              VALUES (@TIPO, @DESC, @MODELO, @STATUS, @QTD)`);
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao cadastrar item:', err);
    res.status(500).json({ error: 'Erro interno ao cadastrar item.' });
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function editarItem(req, res) {
  const { id } = req.params;
  const { tipo_produto, descricao, modelo, status, quantidade } = req.body;

  if (!tipo_produto) return res.status(400).json({ error: 'Tipo de produto é obrigatório.' });

  const statusValido = ['DISPONIVEL', 'RESERVADO', 'EM_USO', 'MANUTENCAO'].includes(status)
    ? status : 'DISPONIVEL';
  const qtd = Math.max(0, parseInt(quantidade) || 1);

  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    await pool.request()
      .input('ID', sql.Int, parseInt(id))
      .input('TIPO', sql.VarChar(50), tipo_produto)
      .input('DESC', sql.VarChar(200), descricao || null)
      .input('MODELO', sql.VarChar(200), modelo || null)
      .input('STATUS', sql.VarChar(20), statusValido)
      .input('QTD', sql.Int, qtd)
      .query(`UPDATE RH_ESTOQUE_TI SET TIPO_PRODUTO=@TIPO, DESCRICAO=@DESC, MODELO=@MODELO,
              STATUS=@STATUS, QUANTIDADE=@QTD, DTALTERACAO=GETDATE() WHERE ID=@ID`);
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao editar item:', err);
    res.status(500).json({ error: 'Erro interno ao editar item.' });
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function excluirItem(req, res) {
  const { id } = req.params;
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();

    const check = await pool.request()
      .input('ID', sql.Int, parseInt(id))
      .query(`SELECT STATUS FROM RH_ESTOQUE_TI WHERE ID = @ID`);

    if (!check.recordset.length) return res.status(404).json({ error: 'Item não encontrado.' });
    if (check.recordset[0].STATUS !== 'DISPONIVEL') {
      return res.status(400).json({ error: 'Somente itens com status DISPONIVEL podem ser excluídos.' });
    }

    await pool.request()
      .input('ID', sql.Int, parseInt(id))
      .query(`DELETE FROM RH_ESTOQUE_TI WHERE ID = @ID`);
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir item:', err);
    res.status(500).json({ error: 'Erro interno ao excluir item.' });
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function verificarDisponibilidade(req, res) {
  const qtdNb = Math.max(0, parseInt(req.query.notebook) || 0);
  const qtdCel = Math.max(0, parseInt(req.query.celular) || 0);

  if (qtdNb === 0 && qtdCel === 0) return res.json({ disponivel: true, faltaNb: 0, faltaCel: 0, dispNb: 0, dispCel: 0 });

  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    const result = await pool.request().query(`
      SELECT TIPO_PRODUTO, SUM(ISNULL(QUANTIDADE, 1)) AS QTDE
      FROM RH_ESTOQUE_TI
      WHERE STATUS = 'DISPONIVEL' AND TIPO_PRODUTO IN ('NOTEBOOK','CELULAR')
      GROUP BY TIPO_PRODUTO
    `);

    const disp = {};
    (result.recordset || []).forEach(r => { disp[r.TIPO_PRODUTO] = r.QTDE; });

    const dispNb = disp['NOTEBOOK'] || 0;
    const dispCel = disp['CELULAR'] || 0;
    const faltaNb = Math.max(0, qtdNb - dispNb);
    const faltaCel = Math.max(0, qtdCel - dispCel);

    res.json({ disponivel: faltaNb === 0 && faltaCel === 0, faltaNb, faltaCel, dispNb, dispCel });
  } catch (err) {
    console.error('Erro ao verificar disponibilidade:', err);
    res.status(500).json({ error: 'Erro ao verificar disponibilidade.' });
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function criarPedidoCompra(req, res) {
  const { id_vaga, itens, funcao, setor, prazo, solicitante } = req.body;
  const usuario = req.session.protheusId || req.session.username || 'ADMIN';

  if (!id_vaga || !itens || !itens.length) {
    return res.status(400).json({ error: 'Dados inválidos para pedido de compra.' });
  }

  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    await pool.request()
      .input('ID_VAGA', sql.Int, parseInt(id_vaga))
      .input('ITENS_JSON', sql.NVarChar(sql.MAX), JSON.stringify(itens))
      .input('USUARIO', sql.VarChar(50), usuario)
      .query(`INSERT INTO RH_PEDIDOS_COMPRA_TI (ID_VAGA, ITENS_JSON, USUARIO_PEDIDO) VALUES (@ID_VAGA, @ITENS_JSON, @USUARIO)`);

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
            assunto,
            corpo,
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
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function listarPedidos(req, res) {
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    const result = await pool.request().query(`
      SELECT p.ID, p.ID_VAGA, p.ITENS_JSON, p.STATUS, p.OBSERVACOES, p.USUARIO_PEDIDO,
             CONVERT(VARCHAR, p.DTPEDIDO, 103) AS DTPEDIDO,
             v.FUNCAO AS VAGA_FUNCAO, v.SETOR AS VAGA_SETOR
      FROM RH_PEDIDOS_COMPRA_TI p
      LEFT JOIN RH_VAGAS v ON v.ID = p.ID_VAGA
      ORDER BY p.DTPEDIDO DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('Erro ao listar pedidos:', err);
    res.status(500).json({ error: 'Erro ao listar pedidos.' });
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function atualizarStatusPedido(req, res) {
  const { id } = req.params;
  const { status } = req.body;
  const statusValido = ['PENDENTE', 'ATENDIDO', 'CANCELADO'].includes(status) ? status : null;
  if (!statusValido) return res.status(400).json({ error: 'Status inválido.' });

  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    await pool.request()
      .input('ID', sql.Int, parseInt(id))
      .input('STATUS', sql.VarChar(20), statusValido)
      .query(`UPDATE RH_PEDIDOS_COMPRA_TI SET STATUS=@STATUS, DTATUALIZACAO=GETDATE() WHERE ID=@ID`);
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao atualizar pedido:', err);
    res.status(500).json({ error: 'Erro interno.' });
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function listarItens(req, res) {
  const { id } = req.params;
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    const result = await pool.request()
      .input('ID_ESTOQUE', sql.Int, parseInt(id))
      .query(`
        SELECT a.ID, a.ID_VAGA, a.MATRICULA, a.AREA, a.USUARIO,
               CONVERT(VARCHAR, a.DTALOCACAO, 103) + ' ' + CONVERT(VARCHAR(5), a.DTALOCACAO, 108) AS DTALOCACAO,
               v.FUNCAO AS VAGA_FUNCAO, v.SETOR AS VAGA_SETOR
        FROM RH_ESTOQUE_ITENS a
        LEFT JOIN RH_VAGAS v ON v.ID = a.ID_VAGA
        WHERE a.ID_ESTOQUE = @ID_ESTOQUE
        ORDER BY a.DTALOCACAO DESC
      `);
    res.json(result.recordset || []);
  } catch (err) {
    console.error('Erro ao listar alocações:', err);
    res.status(500).json({ error: 'Erro ao listar alocações.' });
  } finally {
    if (pool) try { await pool.close(); } catch {}
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
