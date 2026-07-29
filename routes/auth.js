const router = require('express').Router();
const config = require('../config');
const {
  isLoginRateLimited,
  remainingLockMinutes,
  recordFailedLogin,
  clearLoginAttempts
} = require('../middleware/loginRateLimit');

router.get('/login', (req, res) => {
  if (req.session?.authenticated) return res.redirect(req.query.return_to || '/');

  if (isLoginRateLimited(req)) {
    return res.render('auth/login', {
      title: 'Login',
      error: `Too many login attempts. Try again in ${remainingLockMinutes(req)} minute(s).`,
      returnTo: req.query.return_to || '/'
    });
  }

  res.render('auth/login', {
    title: 'Login',
    error: req.query.error || '',
    returnTo: req.query.return_to || '/'
  });
});

router.post('/login', (req, res) => {
  const pin = String(req.body.pin || '').trim();
  const returnTo = req.body.return_to || '/';

  if (isLoginRateLimited(req)) {
    return res.redirect(`/login?return_to=${encodeURIComponent(returnTo)}&error=${encodeURIComponent(`Too many login attempts. Try again in ${remainingLockMinutes(req)} minute(s).`)}`);
  }

  if (!/^\d{6}$/.test(pin) || pin !== config.loginPin) {
    recordFailedLogin(req);
    return res.redirect(`/login?return_to=${encodeURIComponent(returnTo)}&error=${encodeURIComponent('Invalid PIN code.')}`);
  }

  clearLoginAttempts(req);
  req.session.authenticated = true;
  req.session.save(() => res.redirect(returnTo));
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(config.sessionCookieName);
    res.redirect('/login');
  });
});

module.exports = router;
