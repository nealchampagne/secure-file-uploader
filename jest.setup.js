// Polyfill TextEncoder/TextDecoder for libraries like @noble/hashes / cuid2 / Prisma
const { TextEncoder, TextDecoder } = require('util');
const { $disconnect } = require('./lib/prisma');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Ensure Prisma uses binary engine in tests (avoid edge/wasm issues)
process.env.PRISMA_CLIENT_ENGINE_TYPE = 'binary';

// Silence noisy console output in tests
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'info').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});

const createModelMock = (name) => {
  const records = [];
  let counter = 1;

  const createId = () => `${name}-${Date.now()}-${counter++}`;

  const matchesWhere = (record, where = {}) => {
    if (!where || typeof where !== 'object' || Array.isArray(where)) return true;

    return Object.entries(where).every(([key, value]) => {
      const recordValue = record[key];

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (Array.isArray(value.in)) return value.in.includes(recordValue);
        if (Object.prototype.hasOwnProperty.call(value, 'equals')) return recordValue === value.equals;
        if (Object.prototype.hasOwnProperty.call(value, 'not')) return recordValue !== value.not;
      }

      return recordValue === value;
    });
  };

  const cloneData = (data) => {
    if (!data || typeof data !== 'object') return data;
    return { ...data };
  };

  return {
    __records: records,
    upsert: jest.fn(async ({ where, update, create }) => {
      const existing = records.find((record) => matchesWhere(record, where));
      if (existing) {
        Object.assign(existing, update?.data ?? update ?? {});
        return existing;
      }

      const created = cloneData(create?.data ?? create ?? {});
      if (!created.id) created.id = createId();
      records.push(created);
      return created;
    }),
    findUnique: jest.fn(async ({ where }) => {
      return records.find((record) => matchesWhere(record, where)) ?? null;
    }),
    findFirst: jest.fn(async ({ where }) => {
      return records.find((record) => matchesWhere(record, where)) ?? null;
    }),
    findMany: jest.fn(async ({ where }) => {
      return records.filter((record) => matchesWhere(record, where));
    }),
    create: jest.fn(async ({ data }) => {
      const created = cloneData(data);
      if (!created.id) created.id = createId();
      records.push(created);
      return created;
    }),
    update: jest.fn(async ({ where, data }) => {
      const record = records.find((item) => matchesWhere(item, where));
      if (!record) return null;
      Object.assign(record, data);
      return record;
    }),
    delete: jest.fn(async ({ where }) => {
      const index = records.findIndex((record) => matchesWhere(record, where));
      if (index === -1) return null;
      return records.splice(index, 1)[0];
    }),
    deleteMany: jest.fn(async ({ where }) => {
      const toDelete = records.filter((record) => matchesWhere(record, where));
      toDelete.forEach((record) => {
        const index = records.indexOf(record);
        if (index >= 0) records.splice(index, 1);
      });
      return { count: toDelete.length };
    }),
  };
};

// Mock Prisma client with in-memory state
jest.mock(require.resolve('./lib/prisma.js'), () => {
  return {
    user: createModelMock('user'),
    folder: createModelMock('folder'),
    file: createModelMock('file'),
    sharedFolder: createModelMock('sharedFolder'),
    $disconnect: jest.fn().mockResolvedValue(), // stub so afterAll teardown works
  };
});

// Mock Supabase storage interface used by your app
jest.mock(require.resolve('./lib/supabase.js'), () => ({
  storage: {
    from: () => ({
      upload: jest.fn().mockResolvedValue({ data: { path: 'user/user-id/test.pdf' }, error: null }),
      download: jest.fn().mockResolvedValue({
        data: { arrayBuffer: async () => Buffer.from('hello world') },
        error: null,
      }),
      getPublicUrl: jest.fn().mockReturnValue({
        data: { publicUrl: 'http://example.com/test.pdf' },
        error: null,
      }),
    }),
  },
}));

// Mock file utilities used by your app
jest.mock(require.resolve('./lib/fileUtils.js'), () => ({
  getUniqueFileName: jest.fn().mockResolvedValue('test.pdf'),
  // add other fileUtils exports if needed
}));