const { sessionAuth, redirectIfAuthenticated } = require('../../../middleware/sessionAuth');

const mockRes = () => ({
  redirect: jest.fn(),
});
const mockNext = jest.fn();

describe('sessionAuth middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sets user and calls next when NODE_ENV is test', () => {
    process.env.NODE_ENV = 'test';
    const req = { session: {} };
    const res = mockRes();

    sessionAuth(req, res, mockNext);

    expect(req.session.user).toBeUndefined();
    expect(mockNext).toHaveBeenCalled();
  });

  test('redirects to / when no session user and not test env', () => {
    process.env.NODE_ENV = 'development';
    const req = { session: {} };
    const res = mockRes();

    sessionAuth(req, res, mockNext);

    expect(res.redirect).toHaveBeenCalledWith('/');
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('calls next when session user exists and not test env', () => {
    process.env.NODE_ENV = 'production';
    const req = { session: { user: { id: 'u1' } } };
    const res = mockRes();

    sessionAuth(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });
});

describe('redirectIfAuthenticated middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('redirects to /folders if user exists', () => {
    const req = { session: { user: { id: 'u1' } } };
    const res = mockRes();

    redirectIfAuthenticated(req, res, mockNext);

    expect(res.redirect).toHaveBeenCalledWith('/folders');
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('calls next if no user', () => {
    const req = { session: {} };
    const res = mockRes();

    redirectIfAuthenticated(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });
});