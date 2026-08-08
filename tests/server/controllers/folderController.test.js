// Mock folderUtils BEFORE importing controller so destructured bindings use mocks
jest.mock('../../../lib/folderUtils.js', () => ({
  getFolderView: jest.fn().mockResolvedValue({
    folderId: 'folder-id',
    folderName: 'Test Folder',
    parentId: null,
    files: [],
    subfolders: [],
    breadcrumbs: [],
  }),
  buildFolderPaths: jest.fn().mockReturnValue([]),
  getUniqueFolderName: jest.fn().mockResolvedValue('Unique Name'),
  getUniqueFileName: jest.fn().mockResolvedValue('Unique File'),
}));

// Mock prisma BEFORE importing controller so destructured bindings use mocks
jest.mock('../../../lib/prisma.js', () => ({
  folder: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  file: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),   // needed by getUniqueFileName
    findMany: jest.fn(),    // needed by deleteFilesFromFolders
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

const {
  getAllFolders,
  createFolder,
  getDashboard,
  getFolderContents,
  renameFolder,
  moveItem,
  deleteItem,
} = require('../../../controllers/folderController');

const prisma = require('../../../lib/prisma.js');
const folderUtils = require('../../../lib/folderUtils.js');

// Mock res object
const mockRes = () => ({
  json: jest.fn(),
  status: jest.fn().mockReturnThis(),
  send: jest.fn(),
  render: jest.fn(),
  redirect: jest.fn(),
  flash: jest.fn(),
});

describe('folderController unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {}); // silence error logs
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    console.error.mockRestore();
  });

  test('getAllFolders returns folders for user', async () => {
    const req = { session: { user: { id: 'user-id' } } };
    const res = mockRes();

    prisma.folder.findMany.mockResolvedValue([{ id: 'f1', name: 'Test', parentId: null }]);

    await getAllFolders(req, res);

    expect(res.json).toHaveBeenCalledWith([{ id: 'f1', name: 'Test', parentId: null }]);
  });

  test('createFolder denies access if parent folder not owned by user', async () => {
    const req = { session: { user: { id: 'user-id' } }, body: { parentId: 'p1' } };
    const res = mockRes();

    prisma.folder.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'other-user' });

    await createFolder(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Access denied or invalid parent folder');
  });

  test('createFolder success', async () => {
    const req = { session: { user: { id: 'user-id' } }, body: {} };
    const res = mockRes();

    prisma.folder.create.mockResolvedValue({ id: 'new-id', name: 'Unique Name', parentId: null });

    await createFolder(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 'new-id', name: 'Unique Name', parentId: null });
  });

  test('renameFolder fails if missing id or newName', async () => {
    const req = { body: {}, flash: jest.fn() };
    const res = mockRes();

    await renameFolder(req, res);

    expect(res.redirect).toHaveBeenCalledWith('back');
  });

  test('renameFolder success', async () => {
    const req = { body: { id: 'f1', newName: 'Renamed' }, flash: jest.fn() };
    const res = mockRes();

    prisma.folder.findUnique.mockResolvedValue({ id: 'f1', parentId: null, ownerId: 'user-id' });
    prisma.folder.update.mockResolvedValue({ id: 'f1', name: 'Renamed' });

    await renameFolder(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, newName: 'Unique Name' });
  });

  test('moveItem returns 400 if missing fields', async () => {
    const req = { body: {}, session: { user: { id: 'user-id' } } };
    const res = mockRes();

    await moveItem(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing required fields' });
  });

  test('moveItem folder success', async () => {
    const req = { body: { itemId: 'f1', itemType: 'folder', destinationId: 'dest' }, session: { user: { id: 'user-id' } } };
    const res = mockRes();

    prisma.folder.findUnique
      .mockResolvedValueOnce({ id: 'dest', ownerId: 'user-id' }) // destination
      .mockResolvedValueOnce({ id: 'f1', ownerId: 'user-id', name: 'Folder' }); // source
    prisma.folder.findMany.mockResolvedValue([]);
    prisma.folder.update.mockResolvedValue({ id: 'f1', parentId: 'dest', name: 'Unique Name' });

    await moveItem(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('moveItem file success', async () => {
    const req = { body: { itemId: 'file1', itemType: 'file', destinationId: 'dest' }, session: { user: { id: 'user-id' } } };
    const res = mockRes();

    prisma.folder.findUnique.mockResolvedValue({ id: 'dest', ownerId: 'user-id' });
    prisma.file.findUnique.mockResolvedValue({ id: 'file1', ownerId: 'user-id', name: 'File' });
    prisma.file.findFirst.mockResolvedValue(null); // no collision
    prisma.file.update.mockResolvedValue({ id: 'file1', folderId: 'dest', name: 'Unique File' });

    await moveItem(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('deleteItem returns 400 for invalid type', async () => {
    const req = { params: { type: 'invalid', id: 'x' } };
    const res = mockRes();

    await deleteItem(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid item type' });
  });

  test('deleteItem folder success', async () => {
    const req = { params: { type: 'folder', id: 'f1' } };
    const res = mockRes();

    prisma.file.findMany.mockResolvedValue([]); // no files to delete
    prisma.folder.delete.mockResolvedValue({ id: 'f1' });

    await deleteItem(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  test('deleteItem file success', async () => {
    const req = { params: { type: 'file', id: 'file1' } };
    const res = mockRes();

    prisma.file.findUnique.mockResolvedValue({ id: 'file1', url: 'uploads/file.txt' });
    prisma.file.delete.mockResolvedValue({ id: 'file1' });

    await deleteItem(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  test('getDashboard returns 404 if no rootFolderId', async () => {
    const req = { session: { user: { id: 'user-id' } } };
    const res = mockRes();

    await getDashboard(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith('Root folder not found');
  });

  test('getFolderContents calls res.render', async () => {
    const req = { params: { id: 'folder-id' }, session: { user: { id: 'user-id' } } };
    const res = mockRes();

    prisma.folder.findMany.mockResolvedValue([]);
    prisma.folder.findUnique.mockResolvedValue({ id: 'folder-id', ownerId: 'user-id' });

    await getFolderContents(req, res);

    expect(res.render).toHaveBeenCalledWith(
      'folder',
      expect.objectContaining({
        folderId: 'folder-id',
        folderName: 'Test Folder',
        files: [],
        subfolders: [],
        breadcrumbs: [],
      })
    );
  });

  test('createFolder handles error', async () => {
    const req = { session: { user: { id: 'user-id' } }, body: {} };
    const res = mockRes();

    prisma.folder.create.mockRejectedValue(new Error('DB error'));

    await createFolder(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith('Something went wrong');
  });

  test('renameFolder handles error', async () => {
    const req = { body: { id: 'f1', newName: 'Renamed' }, flash: jest.fn() };
    const res = mockRes();

    prisma.folder.findUnique.mockResolvedValue({ id: 'f1', parentId: null, ownerId: 'user-id' });
    prisma.folder.update.mockRejectedValue(new Error('DB error'));

    await renameFolder(req, res);

    expect(req.flash).toHaveBeenCalledWith('error', 'Rename failed');
    expect(res.redirect).toHaveBeenCalledWith('back');
  });

  test('moveItem handles error', async () => {
    const req = { body: { itemId: 'f1', itemType: 'folder', destinationId: 'dest' }, session: { user: { id: 'user-id' } } };
    const res = mockRes();

    prisma.folder.findUnique
      .mockResolvedValueOnce({ id: 'dest', ownerId: 'user-id' }) // destination
      .mockResolvedValueOnce({ id: 'f1', ownerId: 'user-id', name: 'Folder' }); // source
    prisma.folder.findMany.mockResolvedValue([]);
    prisma.folder.update.mockRejectedValue(new Error('DB error')); // force catch

    await moveItem(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to move item' });
  });

  test('getFolderContents handles error', async () => {
    const req = { params: { id: 'folder-id' }, session: { user: { id: 'user-id' } } };
    const res = mockRes();

    folderUtils.getFolderView.mockRejectedValue(new Error('fail'));
    prisma.folder.findMany.mockResolvedValue([]);

    await getFolderContents(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith('Internal server error');
  });

  test('deleteItem handles error for folder', async () => {
    const req = { params: { type: 'folder', id: 'f1' } };
    const res = mockRes();

    prisma.folder.delete.mockRejectedValue(new Error('DB error'));

    await deleteItem(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to delete item' });
  });

  test('deleteItem handles error for file', async () => {
    const req = { params: { type: 'file', id: 'file1' } };
    const res = mockRes();

    prisma.file.findUnique.mockResolvedValue({ id: 'file1', url: 'uploads/file.txt' });
    prisma.file.delete.mockRejectedValue(new Error('DB error'));

    await deleteItem(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to delete item' });
  });
});