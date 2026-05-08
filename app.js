const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const https = require('https');
const fs = require('fs');

dotenv.config();

const app = express();
const port = process.env.PORT || 3020;
const host = process.env.HOST;

const options = {
  key: fs.readFileSync('cini.key'),
  cert: fs.readFileSync('cini.crt'),
};

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(session({
  secret: process.env.SESSION_SECRET || 'vagas-rh-secret',
  resave: true,
  saveUninitialized: false,
  cookie: {
    secure: false,
    sameSite: 'lax',
    maxAge: 7200000,
  },
}));

const authRouter = require('./routes/auth');
const vagasRouter = require('./routes/vagas');

app.use(authRouter);
app.use(vagasRouter);

app.get('/', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  res.redirect('/vagas');
});

app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

https.createServer(options, app).listen(port, host || '0.0.0.0', () => {
  console.log(`Portal Vagas RH rodando em https://${host || '0.0.0.0'}:${port}`);
});
