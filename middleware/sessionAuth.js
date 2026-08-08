const prisma = require('../lib/prisma.js');

const sessionAuth = (req, res, next) => {
  if (process.env.NODE_ENV === 'test') {
    return next();
  }
  if (!req.session.user) return res.redirect('/');
  next();
};

const redirectIfAuthenticated = (req, res, next) => {
  if (req.session.user) {
    return res.redirect('/folders');
  }
  next();
};

module.exports = {
  sessionAuth,
  redirectIfAuthenticated,
};