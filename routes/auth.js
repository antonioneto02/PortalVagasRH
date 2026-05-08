const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const {
  validaLogin,
  cadastrarUsuario,
  renderVerificarCadastro,
  verificarOtpCadastro,
  reenviarOtpCadastro,
  verificarDisponibilidadeUsuario,
} = require('../controllers/loginController');
const { generateCsrfToken, verifyCsrfToken } = require('../middleware/csrf');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.redirect('/login?error=too_many_attempts'),
});

const registerLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.redirect('/register?error=too_many_attempts'),
});

const usernameCheckLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.redirect('/register/verify?error=too_many_attempts'),
});

const otpResendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 4,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.redirect('/register/verify?error=too_many_attempts'),
});

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/vagas');
  const csrfToken = generateCsrfToken(req);
  res.render('System/loginPage', {
    error: req.query.error || null,
    timeout: req.query.timeout === 'true',
    csrfToken,
  });
});

router.post('/login', loginLimiter, verifyCsrfToken, validaLogin);
router.get('/register/check-username', usernameCheckLimiter, verificarDisponibilidadeUsuario);
router.get('/register', (req, res) => {
  const csrfToken = generateCsrfToken(req);
  res.render('System/registerPage', {
    username: req.query.username || '',
    error: req.query.error || null,
    csrfToken,
  });
});

router.post('/register', registerLimiter, verifyCsrfToken, cadastrarUsuario);
router.get('/register/verify', (req, res) => {
  req.csrfToken = generateCsrfToken(req);
  return renderVerificarCadastro(req, res);
});
router.post('/register/verify', otpVerifyLimiter, verifyCsrfToken, verificarOtpCadastro);
router.post('/register/resend-otp', otpResendLimiter, verifyCsrfToken, reenviarOtpCadastro);
router.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.clearCookie('refresh_token');
  res.clearCookie('username');
  req.session.destroy(() => {});
  res.redirect('/login');
});

module.exports = router;
