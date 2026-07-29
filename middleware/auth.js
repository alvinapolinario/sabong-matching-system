function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();

  if (req.accepts('json') && !req.accepts('html')) {
    return res.status(401).json({ ok: false, message: 'Login required.' });
  }

  res.redirect(`/login?return_to=${encodeURIComponent(req.originalUrl)}`);
}

module.exports = { requireAuth };
