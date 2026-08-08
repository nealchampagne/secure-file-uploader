// Mock prisma BEFORE importing controller
jest.mock('../../../lib/prisma.js', () => ({
  folder: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
}));

// Mock passport BEFORE importing controller
jest.mock('passport', () => ({
  authenticate: jest.fn(),
}));

// Mock bcrypt BEFORE importing controller
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

const prisma = require('../../../lib/prisma.js');
const passport = require('passport');
const bcrypt = require('bcrypt');
const {
  getAuthPage,
  postLogin,
  logoutUser,
  getSignupPage,
  postNewUser,
} = require('../../../controllers/authController');

// Mock res object
const mockRes = () => ({
  render: jest.fn(),
  redirect: jest.fn(),
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
  clearCookie: jest.fn(), // needed for logoutUser
});

describe('authController unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {}); // silence console.error
  });
  afterEach(() => {
    console.error.mockRestore();
  });

  test('getAuthPage redirects if session user exists', () => {
    const req = { session: { user: { id: 'u1' } }, query: {} };
    const res = mockRes();

    getAuthPage(req, res);

    expect(res.redirect).toHaveBeenCalledWith('/folders');
  });

  test('getAuthPage renders auth if no session user', () => {
    const req = { session: {}, query: {} };
    const res = mockRes();

    getAuthPage(req, res);

    expect(res.render).toHaveBeenCalledWith('auth', expect.objectContaining({ error: null }));
  });

  test('postLogin renders auth on failed login', async () => {
    const req = { body: { email: 'test@example.com' }, query: {}, session: {} };
    const res = mockRes();
    const next = jest.fn();

    passport.authenticate.mockImplementation((strategy, cb) => () => cb(null, false, { message: 'Invalid' }));

    await postLogin(req, res, next);

    expect(res.render).toHaveBeenCalledWith('auth', expect.objectContaining({ error: 'Invalid' }));
  });

  test('postLogin success creates root folder if missing', async () => {
  const req = {
    body: { email: 'test@example.com' },
    query: {},
    session: {},
    logIn: (user, cb) => cb(null), // simulate successful login
  };
  const res = mockRes();
  const next = jest.fn();

  const user = { id: 'u1', email: 'test@example.com' };

  // Make passport.authenticate call the callback with a user
  passport.authenticate.mockImplementation((strategy, cb) => {
    return (req, res, next) => cb(null, user, {});
  });

  prisma.folder.findFirst.mockResolvedValue(null);
  prisma.folder.create.mockResolvedValue({ id: 'root-id', name: 'Root' });

  // Ensure session.save calls its callback synchronously
  req.session.save = (cb) => cb();

  await postLogin(req, res, next);

  // Wait one tick so the session.save callback runs
  await new Promise(process.nextTick);

  expect(res.redirect).toHaveBeenCalledWith('/folders');
  expect(req.session.user).toEqual(expect.objectContaining({ id: 'u1', rootFolderId: 'root-id' }));
});

  test('logoutUser clears session and redirects', () => {
    const req = {
      session: { destroy: (cb) => cb(null) },
      clearCookie: jest.fn(),
    };
    const res = mockRes();

    logoutUser(req, res);

    expect(res.clearCookie).toHaveBeenCalledWith('connect.sid');
    expect(res.redirect).toHaveBeenCalledWith('/?logout=true');
  });

  test('getSignupPage redirects if session user exists', () => {
    const req = { session: { user: { id: 'u1' } } };
    const res = mockRes();

    getSignupPage(req, res);

    expect(res.redirect).toHaveBeenCalledWith('/folders');
  });

  test('getSignupPage renders signup if no session user', () => {
    const req = { session: {} };
    const res = mockRes();

    getSignupPage(req, res);

    expect(res.render).toHaveBeenCalledWith('signup');
  });

  test('postNewUser rejects mismatched passwords', async () => {
    const req = { body: { email: 'a@b.com', password: '12345678', confirmPassword: '87654321' }, session: {} };
    const res = mockRes();

    await postNewUser(req, res);

    expect(res.render).toHaveBeenCalledWith('signup', expect.objectContaining({ error: 'Passwords do not match.' }));
  });

  test('postNewUser rejects short password', async () => {
    const req = { body: { email: 'a@b.com', password: 'short', confirmPassword: 'short' }, session: {} };
    const res = mockRes();

    await postNewUser(req, res);

    expect(res.render).toHaveBeenCalledWith('signup', expect.objectContaining({ error: 'Password must be at least 8 characters.' }));
  });

  test('postNewUser rejects existing user', async () => {
    const req = { body: { email: 'a@b.com', password: '12345678', confirmPassword: '12345678' }, session: {} };
    const res = mockRes();

    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com' });

    await postNewUser(req, res);

    expect(res.render).toHaveBeenCalledWith('signup', expect.objectContaining({ error: 'Email already in use.' }));
  });

  test('postNewUser success creates user and root folder', async () => {
    const req = { body: { email: 'a@b.com', password: '12345678', confirmPassword: '12345678' }, session: {} };
    const res = mockRes();

    prisma.user.findUnique.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue('hashed');
    prisma.user.create.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
    prisma.folder.create.mockResolvedValue({ id: 'root-id', name: 'Root' });

    req.session.save = (cb) => cb();

    await postNewUser(req, res);

    expect(res.redirect).toHaveBeenCalledWith('/folders');
    expect(req.session.user).toEqual(expect.objectContaining({ id: 'u1', rootFolderId: 'root-id' }));
  });

  test('postNewUser handles error', async () => {
    const req = { body: { email: 'a@b.com', password: '12345678', confirmPassword: '12345678' }, session: {} };
    const res = mockRes();

    prisma.user.findUnique.mockRejectedValue(new Error('DB error'));

    await postNewUser(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.render).toHaveBeenCalledWith('signup', expect.objectContaining({ error: 'Something went wrong. Try again.' }));
  });
});