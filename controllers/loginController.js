const axios = require('axios');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const sql = require('mssql');
const dotenv = require('dotenv');
const dbConfig = require('../database/dbConfig');
const notificacaoModel = require('../models/notificacaoModel');

dotenv.config();

const PROTHEUS_SERVER = process.env.PROTHEUS_SERVER;
const TIMEOUT_MS = 120 * 60 * 1000;
const PROTHEUS_ADMIN_FIXO_ID = '000460';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;
const USERNAME_REGEX = /^[A-Za-z0-9._-]{3,100}$/;
const OTP_CODE_REGEX = /^\d{6}$/;
const COOKIE_COMMON = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
};
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_RESENDS = 3;
const OTP_SECRET = process.env.OTP_SECRET || 'portal-vagas-otp-secret-change-this';

function normalizeUsername(username) {
  return String(username || '').trim();
}

function isValidUsername(username) {
  return USERNAME_REGEX.test(normalizeUsername(username));
}

function isValidEmail(email) {
  return EMAIL_REGEX.test(String(email || '').trim());
}

function isStrongPassword(password) {
  return PASSWORD_REGEX.test(String(password || ''));
}

function normalizeTelefone(telefone) {
  const digits = String(telefone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length < 10 || digits.length > 11) return null;
  return digits;
}

function generateOtpCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function hashOtp(code, email) {
  return crypto.createHash('sha256').update(`${code}:${String(email || '').toLowerCase()}:${OTP_SECRET}`).digest('hex');
}

function maskEmail(email) {
  const value = String(email || '').trim();
  const [name, domain] = value.split('@');
  if (!name || !domain) return value;
  if (name.length <= 2) return `${name[0] || '*'}*@${domain}`;
  return `${name.slice(0, 2)}***@${domain}`;
}

async function sendOtpByEmail(email, nome, otpCode) {
  const mensagem = `Olá ${String(nome || 'candidato(a)')},\n\nSeu código de verificação do Portal Vagas RH é: ${otpCode}.\nO código expira em 10 minutos.\n\nSe você não solicitou este cadastro, ignore este e-mail.`;

  await notificacaoModel.enqueue({
    tipo: 'EMAIL',
    destinatario: email,
    mensagem,
    template_name: 'OTP_CADASTRO_PORTAL_RH',
    template_params: JSON.stringify({
      nome: String(nome || ''),
      otp: otpCode,
      ttl_minutos: 10,
    }),
    metadados: JSON.stringify({
      sistema: 'portal-vagas-rh',
      fluxo: 'cadastro_otp',
      destinatario: email,
    }),
  });
}

async function isUsernameAvailable(username) {
  const normalized = normalizeUsername(username);
  if (!isValidUsername(normalized)) return false;

  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    const result = await pool.request()
      .input('USERNAME', sql.VarChar(100), normalized)
      .query(`SELECT TOP 1 ID FROM [portal_rh].[dbo].[RH_USUARIOS] WHERE USERNAME = @USERNAME`);
    return result.recordset.length === 0;
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function getLocalUser(username) {
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    const result = await pool.request()
      .input('USERNAME', sql.VarChar(100), username)
            .query(`SELECT ID, USERNAME, PASSWORD_HASH, NOME, EMAIL, ATIVO, ADM, ID_PROTHEUS
              FROM [portal_rh].[dbo].[RH_USUARIOS]
              WHERE USERNAME = @USERNAME AND ATIVO = 1`);
    return result.recordset.length > 0 ? result.recordset[0] : null;
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function getUserByProtheusId(protheusId) {
  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    const result = await pool.request()
      .input('ID_PROTHEUS', sql.VarChar(50), String(protheusId || '').trim())
            .query(`SELECT TOP 1 ID, USERNAME, NOME, EMAIL, ATIVO, ADM, ID_PROTHEUS
              FROM [portal_rh].[dbo].[RH_USUARIOS]
              WHERE ID_PROTHEUS = @ID_PROTHEUS AND ATIVO = 1`);
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
  const vinculado = await getUserByProtheusId(userID);
  req.session.userId = userID;
  req.session.isProtheus = true;
  req.session.protheusId = userID;
  req.session.username = vinculado?.NOME || req.cookies['username'] || 'Usuário';
  req.session.isAdmin = Number(vinculado?.ADM || 0) === 1 || String(userID) === PROTHEUS_ADMIN_FIXO_ID;
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
  res.cookie('token', access_token, { ...COOKIE_COMMON, maxAge: 3600000 });
  res.cookie('refresh_token', newRefresh, { ...COOKIE_COMMON, maxAge: 43200000 });
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
  const username = normalizeUsername(req.body.username);
  const { authData } = req.body;

  if (!username || !authData || !isValidUsername(username)) {
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
    const vinculado = await getUserByProtheusId(userID);

    res.cookie('token', access_token, { ...COOKIE_COMMON, maxAge: 3600000 });
    res.cookie('refresh_token', refresh_token, { ...COOKIE_COMMON, maxAge: 43200000 });
    res.cookie('username', username, { ...COOKIE_COMMON, maxAge: 43200000 });

    req.session.userId = userID;
    req.session.username = vinculado?.NOME || username;
    req.session.isProtheus = true;
    req.session.protheusId = userID;
    req.session.isAdmin = Number(vinculado?.ADM || 0) === 1 || String(userID) === PROTHEUS_ADMIN_FIXO_ID;
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
      req.session.isAdmin = Number(localUser.ADM || 0) === 1;
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
  const username = normalizeUsername(req.body.username);
  const password = String(req.body.password || '');
  const nome = String(req.body.nome || '').trim();
  const email = String(req.body.email || '').trim();
  const telefone = normalizeTelefone(req.body.telefone);

  if (!username || !password || !nome) {
    return res.redirect('/register?error=campos_obrigatorios');
  }

  if (!isValidUsername(username)) {
    return res.redirect('/register?error=usuario_invalido');
  }

  if (!email) {
    return res.redirect('/register?error=email_obrigatorio');
  }

  if (email && !isValidEmail(email)) {
    return res.redirect('/register?error=email_invalido');
  }

  if (!isStrongPassword(password)) {
    return res.redirect('/register?error=senha_fraca');
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const usernameLivre = await isUsernameAvailable(username);
    if (!usernameLivre) {
      return res.redirect('/register?error=usuario_ja_existe');
    }

    const otpCode = generateOtpCode();
    req.session.pendingRegistration = {
      username,
      passwordHash,
      nome,
      email,
      telefone,
      otpHash: hashOtp(otpCode, email),
      otpExpiresAt: Date.now() + OTP_TTL_MS,
      otpAttempts: 0,
      otpResendCount: 0,
      createdAt: Date.now(),
    };

    await sendOtpByEmail(email, nome, otpCode);

    return req.session.save((err) => {
      if (err) console.error('Session save error:', err);
      return res.redirect('/register/verify');
    });
  } catch (err) {
    console.error('Erro ao iniciar cadastro com OTP:', err);
    return res.redirect('/register?error=erro_envio_otp');
  }
}

async function renderVerificarCadastro(req, res) {
  const pending = req.session.pendingRegistration;
  if (!pending || !pending.email) {
    return res.redirect('/register?error=otp_expirado');
  }

  const expiresInMs = Number(pending.otpExpiresAt || 0) - Date.now();
  if (expiresInMs <= 0) {
    req.session.pendingRegistration = null;
    return req.session.save(() => res.redirect('/register?error=otp_expirado'));
  }

  return res.render('System/registerVerifyPage', {
    error: req.query.error || null,
    sent: req.query.sent === '1',
    csrfToken: req.csrfToken,
    maskedEmail: maskEmail(pending.email),
  });
}

async function verificarOtpCadastro(req, res) {
  const pending = req.session.pendingRegistration;
  const otp = String(req.body.otp || '').trim();

  if (!pending || !pending.email) {
    return res.redirect('/register?error=otp_expirado');
  }

  if (!OTP_CODE_REGEX.test(otp)) {
    return res.redirect('/register/verify?error=otp_invalido');
  }

  if (Date.now() > Number(pending.otpExpiresAt || 0)) {
    req.session.pendingRegistration = null;
    return req.session.save(() => res.redirect('/register?error=otp_expirado'));
  }

  if (Number(pending.otpAttempts || 0) >= OTP_MAX_ATTEMPTS) {
    req.session.pendingRegistration = null;
    return req.session.save(() => res.redirect('/register?error=otp_tentativas_excedidas'));
  }

  const valid = hashOtp(otp, pending.email) === pending.otpHash;
  if (!valid) {
    pending.otpAttempts = Number(pending.otpAttempts || 0) + 1;
    req.session.pendingRegistration = pending;
    return req.session.save(() => res.redirect('/register/verify?error=otp_invalido'));
  }

  let pool = null;
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();

    const existing = await pool.request()
      .input('USERNAME', sql.VarChar(100), pending.username)
      .query(`SELECT ID FROM [portal_rh].[dbo].[RH_USUARIOS] WHERE USERNAME = @USERNAME`);

    if (existing.recordset.length > 0) {
      req.session.pendingRegistration = null;
      return req.session.save(() => res.redirect('/register?error=usuario_ja_existe'));
    }

    await pool.request()
      .input('USERNAME', sql.VarChar(100), pending.username)
      .input('PASSWORD_HASH', sql.VarChar(255), pending.passwordHash)
      .input('NOME', sql.VarChar(200), pending.nome)
      .input('EMAIL', sql.VarChar(200), pending.email || null)
      .input('TELEFONE', sql.VarChar(20), pending.telefone || null)
      .query(`INSERT INTO [portal_rh].[dbo].[RH_USUARIOS] (USERNAME, PASSWORD_HASH, NOME, EMAIL, TELEFONE, ADM, ATIVO)
              VALUES (@USERNAME, @PASSWORD_HASH, @NOME, @EMAIL, @TELEFONE, 0, 1)`);

    const newUser = await pool.request()
      .input('USERNAME2', sql.VarChar(100), pending.username)
      .query(`SELECT ID FROM [portal_rh].[dbo].[RH_USUARIOS] WHERE USERNAME = @USERNAME2`);

    req.session.pendingRegistration = null;
    req.session.userId = 'LOCAL_' + newUser.recordset[0].ID;
    req.session.localUserId = newUser.recordset[0].ID;
    req.session.username = pending.nome;
    req.session.isProtheus = false;
    req.session.isAdmin = false;
    req.session.lastActivity = Date.now();

    return req.session.save((err) => {
      if (err) console.error('Session save error:', err);
      return res.redirect('/vagas');
    });
  } catch (err) {
    console.error('Erro ao validar OTP do cadastro:', err);
    return res.redirect('/register/verify?error=erro_interno_otp');
  } finally {
    if (pool) try { await pool.close(); } catch {}
  }
}

async function reenviarOtpCadastro(req, res) {
  const pending = req.session.pendingRegistration;
  if (!pending || !pending.email) {
    return res.redirect('/register?error=otp_expirado');
  }

  if (Number(pending.otpResendCount || 0) >= OTP_MAX_RESENDS) {
    return res.redirect('/register/verify?error=otp_limite_reenvio');
  }

  try {
    const otpCode = generateOtpCode();
    pending.otpHash = hashOtp(otpCode, pending.email);
    pending.otpExpiresAt = Date.now() + OTP_TTL_MS;
    pending.otpAttempts = 0;
    pending.otpResendCount = Number(pending.otpResendCount || 0) + 1;
    req.session.pendingRegistration = pending;

    await sendOtpByEmail(pending.email, pending.nome, otpCode);
    return req.session.save(() => res.redirect('/register/verify?sent=1'));
  } catch (err) {
    console.error('Erro ao reenviar OTP:', err);
    return res.redirect('/register/verify?error=erro_envio_otp');
  }
}

async function verificarDisponibilidadeUsuario(req, res) {
  try {
    const username = normalizeUsername(req.query.username);
    if (!isValidUsername(username)) return res.status(400).json({ available: false, message: 'Usuário inválido.' });
    const available = await isUsernameAvailable(username);
    return res.json({ available });
  } catch (err) {
    console.error('Erro ao verificar disponibilidade do usuário:', err);
    return res.status(500).json({ available: false, message: 'Erro interno.' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  if (req.session.isAdmin === true) return next();
  return res.status(403).send('Acesso restrito a administradores.');
}

module.exports = {
  validaLogin,
  cadastrarUsuario,
  renderVerificarCadastro,
  verificarOtpCadastro,
  reenviarOtpCadastro,
  verificarDisponibilidadeUsuario,
  requireAuth,
  requireAdmin,
};
