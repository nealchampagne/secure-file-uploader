const request = require('supertest');
const app = require('../../../app');
const prisma = require('../../../lib/prisma.js');

// Helper to inject session user into requests
const withSession = (req, userId = 'test-user') => {
  req.set('test-user', userId);
  return req;
};

describe('Files routes', () => {
  beforeEach(async () => {
    jest.clearAllMocks();

    prisma.file.findUnique = jest.fn().mockResolvedValue({
      id: 'test-id',
      name: 'test.txt',
      size: 1024,
      mimeType: 'text/plain',
      path: 'user/test-user/test.txt',
      url: 'http://example.com/test.txt',
      ownerId: 'test-user',
      folderId: 'folder-id',
      createdAt: new Date(),
      user: { id: 'test-user', email: 'test@example.com' },
      folder: { id: 'folder-id', name: 'Test Folder', ownerId: 'test-user' }
    });

    await prisma.user.upsert({
      where: { id: 'test-user' },
      update: { email: 'test@example.com', password: 'secret' },
      create: { id: 'test-user', email: 'test@example.com', password: 'secret' },
    });

    await prisma.folder.upsert({
      where: { id: 'folder-id' },
      update: { name: 'Test Folder', ownerId: 'test-user' },
      create: { id: 'folder-id', name: 'Test Folder', ownerId: 'test-user' },
    });

    await prisma.file.upsert({
      where: { id: 'test-id' },
      update: {
        name: 'test.txt',
        user: 'test-user',
        size: 1024,
        mimeType: 'text/plain',
        path: 'user/test-user/test.txt',
        url: 'http://example.com/test.txt',
        folderId: 'folder-id',
        ownerId: 'test-user',
        createdAt: new Date(),
      },
      create: {
        id: 'test-id',
        name: 'test.txt',
        user: 'test-user',
        size: 1024,
        mimeType: 'text/plain',
        path: 'user/test-user/test.txt',
        url: 'http://example.com/test.txt',
        folderId: 'folder-id',
        ownerId: 'test-user',
        createdAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('POST /files/upload saves file and redirects to folder', async () => {
    const res = await withSession(
      request(app)
        .post('/files/upload')
        .field('folderId', 'folder-id')
        .field('ownerId', 'test-user')
        .attach('file', Buffer.from('hello world'), 'test.pdf')
    );

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/folders/folder-id');
  });

  test('GET /files/:id renders file details view', async () => {
    const res = await withSession(request(app).get('/files/test-id'));

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/File Details/);
    expect(res.text).toMatch(/test.txt/);
    expect(res.text).toMatch(/Test Folder/);
    expect(res.text).toMatch(/test@example.com/);
  });

  test('GET /files/:id/download returns file buffer', async () => {
    const res = await withSession(request(app).get('/files/test-id/download'));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/plain');
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.text).toContain('hello world');
  });
});