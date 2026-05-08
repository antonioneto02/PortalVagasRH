'use strict';

const sql = require('mssql');
const dbConfigDw = require('../database/dbConfigDw');

async function enqueue({ tipo, destinatario, mensagem, metadados, template_name, template_params }) {
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfigDw).connect();
    await pool.request()
      .input('TIPO_MENSAGEM', sql.VarChar(50), tipo || 'EMAIL')
      .input('DESTINATARIO', sql.VarChar(150), destinatario || '')
      .input('MENSAGEM', sql.NVarChar(sql.MAX), mensagem || '')
      .input('TEMPLATE_NAME', sql.VarChar(100), template_name || null)
      .input('TEMPLATE_PARAMS', sql.NVarChar(sql.MAX), template_params || null)
      .input('STATUS', sql.VarChar(20), 'PENDENTE')
      .input('TENTATIVAS', sql.Int, 0)
      .input('ERRO', sql.NVarChar(sql.MAX), null)
      .input('DTINC', sql.DateTime, new Date())
      .input('DTENVIO', sql.DateTime, null)
      .input('MESSAGE_ID', sql.VarChar(100), null)
      .input('METADADOS', sql.NVarChar(sql.MAX), metadados || null)
      .query(`
        INSERT INTO [dbo].[FATO_FILA_NOTIFICACOES]
        (TIPO_MENSAGEM, DESTINATARIO, MENSAGEM, TEMPLATE_NAME, TEMPLATE_PARAMS, STATUS, TENTATIVAS, ERRO, DTINC, DTENVIO, MESSAGE_ID, METADADOS)
        VALUES
        (@TIPO_MENSAGEM, @DESTINATARIO, @MENSAGEM, @TEMPLATE_NAME, @TEMPLATE_PARAMS, @STATUS, @TENTATIVAS, @ERRO, @DTINC, @DTENVIO, @MESSAGE_ID, @METADADOS)
      `);
  } catch (err) {
    console.error('notificacaoModel.enqueue error:', err.message || err);
    throw err;
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

module.exports = { enqueue };
