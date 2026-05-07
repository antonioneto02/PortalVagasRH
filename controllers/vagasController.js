const sql = require('mssql');
const dbConfig = require('../database/dbConfig');
const dbConfigDw = require('../database/dbConfigDw');

const ID_PROTHEUS_CADASTRO = '000460';

function podeCadastrarFn(session) {
  return session.isProtheus && session.protheusId === ID_PROTHEUS_CADASTRO;
}

async function listarVagas(req, res) {
  const isProtheus = req.session.isProtheus;
  const podeCadastrar = podeCadastrarFn(req.session);

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

  let sla_dias_final = sla_dias ? parseInt(sla_dias) : null;
  let classificacao_final = classificacao || null;

  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();

    if (!sla_dias_final || !classificacao_final) {
      try {
        const slaResult = await pool.request()
          .input('FUNCAO_SLA', sql.VarChar(200), funcao)
          .query(`SELECT SLA_DIAS, CLASSIFICACAO FROM RH_SLA_CONFIG WHERE UPPER(RTRIM(FUNCAO)) = UPPER(RTRIM(@FUNCAO_SLA))`);
        if (slaResult.recordset.length > 0) {
          sla_dias_final = sla_dias_final || slaResult.recordset[0].SLA_DIAS;
          classificacao_final = classificacao_final || slaResult.recordset[0].CLASSIFICACAO;
        }
      } catch {}
    }

    await pool.request()
      .input('FUNCAO', sql.VarChar(200), funcao)
      .input('DATA_ABERTURA', sql.Date, new Date(data_abertura))
      .input('TIPO_VAGA', sql.VarChar(20), tipo_vaga)
      .input('SOLICITANTE', sql.VarChar(200), solicitante || null)
      .input('SETOR', sql.VarChar(200), setor || null)
      .input('NOTEBOOK', sql.Char(3), notebook === 'SIM' ? 'SIM' : 'NAO')
      .input('CELULAR', sql.Char(3), celular === 'SIM' ? 'SIM' : 'NAO')
      .input('REQUISITOS_VAGA', sql.VarChar(sql.MAX), requisitos_vaga || null)
      .input('SLA_DIAS', sql.Int, sla_dias_final)
      .input('CLASSIFICACAO', sql.VarChar(20), classificacao_final)
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

async function getFuncoes(req, res) {
  const q = req.query.q || '';
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfigDw).connect();
    const result = await pool.request()
      .input('Q', sql.VarChar(200), '%' + q + '%')
      .query(`SELECT DISTINCT RTRIM(LTRIM(FUNCAO)) AS FUNCAO
              FROM V_RECURSOS_HUMANOS
              WHERE FUNCAO IS NOT NULL AND FUNCAO <> '' AND FUNCAO LIKE @Q
              ORDER BY FUNCAO`);
    res.json(result.recordset.map(r => r.FUNCAO));
  } catch (err) {
    console.error('Erro ao buscar funções:', err);
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
      .input('Q', sql.VarChar(200), '%' + q + '%')
      .query(`SELECT DISTINCT RTRIM(LTRIM(Nome)) AS Nome
              FROM V_PESSOAS
              WHERE Nome IS NOT NULL AND Nome <> '' AND Nome LIKE @Q
              ORDER BY Nome`);
    res.json(result.recordset.map(r => r.Nome));
  } catch (err) {
    console.error('Erro ao buscar pessoas:', err);
    res.json([]);
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function renderCadSla(req, res) {
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    const result = await pool.request()
      .query(`SELECT ID, FUNCAO, SLA_DIAS, CLASSIFICACAO FROM RH_SLA_CONFIG ORDER BY FUNCAO`);
    res.render('Vagas/cad_sla', {
      slaConfig: result.recordset,
      username: req.session.username,
      isProtheus: req.session.isProtheus,
      protheusId: req.session.protheusId || null,
      podeCadastrar: podeCadastrarFn(req.session),
    });
  } catch (err) {
    console.error('Erro ao carregar CAD SLA:', err);
    res.status(500).send('Erro ao carregar CAD SLA.');
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function listarSlaApi(_req, res) {
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    const result = await pool.request()
      .query(`SELECT ID, FUNCAO, SLA_DIAS, CLASSIFICACAO FROM RH_SLA_CONFIG ORDER BY FUNCAO`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar SLA.' });
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function slaByFuncao(req, res) {
  const funcao = req.query.funcao || '';
  if (!funcao) return res.json({});
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    const result = await pool.request()
      .input('FUNCAO', sql.VarChar(200), funcao)
      .query(`SELECT SLA_DIAS, CLASSIFICACAO FROM RH_SLA_CONFIG WHERE UPPER(RTRIM(FUNCAO)) = UPPER(RTRIM(@FUNCAO))`);
    if (result.recordset.length > 0) {
      res.json({ sla_dias: result.recordset[0].SLA_DIAS, classificacao: result.recordset[0].CLASSIFICACAO });
    } else {
      res.json({});
    }
  } catch (err) {
    res.json({});
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function salvarSla(req, res) {
  if (!podeCadastrarFn(req.session)) return res.status(403).json({ error: 'Acesso negado.' });
  const { funcao, sla_dias, classificacao } = req.body;
  if (!funcao || !sla_dias || !classificacao) return res.status(400).json({ error: 'Campos obrigatórios.' });
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    await pool.request()
      .input('FUNCAO', sql.VarChar(200), funcao)
      .input('SLA_DIAS', sql.Int, parseInt(sla_dias))
      .input('CLASSIFICACAO', sql.VarChar(20), classificacao)
      .query(`INSERT INTO RH_SLA_CONFIG (FUNCAO, SLA_DIAS, CLASSIFICACAO) VALUES (@FUNCAO, @SLA_DIAS, @CLASSIFICACAO)`);
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao salvar SLA:', err);
    res.status(500).json({ error: 'Erro interno.' });
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function atualizarSla(req, res) {
  if (!podeCadastrarFn(req.session)) return res.status(403).json({ error: 'Acesso negado.' });
  const { id } = req.params;
  const { funcao, sla_dias, classificacao } = req.body;
  if (!funcao || !sla_dias || !classificacao) return res.status(400).json({ error: 'Campos obrigatórios.' });
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    await pool.request()
      .input('ID', sql.Int, parseInt(id))
      .input('FUNCAO', sql.VarChar(200), funcao)
      .input('SLA_DIAS', sql.Int, parseInt(sla_dias))
      .input('CLASSIFICACAO', sql.VarChar(20), classificacao)
      .query(`UPDATE RH_SLA_CONFIG SET FUNCAO=@FUNCAO, SLA_DIAS=@SLA_DIAS, CLASSIFICACAO=@CLASSIFICACAO WHERE ID=@ID`);
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao atualizar SLA:', err);
    res.status(500).json({ error: 'Erro interno.' });
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function deletarSla(req, res) {
  if (!podeCadastrarFn(req.session)) return res.status(403).json({ error: 'Acesso negado.' });
  const { id } = req.params;
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    await pool.request()
      .input('ID', sql.Int, parseInt(id))
      .query(`DELETE FROM RH_SLA_CONFIG WHERE ID=@ID`);
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao deletar SLA:', err);
    res.status(500).json({ error: 'Erro interno.' });
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

module.exports = {
  listarVagas, cadastrarVaga,
  getFuncoes, getPessoas,
  renderCadSla, listarSlaApi, slaByFuncao,
  salvarSla, atualizarSla, deletarSla,
};
