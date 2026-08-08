// Mock prisma BEFORE importing controller
jest.mock('../../../lib/prisma.js', () => ({
  file: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  folder: {
    findUnique: jest.fn(),
  },
}));

// Mock supabase BEFORE importing controller
const mockDownload = jest.fn();
const mockUpload = jest.fn();
const mockGetPublicUrl = jest.fn();

jest.mock('../../../lib/supabase.js', () => ({
  storage: {
    from: jest.fn(() => ({
      download: mockDownload,
      upload: mockUpload,
      getPublicUrl: mockGetPublicUrl,
    })),
  },
}));

// Mock fileUtils BEFORE importing controller
jest.mock('../../../lib/fileUtils.js', () => ({
  getUniqueFileName: jest.fn(),
}));

const prisma = require('../../../lib/prisma.js');
const supabase = require('../../../lib/supabase.js');
const { getUniqueFileName } = require('../../../lib/fileUtils.js');
const {
  viewFileDetails,
  downloadFile,
  uploadFile,
  renameFile,
} = require('../../../controllers/fileController');

// Mock res object
const mockRes = () => ({
  render: jest.fn(),
  redirect: jest.fn(),
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
  send: jest.fn(),
  setHeader: jest.fn(),
});

describe('fileController unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    console.error.mockRestore();
  });

  describe('viewFileDetails', () => {
    test('returns 4043 if file not owned by user', async () => {
      const req = { params: { id: 'f1' }, session: { user: { id: 'u1' } } };
      const res = mockRes();

      prisma.file.findUnique.mockResolvedValue({ id: 'f1', ownerId: 'other' });

      await viewFileDetails(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith('Access denied');
    });

    test('renders fileDetails on success', async () => {
      const req = { params: { id: 'f1' }, session: { user: { id: 'u1' } } };
      const res = mockRes();

      prisma.file.findUnique.mockResolvedValue({ id: 'f1', ownerId: 'u1', name: 'File' });

      await viewFileDetails(req, res);

      expect(res.render).toHaveBeenCalledWith('fileDetails', { file: expect.objectContaining({ id: 'f1' }) });
    });
  });

  describe('downloadFile', () => {
    test('returns 404 if file not found', async () => {
      const req = { params: { id: 'f1' } };
      const res = mockRes();

      prisma.file.findUnique.mockResolvedValue(null);

      await downloadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'File not found' });
    });

    test('returns 500 if supabase download fails', async () => {
      const req = { params: { id: 'f1' } };
      const res = mockRes();

      prisma.file.findUnique.mockResolvedValue({ id: 'f1', path: 'path', mimeType: 'text/plain', name: 'file.txt' });
      mockDownload.mockResolvedValue({ data: null, error: 'err' });

      await downloadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to download file from storage' });
    });

    test('sends buffer on success', async () => {
      const req = { params: { id: 'f1' } };
      const res = mockRes();

      const fakeData = { arrayBuffer: async () => new ArrayBuffer(4) };
      prisma.file.findUnique.mockResolvedValue({ id: 'f1', path: 'path', mimeType: 'text/plain', name: 'file.txt' });
      mockDownload.mockResolvedValue({ data: fakeData, error: null });

      await downloadFile(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="file.txt"');
      expect(res.send).toHaveBeenCalled();
    });
  });

  describe('uploadFile', () => {
    test('returns 400 if missing fields', async () => {
      const req = { body: {}, file: null };
      const res = mockRes();

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing required fields' });
    });

    test('successfully uploads file', async () => {
      const req = {
        body: { folderId: 'f1', ownerId: 'u1' },
        file: { originalname: 'file.txt', buffer: Buffer.from('data'), mimetype: 'text/plain', size: 10 },
      };
      const res = mockRes();

      getUniqueFileName.mockResolvedValue('file.txt');
      mockUpload.mockResolvedValue({ data: { path: 'path' }, error: null });
      mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'url' }, error: null });
      prisma.file.create.mockResolvedValue({ id: 'f1' });

      await uploadFile(req, res);

      expect(res.redirect).toHaveBeenCalledWith('/folders/f1');
    });
  });

  describe('renameFile', () => {
    test('returns 400 if missing id or newName', async () => {
      const req = { body: {} };
      const res = mockRes();

      await renameFile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing file ID or new name' });
    });

    test('returns 404 if file not found', async () => {
      const req = { body: { id: 'f1', newName: 'new.txt' } };
      const res = mockRes();

      prisma.file.findUnique.mockResolvedValue(null);

      await renameFile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'File not found' });
    });

    test('successfully renames file', async () => {
      const req = { body: { id: 'f1', newName: 'new.txt' } };
      const res = mockRes();

      prisma.file.findUnique.mockResolvedValue({ id: 'f1', name: 'old.txt', folderId: 'f1', ownerId: 'u1' });
      getUniqueFileName.mockResolvedValue('new.txt');
      prisma.file.update.mockResolvedValue({ id: 'f1', name: 'new.txt' });

      await renameFile(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, newName: 'new.txt' });
    });
  });
});
