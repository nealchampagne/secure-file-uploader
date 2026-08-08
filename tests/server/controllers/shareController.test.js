// Mock prisma BEFORE importing controller so destructured bindings use mocks
jest.mock('../../../lib/prisma.js', () => ({
  folder: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  file: {
    findMany: jest.fn(),
  },
  sharedFolder: {
    upsert: jest.fn(),
    findFirst: jest.fn(),
  },
}));

const prisma = require('../../../lib/prisma.js');
const { shareFolder, getSharedFolderById } = require('../../../controllers/shareController');

// Mock res object
const mockRes = () => ({
  json: jest.fn(),
  status: jest.fn().mockReturnThis(),
  send: jest.fn(),
  render: jest.fn(),
});

describe('shareController unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('shareFolder', () => {
    test('returns 401 if no user session', async () => {
      const req = { params: { folderId: 'f1' }, body: {}, session: {} };
      const res = mockRes();

      await shareFolder(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    test('returns 403 if folder not owned by user', async () => {
      const req = { params: { folderId: 'f1' }, body: {}, session: { user: { id: 'user-id' } } };
      const res = mockRes();

      prisma.folder.findUnique.mockResolvedValue({ id: 'f1', ownerId: 'other-user' });

      await shareFolder(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
    });

    test('successfully shares folder', async () => {
      const req = { params: { folderId: 'f1' }, body: { expiresInDays: 1 }, session: { user: { id: 'user-id' } } };
      const res = mockRes();

      prisma.folder.findUnique.mockResolvedValue({ id: 'f1', ownerId: 'user-id' });
      prisma.sharedFolder.upsert.mockResolvedValue({ url: '/share/f1', expiresAt: new Date(Date.now() + 86400000) });

      await shareFolder(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ url: '/share/f1' }));
    });
  });

  describe('getSharedFolderById', () => {
    test('denies access if no active share found', async () => {
      const req = { params: { folderId: 'f1' } };
      const res = mockRes();

      prisma.sharedFolder.findFirst.mockResolvedValue(null);
      prisma.folder.findUnique.mockResolvedValue(null);

      await getSharedFolderById(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.render).toHaveBeenCalledWith('error', { message: 'Access denied.' });
    });

    test('denies access if share expired', async () => {
      const req = { params: { folderId: 'f1' } };
      const res = mockRes();

      const expiredDate = new Date(Date.now() - 1000);
      prisma.sharedFolder.findFirst.mockResolvedValue({ id: 's1', folderId: 'f1', expiresAt: expiredDate });
      prisma.folder.findUnique.mockResolvedValue({ id: 'f1', parentId: null });

      await getSharedFolderById(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.render).toHaveBeenCalledWith('error', { message: 'Share expired.' });
    });

    test('renders shared folder view on success', async () => {
      const req = { params: { folderId: 'f1' } };
      const res = mockRes();

      const futureDate = new Date(Date.now() + 10000);
      prisma.sharedFolder.findFirst.mockResolvedValue({ id: 's1', folderId: 'f1', expiresAt: futureDate });
      prisma.folder.findUnique.mockResolvedValue({ id: 'f1', name: 'Folder', parentId: null });
      prisma.file.findMany.mockResolvedValue([{ id: 'file1', name: 'File' }]);
      prisma.folder.findMany.mockResolvedValue([]);

      await getSharedFolderById(req, res);

      expect(res.render).toHaveBeenCalledWith(
        'folder',
        expect.objectContaining({
          folderId: 'f1',
          folderName: 'Folder',
          files: [{ id: 'file1', name: 'File' }],
          subfolders: [],
          sharedContext: true,
          sharedFolderId: 's1',
        })
      );
    });
  });
});