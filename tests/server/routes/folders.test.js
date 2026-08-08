const request = require('supertest');
const app = require('../../../app');
const prisma = require('../../../lib/prisma.js');

// Helper to inject session user into requests
const withSession = (req, userId = 'test-user') => {
  req.set('test-user', userId);
  return req;
}

describe('Folders routes (API behavior)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();

    // Create test user (no rootFolderId in schema)
    await prisma.user.upsert({
      where: { id: 'test-user' },
      update: { email: 'test@example.com', password: 'secret' },
      create: { id: 'test-user', email: 'test-user@example.com', password: 'secret' },
    });

    await prisma.user.upsert({
      where: { id: 'wrong-test-user' },
      update: { email: 'test@example.com', password: 'secret' },
      create: { id: 'wrong-test-user', email: 'wrong-test-user@example.com', password: 'secret' },
    })

    // Create root folder
    await prisma.folder.upsert({
      where: { id: 'folder-id' },
      update: { name: 'Test Folder', ownerId: 'test-user', parentId: null },
      create: { id: 'folder-id', name: 'Test Folder', ownerId: 'test-user', parentId: null },
    });

    // Create a file inside folder
    await prisma.file.upsert({
      where: { id: 'file-id' },
      update: {
        name: 'test.txt',
        size: 1024,
        mimeType: 'text/plain',
        path: 'user/test-user/test.txt',
        url: 'http://example.com/test.txt',
        folderId: 'folder-id',
        ownerId: 'test-user',
      },
      create: {
        id: 'file-id',
        name: 'test.txt',
        size: 1024,
        mimeType: 'text/plain',
        path: 'user/test-user/test.txt',
        url: 'http://example.com/test.txt',
        folderId: 'folder-id',
        ownerId: 'test-user',
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------
  test('GET /folders/tree returns JSON list of folders', async () => {
    const res = await withSession(request(app).get('/folders/tree'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'folder-id', name: 'Test Folder' }),
      ])
    );
  });

  test('GET /folders/:id renders folder view (HTML)', async () => {
    const res = await withSession(request(app).get('/folders/folder-id'));
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Test Folder/);
    expect(res.text).toMatch(/test.txt/);
  });

  test('POST /folders/create returns 201 + JSON', async () => {
    const res = await withSession(request(app).post('/folders/create').send({ parentId: null }));
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('name');
  });

  test('POST /folders/move moves a file and returns JSON', async () => {
    const res = await withSession(
      request(app).post('/folders/move').send({
        itemId: 'file-id',
        itemType: 'file',
        destinationId: 'folder-id',
      })
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('originalName');
    expect(res.body).toHaveProperty('finalName');
  });

  test('POST /folders/rename renames folder and returns JSON', async () => {
    const res = await withSession(
      request(app).post('/folders/rename').send({
        type: 'folder',
        id: 'folder-id',
        newName: 'Renamed Folder',
      })
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('newName', 'Renamed Folder');
  });

  test('POST /folders/rename renames file and returns JSON', async () => {
    const res = await withSession(
      request(app).post('/folders/rename').send({
        type: 'file',
        id: 'file-id',
        newName: 'renamed.txt',
      })
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('newName');
  });

  test('POST /folders/rename invalid type redirects back', async () => {
    const res = await withSession(
      request(app).post('/folders/rename').send({
        type: 'invalid',
        id: 'file-id',
        newName: 'oops',
      })
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('back');
  });

  test('DELETE /folders/delete/folder/:id deletes folder and returns JSON', async () => {
    const res = await withSession(request(app).delete('/folders/delete/folder/folder-id'));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });

  test('GET /folders renders dashboard view', async () => {
    const res = await withSession(request(app).get('/folders'));
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Test Folder/);
  });

  test('GET /folders/:id returns 403 for wrong user', async () => {
    const res = await request(app).get('/folders/folder-id').set('wrong-test-user', 'wrong-test-user');
    expect(res.status).toBe(403);
  });

  test('GET /folders/:id redirects to login when not logged in', async () => {
    const res = await request(app).get('/folders/folder-id');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch("/");
  });
});