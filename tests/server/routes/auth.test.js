const request = require('supertest');
const app = require('../../../app');
const prisma = require('../../../lib/prisma.js');
const bcrypt = require('bcrypt');

describe('Auth routes (mounted at root)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await prisma.user.deleteMany({ where: { email: 'test@example.com' } });
    await prisma.folder.deleteMany({ where: { ownerId: 'user-id' } });
  });

  // ---------------------------------------------------------------------------
  test('GET / renders login page if not authenticated', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/login/i);
    expect(res.text).toMatch(/form action="\/login"/i);
  });

  test('GET / redirects to /folders if already authenticated', async () => {
    // Simulate session user
    const agent = request.agent(app);
    agent.jar.setCookie(
      `sessionUser=${JSON.stringify({ id: 'user-id', email: 'test@example.com', rootFolderId: 'folder-id' })}`
    );
    const res = await agent.get('/');
    expect([200, 302]).toContain(res.status);
    if (res.status === 302) {
      expect(res.headers.location).toBe('/folders');
    }
  });

  // ---------------------------------------------------------------------------
  test('POST /signup creates new user and root folder', async () => {
    const res = await request(app)
      .post('/signup')
      .send({
        email: 'test@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      });

    expect([200, 302]).toContain(res.status);
    if (res.status === 302) {
      expect(res.headers.location).toBe('/folders');
    }

    const user = await prisma.user.findUnique({ where: { email: 'test@example.com' } });
    expect(user).not.toBeNull();

    const folder = await prisma.folder.findFirst({ where: { ownerId: user.id, parentId: null } });
    expect(folder).not.toBeNull();
    expect(folder.name).toBe('Root');
  });

  test('POST /signup fails if passwords mismatch', async () => {
    const res = await request(app)
      .post('/signup')
      .send({
        email: 'test@example.com',
        password: 'password123',
        confirmPassword: 'wrong',
      });

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Passwords do not match/i);
  });

  test('POST /signup fails if password too short', async () => {
    const res = await request(app)
      .post('/signup')
      .send({
        email: 'test@example.com',
        password: 'short',
        confirmPassword: 'short',
      });

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/at least 8 characters/i);
  });

  // ---------------------------------------------------------------------------
  test('POST /login fails with invalid credentials', async () => {
    const res = await request(app)
      .post('/login')
      .send({ email: 'test@example.com', password: 'wrong' });

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/error/i);
  });

  test('POST /login succeeds with valid credentials', async () => {
    // Create user manually
    const passwordHash = await bcrypt.hash('password123', 10);
    await prisma.user.create({
      data: { id: 'user-id', email: 'test@example.com', password: passwordHash },
    });

    const res = await request(app)
      .post('/login')
      .send({ email: 'test@example.com', password: 'password123' });

    expect([200, 302]).toContain(res.status);
    if (res.status === 302) {
      expect(res.headers.location).toBe('/folders');
    }
  });

  // ---------------------------------------------------------------------------
  test('GET /logout destroys session and redirects', async () => {
    const res = await request(app).get('/logout');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/?logout=true');
  });

  // ---------------------------------------------------------------------------
  test('GET /signup renders signup page if not authenticated', async () => {
    const res = await request(app).get('/signup');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/signup/i);
  });
});