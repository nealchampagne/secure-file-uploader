const express = require('express');
const session = require('express-session');
require('dotenv').config();
const { PrismaSessionStore } = require('@quixo3/prisma-session-store');
const prisma = require('./lib/prisma.js');
const supabase = require('./lib/supabase.js');
const passport = require('passport');
require('./auth.js');
const path = require('node:path');
const PORT = process.env.PORT || 3000;
const flash = require('connect-flash');

const sessionStore = 
  process.env.NODE_ENV === 'test'
    ? new session.MemoryStore()
    : new PrismaSessionStore(prisma, { checkPeriod: 2 * 60 * 1000 });

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: sessionStore,
  secret: process.env.SECRET || 'test-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 1 day
    secure: false, // true in production with HTTPS
    httpOnly: true,
  }
}));
if (process.env.NODE_ENV === 'test') {
  app.use((req, res, next) => {
    const testUser = req.get('test-user');
    const wrongUser = req.get('wrong-test-user');

    req.session = req.session || {};

    if (wrongUser) {
      req.session.user = {
        id: wrongUser,
        email: `${wrongUser}@example.com`,
        rootFolderId: 'wrong-folder-id'
      };
    } else if (testUser) {
      req.session.user = {
        id: testUser,
        email: `${testUser}@example.com`,
        rootFolderId: 'folder-id'
      };
    } else {
      delete req.session.user;
    }

    res.locals.user = req.session.user || null;
    next();
  });
}
app.set('sessionStore', sessionStore);
app.use(flash());
app.use((req, res, next) => {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use('/folders', require('./routes/folders.js'));
app.use('/files', require('./routes/files.js'));
app.use('/share', require('./routes/share.js'));
app.use('/', require('./routes/auth.js'));

module.exports = app;