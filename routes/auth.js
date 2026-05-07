const express = require('express');
const router = express.Router();
const { validaLogin, cadastrarUsuario } = require('../controllers/loginController');

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/vagas');
  res.render('System/loginPage', {
    error: req.query.error || null,
    timeout: req.query.timeout === 'true',
  });
});

router.post('/login', validaLogin);
router.get('/register', (req, res) => {
  res.render('System/registerPage', {
    username: req.query.username || '',
    error: req.query.error || null,
  });
});

router.post('/register', cadastrarUsuario);
router.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.clearCookie('refresh_token');
  res.clearCookie('username');
  req.session.destroy(() => {});
  res.redirect('/login');
});

module.exports = router;
