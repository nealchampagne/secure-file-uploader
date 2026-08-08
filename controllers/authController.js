const prisma = require('../lib/prisma.js');
const passport = require('passport');
const bcrypt = require('bcrypt');

const getAuthPage = (req, res) => {
  if (req.session.user) {
    return res.redirect('/folders');
  }
  res.render('auth', {
    error: null,
    email: '',
    expired: req.query.expired,
    logout: req.query.logout,
  });
};

const postLogin = async (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return res.render('auth', {
        error: info.message,
        email: req.body.email,
        expired: req.query?.expired || false,
        logout: req.query?.logout || false
      });
    }

    req.logIn(user, async (err) => {
      if (err) return next(err);

      // Find or create root folder
      let rootFolder = await prisma.folder.findFirst({
        where: {
          ownerId: user.id,
          parentId: null
        }
      });

      if (!rootFolder) {
        rootFolder = await prisma.folder.create({
          data: {
            name: 'Root',
            ownerId: user.id,
            parentId: null
          }
        });
      }

      // Attach user context to session
      req.session.user = {
        id: user.id,
        email: user.email,
        rootFolderId: rootFolder.id
      };

      // Save session and redirect
      req.session.save(() => {
        res.redirect('/folders');
      });
    });
  })(req, res, next);
};

const logoutUser = (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err);
      return res.redirect('/folders'); // fallback if session can't be destroyed
    }
    res.clearCookie('connect.sid'); // optional: clears the session cookie
    res.redirect('/?logout=true');
  });
};

const getSignupPage = (req, res) => {
  if (req.session.user) {
    return res.redirect('/folders');
  }
  res.render('signup');
};

const postNewUser = async (req, res) => {
  const { email, password, confirmPassword } = req.body;

  if (password !== confirmPassword) {
    return res.render('signup', {
      error: 'Passwords do not match.',
      email,
    });
  }

  if (password.length < 8) {
    return res.render('signup', {
      error: 'Password must be at least 8 characters.',
      email
    });
  }

  try {
    const normalizedEmail = email.toLowerCase();

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.render('signup', { error: 'Email already in use.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: passwordHash,
      },
    });

    const rootFolder = await prisma.folder.create({
      data: {
        name: 'Root',
        ownerId: newUser.id,
        parentId: null,
      },
    });

    req.session.user = {
      id: newUser.id,
      email: newUser.email,
      rootFolderId: rootFolder.id,
    };

    req.session.save(() => {
      res.redirect('/folders');
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).render('signup', { error: 'Something went wrong. Try again.' });
  };
};

module.exports = {
  getAuthPage,
  postLogin,
  getSignupPage,
  postNewUser,
  logoutUser,
};