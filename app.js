const config = require('./config');

const express = require('express');
const path = require('path');
const http = require('http');
const methodOverride = require('method-override');
const session = require('express-session');
const { Server } = require('socket.io');
const socketHandler = require('./socket');
const { requireAuth } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

if (config.trustProxy) {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.locals.appName = config.appName;

app.use(express.urlencoded({ extended: true }));
// rawBody is kept for checking the signature of messages from the betting station.
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); } }));
app.use(methodOverride('_method'));
app.use(session({
  name: config.sessionCookieName,
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: 1000 * 60 * 60 * 12
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/health', require('./routes/health'));

app.use((req, res, next) => {
  req.io = io;
  res.locals.path = req.path;
  res.locals.query = req.query;
  res.locals.isAuthenticated = Boolean(req.session?.authenticated);
  res.locals.bridgeEnabled = require('./services/bettingBridge').enabled();
  next();
});

app.use('/bridge', require('./routes/bridge'));
app.use('/', require('./routes/auth'));
app.use('/tv', require('./routes/tv'));
app.use(requireAuth);
app.use('/', require('./routes/dashboard'));
app.use('/events', require('./routes/events'));
app.use('/owners', require('./routes/owners'));
app.use('/entries', require('./routes/entries'));
app.use('/chickens', require('./routes/chickens'));
app.use('/matching', require('./routes/matching'));
app.use('/fights', require('./routes/fights'));
app.use('/live', require('./routes/live'));
app.use('/reset', require('./routes/reset'));
app.use('/audit', require('./routes/audit'));

app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page Not Found',
    message: 'The requested page was not found.'
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  const message = status === 500 ? 'Unexpected server error.' : err.message;

  if (req.accepts('json') && !req.accepts('html')) {
    return res.status(status).json({ ok: false, message });
  }

  res.status(status).render('error', { title: 'Error', message });
});

socketHandler(io);
require('./services/bettingBridge').start();

server.listen(config.port, () => {
  console.log(`${config.appName} running on http://0.0.0.0:${config.port}`);
});
