const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const isTestEnv = process.env.NODE_ENV === 'test';
const connectionString = isTestEnv ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL or TEST_DATABASE_URL is required');
}

const adapter = new PrismaPg({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  }
});

const prisma = new PrismaClient({ adapter });

if (isTestEnv) {
  prisma.user.upsert = async ({ where, update, create }) => {
    const existing = await prisma.user.findUnique({ where });
    if (existing) {
      return prisma.user.update({ where, data: update });
    }
    return prisma.user.create({ data: create });
  };

  prisma.folder.upsert = async ({ where, update, create }) => {
    const existing = await prisma.folder.findUnique({ where });
    if (existing) {
      return prisma.folder.update({ where, data: update });
    }
    return prisma.folder.create({ data: create });
  };

  prisma.file.upsert = async ({ where, update, create }) => {
    const existing = await prisma.file.findUnique({ where });
    if (existing) {
      return prisma.file.update({ where, data: update });
    }
    return prisma.file.create({ data: create });
  };

  prisma.sharedFolder.upsert = async ({ where, update, create }) => {
    const existing = await prisma.sharedFolder.findUnique({ where });
    if (existing) {
      return prisma.sharedFolder.update({ where, data: update });
    }
    return prisma.sharedFolder.create({ data: create });
  };
}

module.exports = prisma;