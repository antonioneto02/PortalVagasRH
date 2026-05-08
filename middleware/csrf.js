const crypto = require('crypto');

function generateCsrfToken(req) {
  const token = crypto.randomBytes(32).toString('hex');
  req.session.csrfToken = token;
  return token;
}

function verifyCsrfToken(req, res, next) {
  const sessionToken = String(req.session?.csrfToken || '');
  const requestToken = String(req.body?._csrf || '');

  if (!sessionToken || !requestToken) {
    const redirectTarget = req.path === '/register' ? '/register?error=sessao_invalida' : '/login?error=sessao_invalida';
    return res.redirect(redirectTarget);
  }

  const sessionBuffer = Buffer.from(sessionToken);
  const requestBuffer = Buffer.from(requestToken);

  if (sessionBuffer.length !== requestBuffer.length) {
    const redirectTarget = req.path === '/register' ? '/register?error=sessao_invalida' : '/login?error=sessao_invalida';
    return res.redirect(redirectTarget);
  }

  const isValid = crypto.timingSafeEqual(sessionBuffer, requestBuffer);
  if (!isValid) {
    const redirectTarget = req.path === '/register' ? '/register?error=sessao_invalida' : '/login?error=sessao_invalida';
    return res.redirect(redirectTarget);
  }

  req.session.csrfToken = null;
  return next();
}

module.exports = {
  generateCsrfToken,
  verifyCsrfToken,
};
