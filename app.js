require('dotenv').config();

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

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.locals.appName = 'Cockpit Event Matching';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(session({
  name: 'cockpit.sid',
  secret: process.env.SESSION_SECRET || 'cockpit-static-pin-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 12
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  req.io = io;
  res.locals.path = req.path;
  res.locals.query = req.query;
  res.locals.isAuthenticated = Boolean(req.session?.authenticated);
  next();
});

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

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Cockpit matching system running on http://0.0.0.0:${port}`);
});
