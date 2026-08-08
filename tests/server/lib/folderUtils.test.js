const {
  getUniqueFolderName,
  buildFolderPaths,
  getFolderView,
} = require('../../../lib/folderUtils');

const prisma = require('../../../lib/prisma.js');

describe('folderUtils unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getUniqueFolderName returns original name if no conflict', async () => {
    prisma.folder.findFirst = jest.fn().mockResolvedValue(null);

    const name = await getUniqueFolderName('parent-id', 'user-id', 'New Folder');
    expect(name).toBe('New Folder');
  });

  test('getUniqueFolderName appends counter if conflict exists', async () => {
    // First call returns a folder (conflict), second call returns null
    prisma.folder.findFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: 'f1' })
      .mockResolvedValueOnce(null);

    const name = await getUniqueFolderName('parent-id', 'user-id', 'New Folder');
    expect(name).toBe('New Folder (1)');
  });

  test('buildFolderPaths builds correct paths', () => {
    const folders = [
      { id: 'root', name: 'Root', parentId: null },
      { id: 'child', name: 'Child', parentId: 'root' },
      { id: 'grandchild', name: 'Grandchild', parentId: 'child' },
    ];

    const paths = buildFolderPaths(folders);
    const childPath = paths.find(p => p.id === 'child').path;
    const grandchildPath = paths.find(p => p.id === 'grandchild').path;

    expect(childPath).toBe('Root > Child');
    expect(grandchildPath).toBe('Root > Child > Grandchild');
  });

  test('getFolderView throws if folder not found', async () => {
    prisma.folder.findUnique = jest.fn().mockResolvedValue(null);

    await expect(getFolderView('folder-id', 'user-id')).rejects.toThrow(
      'Folder not found or access denied'
    );
  });

  test('getFolderView returns viewData for valid folder', async () => {
    prisma.folder.findUnique = jest.fn().mockResolvedValue({
      id: 'folder-id',
      name: 'Test Folder',
      ownerId: 'user-id',
      parentId: null,
      parent: null,
    });

    prisma.folder.findMany = jest.fn().mockResolvedValue([
      { id: 'sub1', name: 'Sub', ownerId: 'user-id', folderId: 'folder-id' }
    ]);

    prisma.file.findMany = jest.fn().mockResolvedValue([
      { id: 'file1', name: 'File', ownerId: 'user-id', folderId: 'folder-id' }
    ]);

    prisma.folder.findFirst = jest.fn().mockResolvedValue({ id: 'root-id' });

    const viewData = await getFolderView('folder-id', 'user-id');
    expect(viewData.folderId).toBe('folder-id');
    expect(viewData.folderName).toBe('Test Folder');
    expect(viewData.subfolders).toEqual(
      expect.arrayContaining([{ id: 'sub1', name: 'Sub', ownerId: 'user-id', folderId: 'folder-id' }])
    );
    expect(viewData.files).toEqual(
      expect.arrayContaining([{ id: 'file1', name: 'File', ownerId: 'user-id', folderId: 'folder-id'}])
    );
    expect(viewData.breadcrumbs[0]).toEqual({ id: 'root-id', name: 'Home' });
  });
});
