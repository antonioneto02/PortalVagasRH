const sql = require('mssql');
const dbConfig = require('../database/dbConfig');

const ID_PROTHEUS_CADASTRO = '000460';

async function listarVagas(req, res) {
  const isProtheus = req.session.isProtheus;
  const protheusId = req.session.protheusId || '';
  const podeCadastrar = isProtheus && protheusId === ID_PROTHEUS_CADASTRO;

  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();

    let query = `
      SELECT ID, FUNCAO, CONVERT(VARCHAR, DATA_ABERTURA, 103) AS DATA_ABERTURA,
             TIPO_VAGA, SOLICITANTE, SETOR, NOTEBOOK, CELULAR,
             REQUISITOS_VAGA, SLA_DIAS, CLASSIFICACAO, CANDIDATOS,
             ENTREVISTAS, CONVERT(VARCHAR, PRAZO_CONTRATACAO, 103) AS PRAZO_CONTRATACAO,
             CONVERT(VARCHAR, DT_CONTRATACAO, 103) AS DT_CONTRATACAO,
             MATRICULA, STATUS, EMPRESA, USUARIO_CADASTRO,
             CONVERT(VARCHAR, DTINCLUSAO, 103) AS DTINCLUSAO
      FROM RH_VAGAS
      WHERE 1=1
    `;
    
    if (!isProtheus) {
      query += ` AND TIPO_VAGA = 'EXTERNA'`;
    }

    query += ` ORDER BY DTINCLUSAO DESC`;
    const result = await pool.request().query(query);
    res.render('Vagas/listagem', {
      vagas: result.recordset,
      isProtheus,
      podeCadastrar,
      username: req.session.username,
      protheusId: req.session.protheusId || null,
    });
  } catch (err) {
    console.error('Erro ao listar vagas:', err);
    res.status(500).send('Erro ao carregar vagas.');
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function cadastrarVaga(req, res) {
  const isProtheus = req.session.isProtheus;
  const protheusId = req.session.protheusId || '';

  if (!isProtheus || protheusId !== ID_PROTHEUS_CADASTRO) {
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

  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    await pool.request()
      .input('FUNCAO', sql.VarChar(200), funcao)
      .input('DATA_ABERTURA', sql.Date, new Date(data_abertura))
      .input('TIPO_VAGA', sql.VarChar(20), tipo_vaga)
      .input('SOLICITANTE', sql.VarChar(200), solicitante || null)
      .input('SETOR', sql.VarChar(200), setor || null)
      .input('NOTEBOOK', sql.Char(3), notebook === 'SIM' ? 'SIM' : 'NAO')
      .input('CELULAR', sql.Char(3), celular === 'SIM' ? 'SIM' : 'NAO')
      .input('REQUISITOS_VAGA', sql.VarChar(sql.MAX), requisitos_vaga || null)
      .input('SLA_DIAS', sql.Int, sla_dias ? parseInt(sla_dias) : null)
      .input('CLASSIFICACAO', sql.VarChar(20), classificacao || null)
      .input('CANDIDATOS', sql.Int, candidatos ? parseInt(candidatos) : 0)
      .input('ENTREVISTAS', sql.Int, entrevistas ? parseInt(entrevistas) : 0)
      .input('PRAZO_CONTRATACAO', sql.Date, prazo_contratacao ? new Date(prazo_contratacao) : null)
      .input('DT_CONTRATACAO', sql.Date, dt_contratacao ? new Date(dt_contratacao) : null)
      .input('MATRICULA', sql.VarChar(50), matricula || null)
      .input('STATUS', sql.VarChar(20), status || 'ABERTA')
      .input('EMPRESA', sql.VarChar(200), empresa || null)
      .input('USUARIO_CADASTRO', sql.VarChar(50), protheusId)
      .query(`INSERT INTO RH_VAGAS
        (FUNCAO, DATA_ABERTURA, TIPO_VAGA, SOLICITANTE, SETOR, NOTEBOOK, CELULAR,
         REQUISITOS_VAGA, SLA_DIAS, CLASSIFICACAO, CANDIDATOS, ENTREVISTAS,
         PRAZO_CONTRATACAO, DT_CONTRATACAO, MATRICULA, STATUS, EMPRESA, USUARIO_CADASTRO)
        VALUES
        (@FUNCAO, @DATA_ABERTURA, @TIPO_VAGA, @SOLICITANTE, @SETOR, @NOTEBOOK, @CELULAR,
         @REQUISITOS_VAGA, @SLA_DIAS, @CLASSIFICACAO, @CANDIDATOS, @ENTREVISTAS,
         @PRAZO_CONTRATACAO, @DT_CONTRATACAO, @MATRICULA, @STATUS, @EMPRESA, @USUARIO_CADASTRO)`);

    return res.json({ success: true });
  } catch (err) {
    console.error('Erro ao cadastrar vaga:', err);
    return res.status(500).json({ error: 'Erro interno ao cadastrar vaga.' });
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

module.exports = { listarVagas, cadastrarVaga };
