const axios = require('axios');
const bcrypt = require('bcrypt');
const sql = require('mssql');
const dotenv = require('dotenv');
const dbConfig = require('../database/dbConfig');

dotenv.config();

const PROTHEUS_SERVER = process.env.PROTHEUS_SERVER;
const TIMEOUT_MS = 120 * 60 * 1000;

async function getLocalUser(username) {
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    const result = await pool.request()
      .input('USERNAME', sql.VarChar(100), username)
      .query(`SELECT ID, USERNAME, PASSWORD_HASH, NOME, EMAIL, ATIVO
              FROM RH_USUARIOS
              WHERE USERNAME = @USERNAME AND ATIVO = 1`);
    return result.recordset.length > 0 ? result.recordset[0] : null;
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function _restoreSessionFromToken(token, req, _res) {
  const resp = await axios.get(
    `http://${PROTHEUS_SERVER}:9001/rest/users/getuserid`,
    { headers: { Authorization: `Bearer ${token}` }, timeout: 6000 }
  );
  const userID = resp.data.userID;
  req.session.userId = userID;
  req.session.isProtheus = true;
  req.session.protheusId = userID;
  req.session.username = req.cookies['username'] || 'Usuário';
  req.session.lastActivity = Date.now();
  return new Promise(resolve => req.session.save(() => resolve()));
}

async function _tryRefreshToken(refreshToken, req, res) {
  const refreshResp = await axios.post(
    `http://${PROTHEUS_SERVER}:9001/rest/api/oauth2/v1/token`,
    null,
    { params: { grant_type: 'refresh_token', refresh_token: refreshToken }, timeout: 6000 }
  );
  const { access_token, refresh_token: newRefresh } = refreshResp.data;
  res.cookie('token', access_token, { httpOnly: true, secure: false, sameSite: 'lax', maxAge: 3600000 });
  res.cookie('refresh_token', newRefresh, { httpOnly: true, secure: false, sameSite: 'lax', maxAge: 43200000 });
  await _restoreSessionFromToken(access_token, req, res);
}

async function requireAuth(req, res, next) {
  if (req.session.userId) {
    const lastActivity = req.session.lastActivity || 0;
    if (Date.now() - lastActivity < TIMEOUT_MS) {
      req.session.lastActivity = Date.now();
      return next();
    }
    req.session.destroy(() => {});
    return res.redirect('/login?timeout=true');
  }

  const token = req.cookies['token'];
  const refreshToken = req.cookies['refresh_token'];

  if (token) {
    try {
      await _restoreSessionFromToken(token, req, res);
      return next();
    } catch {
      if (refreshToken) {
        try {
          await _tryRefreshToken(refreshToken, req, res);
          return next();
        } catch {}
      }
    }
  } else if (refreshToken) {
    try {
      await _tryRefreshToken(refreshToken, req, res);
      return next();
    } catch {}
  }
  const returnTo = req.originalUrl;
  req.session.returnTo = returnTo;
  return req.session.save(() => res.redirect('/login'));
}

async function validaLogin(req, res) {
  const { username, authData } = req.body;

  if (!username || !authData) {
    return res.redirect('/login?error=invalid_credentials');
  }

  let password;
  try {
    password = Buffer.from(authData, 'base64').toString('utf8');
  } catch {
    return res.redirect('/login?error=invalid_credentials');
  }

  if (!password) {
    return res.redirect('/login?error=invalid_credentials');
  }

  const returnTo = req.session.returnTo && req.session.returnTo !== '/login'
    ? req.session.returnTo
    : '/vagas';

  try {
    const protheusResp = await axios.post(
      `http://${PROTHEUS_SERVER}:9001/rest/api/oauth2/v1/token`,
      null,
      { params: { grant_type: 'password', username, password }, timeout: 10000 }
    );

    const { access_token, refresh_token } = protheusResp.data;
    const userIDResp = await axios.get(
      `http://${PROTHEUS_SERVER}:9001/rest/users/getuserid`,
      { headers: { Authorization: `Bearer ${access_token}` }, timeout: 6000 }
    );
    const userID = userIDResp.data.userID;

    res.cookie('token', access_token, { httpOnly: true, secure: false, sameSite: 'lax', maxAge: 3600000 });
    res.cookie('refresh_token', refresh_token, { httpOnly: true, secure: false, sameSite: 'lax', maxAge: 43200000 });
    res.cookie('username', username, { httpOnly: true, secure: false, sameSite: 'lax', maxAge: 43200000 });

    req.session.userId = userID;
    req.session.username = username;
    req.session.isProtheus = true;
    req.session.protheusId = userID;
    req.session.lastActivity = Date.now();
    delete req.session.returnTo;

    return req.session.save(err => {
      if (err) console.error('Session save error:', err);
      return res.redirect(returnTo);
    });
  } catch {
    try {
      const localUser = await getLocalUser(username);

      if (!localUser) {
        return res.redirect('/register?username=' + encodeURIComponent(username));
      }

      const senhaOk = await bcrypt.compare(password, localUser.PASSWORD_HASH);
      if (!senhaOk) {
        return res.redirect('/login?error=invalid_credentials');
      }

      req.session.userId = 'LOCAL_' + localUser.ID;
      req.session.username = localUser.NOME;
      req.session.isProtheus = false;
      req.session.localUserId = localUser.ID;
      req.session.lastActivity = Date.now();
      delete req.session.returnTo;

      return req.session.save(err => {
        if (err) console.error('Session save error:', err);
        return res.redirect(returnTo);
      });
    } catch (dbErr) {
      console.error('Erro ao verificar usuário local:', dbErr);
      return res.redirect('/login?error=invalid_credentials');
    }
  }
}

async function cadastrarUsuario(req, res) {
  const { username, password, nome, email, telefone } = req.body;

  if (!username || !password || !nome) {
    return res.redirect('/register?error=campos_obrigatorios');
  }

  let pool = null;
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    pool = await new sql.ConnectionPool(dbConfig).connect();
    const existing = await pool.request()
      .input('USERNAME', sql.VarChar(100), username)
      .query(`SELECT ID FROM RH_USUARIOS WHERE USERNAME = @USERNAME`);

    if (existing.recordset.length > 0) {
      return res.redirect('/register?error=usuario_ja_existe');
    }

    await pool.request()
      .input('USERNAME', sql.VarChar(100), username)
      .input('PASSWORD_HASH', sql.VarChar(255), passwordHash)
      .input('NOME', sql.VarChar(200), nome)
      .input('EMAIL', sql.VarChar(200), email || null)
      .input('TELEFONE', sql.VarChar(20), telefone || null)
      .query(`INSERT INTO RH_USUARIOS (USERNAME, PASSWORD_HASH, NOME, EMAIL, TELEFONE)
              VALUES (@USERNAME, @PASSWORD_HASH, @NOME, @EMAIL, @TELEFONE)`);

    const newUser = await pool.request()
      .input('USERNAME2', sql.VarChar(100), username)
      .query(`SELECT ID FROM RH_USUARIOS WHERE USERNAME = @USERNAME2`);

    req.session.userId = 'LOCAL_' + newUser.recordset[0].ID;
    req.session.localUserId = newUser.recordset[0].ID;
    req.session.username = nome;
    req.session.isProtheus = false;
    req.session.lastActivity = Date.now();

    return req.session.save(err => {
      if (err) console.error('Session save error:', err);
      return res.redirect('/vagas');
    });
  } catch (err) {
    console.error('Erro ao cadastrar usuário:', err);
    return res.redirect('/register?error=erro_interno');
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

module.exports = { validaLogin, cadastrarUsuario, requireAuth };
