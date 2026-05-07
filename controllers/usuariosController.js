const bcrypt = require('bcrypt');
const sql = require('mssql');
const dbConfig = require('../database/dbConfig');
const dbConfigDw = require('../database/dbConfigDw');
const dbConfigProtheus = require('../database/dbConfigProtheus');

async function renderUsuarios(req, res) {
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    const result = await pool.request().query(`
      SELECT [ID], [USERNAME], [PASSWORD_HASH], [NOME], [EMAIL], [TELEFONE],
             CONVERT(VARCHAR, [DTCADASTRO], 103) AS DTCADASTRO,
             [ATIVO], [ADM], [ID_PROTHEUS]
      FROM [portal_rh].[dbo].[RH_USUARIOS]
      ORDER BY ID DESC
    `);

    res.render('System/usuarios', {
      usuarios: result.recordset,
      username: req.session.username,
      isProtheus: req.session.isProtheus,
      isAdmin: req.session.isAdmin === true,
      currentPath: '/usuarios',
    });
  } catch (err) {
    console.error('Erro ao carregar usuários:', err);
    res.status(500).send('Erro ao carregar usuários.');
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function atualizarAdmUsuario(req, res) {
  const id = parseInt(req.params.id, 10);
  const adm = Number(req.body.adm) === 1 ? 1 : 0;

  if (!id) return res.status(400).json({ error: 'ID inválido.' });

  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    await pool.request()
      .input('ID', sql.Int, id)
      .input('ADM', sql.Int, adm)
      .query('UPDATE RH_USUARIOS SET ADM=@ADM WHERE ID=@ID');
    return res.json({ success: true });
  } catch (err) {
    console.error('Erro ao atualizar ADM:', err);
    return res.status(500).json({ error: 'Erro ao atualizar ADM.' });
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function criarUsuario(req, res) {
  const { username, password, nome, email, telefone, adm } = req.body;

  if (!username || !password || !nome) {
    return res.status(400).json({ error: 'Campos obrigatórios: usuário, senha e nome.' });
  }

  const admFlag = Number(adm) === 1 ? 1 : 0;
  let pool = null;
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    pool = await new sql.ConnectionPool(dbConfig).connect();

    const existing = await pool.request()
      .input('USERNAME', sql.VarChar(100), username)
      .query('SELECT TOP 1 ID FROM RH_USUARIOS WHERE USERNAME = @USERNAME');

    if (existing.recordset.length > 0) {
      return res.status(409).json({ error: 'Usuário já existe.' });
    }

    await pool.request()
      .input('USERNAME', sql.VarChar(100), username)
      .input('PASSWORD_HASH', sql.VarChar(255), passwordHash)
      .input('NOME', sql.VarChar(200), nome)
      .input('EMAIL', sql.VarChar(200), email || null)
      .input('TELEFONE', sql.VarChar(20), telefone || null)
      .input('ADM', sql.Int, admFlag)
      .query(`
        INSERT INTO RH_USUARIOS (USERNAME, PASSWORD_HASH, NOME, EMAIL, TELEFONE, ADM, ATIVO)
        VALUES (@USERNAME, @PASSWORD_HASH, @NOME, @EMAIL, @TELEFONE, @ADM, 1)
      `);

    return res.json({ success: true });
  } catch (err) {
    console.error('Erro ao criar usuário:', err);
    return res.status(500).json({ error: 'Erro ao criar usuário.' });
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function buscarUsuariosProtheus(req, res) {
  const q = (req.query.q || '').trim();
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfigProtheus).connect();
    const result = await pool.request()
      .input('Q', sql.VarChar(200), `%${q.toUpperCase()}%`)
      .query(`
        SELECT TOP 50
          RTRIM(LTRIM(USR_ID))   AS USR_ID,
          RTRIM(LTRIM(USR_NOME)) AS USR_NOME
        FROM [dbo].[SYS_USR]
        WHERE D_E_L_E_T_ = ''
          AND USR_NOME IS NOT NULL
          AND USR_ID   IS NOT NULL
          AND UPPER(USR_NOME) LIKE @Q
        ORDER BY USR_NOME
      `);

    const itens = result.recordset.map((r) => ({
      id: r.USR_ID,
      text: r.USR_ID + ' - ' + r.USR_NOME,
      nome: r.USR_NOME,
      id_protheus: r.USR_ID,
    }));

    return res.json(itens);
  } catch (err) {
    console.error('Erro ao buscar usuários Protheus:', err);
    return res.json([]);
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function incluirUsuarioProtheus(req, res) {
  const idProtheus = String(req.body.id_protheus || '').trim();
  const nome = String(req.body.nome || '').trim();
  const adm = Number(req.body.adm) === 1 ? 1 : 0;

  if (!idProtheus || !nome) {
    return res.status(400).json({ error: 'ID Protheus e nome são obrigatórios.' });
  }

  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();

    const existing = await pool.request()
      .input('ID_PROTHEUS', sql.VarChar(50), idProtheus)
      .query('SELECT TOP 1 ID FROM RH_USUARIOS WHERE ID_PROTHEUS = @ID_PROTHEUS');

    if (existing.recordset.length > 0) {
      return res.status(409).json({ error: 'Usuário Protheus já cadastrado.' });
    }

    const username = `PROTHEUS_${idProtheus}`;
    const senhaDummyHash = await bcrypt.hash(`PROTHEUS_${idProtheus}_${Date.now()}`, 10);

    await pool.request()
      .input('USERNAME', sql.VarChar(100), username)
      .input('PASSWORD_HASH', sql.VarChar(255), senhaDummyHash)
      .input('NOME', sql.VarChar(200), nome)
      .input('ADM', sql.Int, adm)
      .input('ID_PROTHEUS', sql.VarChar(50), idProtheus)
      .query(`
        INSERT INTO RH_USUARIOS (USERNAME, PASSWORD_HASH, NOME, ADM, ID_PROTHEUS, ATIVO)
        VALUES (@USERNAME, @PASSWORD_HASH, @NOME, @ADM, @ID_PROTHEUS, 1)
      `);

    return res.json({ success: true });
  } catch (err) {
    console.error('Erro ao incluir usuário Protheus:', err);
    return res.status(500).json({ error: 'Erro ao incluir usuário Protheus.' });
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

module.exports = {
  renderUsuarios,
  atualizarAdmUsuario,
  criarUsuario,
  buscarUsuariosProtheus,
  incluirUsuarioProtheus,
};
