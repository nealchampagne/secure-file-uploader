const passport = require('passport');
const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma.js');
require('../auth.js');

describe('auth.js Passport strategy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('fails when user not found', async () => {
    prisma.user.findUnique = jest.fn().mockResolvedValue(null);
    const strategy = passport._strategies.local;

    const done = jest.fn();
    await strategy._verify('test@example.com', 'password', done);

    expect(done).toHaveBeenCalledWith(null, false, { message: 'Incorrect email or password.' });
  });

  test('fails when password invalid', async () => {
    prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'u1', password: 'hashed' });
    bcrypt.compare = jest.fn().mockResolvedValue(false);
    const strategy = passport._strategies.local;

    const done = jest.fn();
    await strategy._verify('test@example.com', 'wrong', done);

    expect(done).toHaveBeenCalledWith(null, false, { message: 'Incorrect email or password.' });
  });

  test('succeeds when password valid', async () => {
    const user = { id: 'u1', email: 'test@example.com', password: 'hashed' };
    prisma.user.findUnique = jest.fn().mockResolvedValue(user);
    bcrypt.compare = jest.fn().mockResolvedValue(true);
    const strategy = passport._strategies.local;

    const done = jest.fn();
    await strategy._verify('test@example.com', 'password', done);

    expect(done).toHaveBeenCalledWith(null, user);
  });

  test('handles error thrown by prisma', async () => {
    prisma.user.findUnique = jest.fn().mockRejectedValue(new Error('DB error'));
    const strategy = passport._strategies.local;

    const done = jest.fn();
    await strategy._verify('test@example.com', 'password', done);

    expect(done).toHaveBeenCalledWith(expect.any(Error));
  });

  test('serializeUser stores user id', () => {
    const user = { id: 'u1' };
    const done = jest.fn();
    passport.serializeUser(user, done);
    expect(done).toHaveBeenCalledWith(null, 'u1');
  });

  test('deserializeUser returns user', async () => {
    const user = { id: 'u1', email: 'test@example.com' };
    prisma.user.findUnique = jest.fn().mockResolvedValue(user);
    const done = jest.fn();

    await passport.deserializeUser('u1', done);
    expect(done).toHaveBeenCalledWith(null, user);
  });

  test('deserializeUser handles error', async () => {
    prisma.user.findUnique = jest.fn().mockRejectedValue(new Error('DB error'));
    const done = jest.fn();

    await passport.deserializeUser('u1', done);
    expect(done).toHaveBeenCalledWith(expect.any(Error), undefined);
  });
});