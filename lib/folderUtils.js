const prisma = require('./prisma');
const { naturalSortByName } = require('./sort');

const getUniqueFolderName = async (parentId, ownerId, originalName, excludeId = null) => {
  
  let finalName = originalName;
  let counter = 1;

  while (
    await prisma.folder.findFirst({
      where: {
        parentId,
        ownerId,
        name: finalName,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    })
  ) {
    const strippedBase = originalName.replace(/\s\(\d+\)$/, '');
    finalName = `${strippedBase} (${counter})`;
    counter++;
  }

  return finalName;
};

const getBreadcrumbTrail = async (folder) => {
  const trail = [];
  let current = folder;

  while (current && current.parentId) {
    const parent = await prisma.folder.findUnique({
      where: { id: current.parentId },
      select: { id: true, name: true, parentId: true }
    });

    if (!parent) {
      console.warn(`Missing parent folder for ID: ${current.parentId}`);
      break;
    }

    trail.unshift({ id: current.id, name: current.name });
    current = parent;
  }

  const rootFolder = await prisma.folder.findFirst({
      where: { parentId: null },
      select: { id: true }
  });
  trail.unshift({ id: rootFolder.id, name: "Home" });

  return trail;
};

const buildFolderPaths = (folders) => {
  const folderMap = new Map();
  folders.forEach(f => folderMap.set(f.id, f));

  return folders.map(folder => {
    let path = folder.name;
    let current = folderMap.get(folder.parentId);

    while (current) {
      path = `${current.name} > ${path}`;
      current = folderMap.get(current.parentId);
    }

    return { id: folder.id, path };
  });
};

// Fetches folder contents for a given folder ID and user.

const getFolderView = async (folderId, userId) => {
  const folder = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!folder || folder.ownerId !== userId) {
    throw new Error("Folder not found or access denied");
  }

  const subfolders = await prisma.folder.findMany({
    where: { parentId: folderId, ownerId: userId }
  });

  const files = await prisma.file.findMany({
    where: { folderId, ownerId: userId }
  });

  const breadcrumbs = await getBreadcrumbTrail(folder);

  return {
    folderId: folder.id,
    folderName: folder.name,
    parentId: folder.parentId,
    subfolders: naturalSortByName(subfolders),
    files: naturalSortByName(files),
    breadcrumbs
  };
};

module.exports = {
  getFolderView,
  buildFolderPaths,
  getUniqueFolderName,
};