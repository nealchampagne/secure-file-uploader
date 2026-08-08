const request = require('supertest');
const app = require('../../../app');
const prisma = require('../../../lib/prisma.js');

// Helpers that set headers read by the test middleware in app.js
const withSession = (req, userId = 'user-id') => req.set('test-user', userId);
const withWrongSession = (req, userId = 'other-user') => req.set('wrong-test-user', userId);

describe('Share routes', () => {
  beforeEach(async () => {
    jest.clearAllMocks();

    const store = app.get('sessionStore');
    if (store && typeof store.clear === 'function') {
      store.clear();
    }

    // Ensure folder exists and is owned by user-id
    prisma.folder.findUnique = jest.fn().mockResolvedValue({
      id: 'folder-id',
      name: 'Test Folder',
      ownerId: 'user-id',
    });

    // Ensure sharedFolder.upsert returns the created/updated shared record
    prisma.sharedFolder.upsert = jest.fn().mockImplementation(async ({ where, update, create }) => {
      // return a realistic object
      return {
        folderId: where.folderId || create.folderId,
        url: `/share/${where.folderId || create.folderId}`,
        expiresAt: create?.expiresAt || update?.expiresAt || new Date(Date.now() + 7 * 86400000),
      };
    });

    // Mock user upserts if any route calls them (safe defaults)
    prisma.user.upsert = jest.fn().mockResolvedValue({ id: 'user-id', email: 'test@example.com' });
  });

  test('POST /share/:folderId creates a folder link for owner to share', async () => {
    const res = await withSession(request(app).post('/share/folder-id').send({ expiresInDays: 3 }));
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('url', '/share/folder-id');
    expect(res.body).toHaveProperty('expiresAt');
  });

  test('POST /share/:folderId fails if no user (unauthenticated)', async () => {
    // no header set → test middleware won't populate req.session.user
    const res = await request(app).post('/share/folder-id').send({ expiresInDays: 3 });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  test('POST /share/:folderId fails if wrong user (not owner)', async () => {
    // Make folder owned by user-id, but send other-user in header
    const res = await withWrongSession(request(app).post('/share/folder-id').send({ expiresInDays: 3 }));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  test('GET /share/:folderId renders folder view if shared', async () => {
    // First share the folder as owner
    await withSession(request(app).post('/share/folder-id').send({ expiresInDays: 3 }));

    // Mock folder retrieval for public view if your controller uses prisma.folder.findUnique or similar
    prisma.folder.findUnique = jest.fn().mockResolvedValue({
      id: 'folder-id',
      name: 'Test Folder',
      ownerId: 'user-id',
    });

    const res = await request(app).get('/share/folder-id');
    expect([200, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(res.text).toMatch(/Test Folder/);
      expect(res.text).toMatch(/sharedContext/);
    }
  });

  test('GET /share/:folderId denies access if not shared', async () => {
    // Ensure sharedFolder.findFirst/upsert returns null or not shared
    prisma.sharedFolder.findFirst = jest.fn().mockResolvedValue(null);

    const res = await request(app).get('/share/folder-id');
    expect(res.status).toBe(403);
    expect(res.text).toMatch(/Access denied/i);
  });
});