const prisma = require('../lib/prisma.js');
const path = require('node:path');
const fs = require('fs');
const { getUniqueFolderName, getFolderView, buildFolderPaths, buildFolderTree } = require('../lib/folderUtils.js');
const { getUniqueFileName } = require('../lib/fileUtils.js');

const getAllFolders = async (req, res) => {
  const userId = req.session.user.id;

  try {
    const folders = await prisma.folder.findMany({
      where: { ownerId: userId },
      select: { id: true, name: true, parentId: true }
    });

    res.json(folders);
  } catch (err) {
    console.error('Error fetching folders:', err);
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
};


const getAvailableFolderName = async (baseName, parentId, userId) => {
  return await getUniqueFolderName(parentId, userId, baseName);
}

const createFolder = async (req, res) => {
  const userId = req.session.user.id;
  const parentId = req.body.parentId || null;

  try {
    if (parentId) {
      const parentFolder = await prisma.folder.findUnique({
        where: { id: parentId }
      });

      if (!parentFolder || parentFolder.ownerId !== userId) {
        return res.status(403).send("Access denied or invalid parent folder");
      }
    }

    const name = await getAvailableFolderName("New Folder", parentId, userId);

    const folder = await prisma.folder.create({
      data: {
        name,
        ownerId: userId,
        parentId
      }
    });

    res.status(201).json({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId
    });

  } catch (err) {
    console.error("Error creating folder:", err);
    res.status(500).send("Something went wrong");
  }
};

const renderFolderView = async (folderId, userId, res, options = {}) => {
  try {
    const folder = await prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder) {
      return res.status(404).send('Folder not found');
    }
    if (folder.ownerId !== userId) {
      return res.status(403).send('Forbidden');
    }

    const allUserFolders = await prisma.folder.findMany({
      where: { ownerId: userId },
      select: { id: true, name: true, parentId: true }
    });

    const folderPaths = buildFolderPaths(allUserFolders);
    const viewData = await getFolderView(folderId, userId);
    const isRoot = options.includeIsRoot ? !viewData.parentId : undefined;

    return res.render("folder", {
      folderId: viewData.folderId,
      ...viewData,
      folderPaths,
      sharedContext: false,
      ...(isRoot !== undefined && { isRoot })
    });
  } catch (err) {
    console.error('renderFolderView failed:', err);
    return res.status(500).send('Internal server error');
  }
};

const getFolderContents = async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }

  const folderId = req.params.id;
  const userId = req.session.user.id;

  try {
    const folder = await prisma.folder.findUnique({ where: { id: folderId } });

    if (!folder) {
      return res.status(404).send('Folder not found');
    }

    if (folder.ownerId !== userId) {
      return res.status(403).send('Forbidden');
    }

    await renderFolderView(folderId, userId, res);
  } catch (err) {
    console.error('renderFolderView failed:', err);
    res.status(500).send('Internal server error');
  }
};

const getDashboard = async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }
  const userId = req.session.user.id;
  const rootFolderId = req.session.user.rootFolderId;

  if (!rootFolderId) {
    const fallbackRootFolder = await prisma.folder.findFirst({
      where: { ownerId: userId, parentId: null }
    });

    if (!fallbackRootFolder) return res.status(404).send("Root folder not found");
    return renderFolderView(fallbackRootFolder.id, userId, res, { includeIsRoot: true });
  }

  await renderFolderView(rootFolderId, userId, res, { includeIsRoot: true });
};


const renameFolder = async (req, res) => {
  const { id, newName } = req.body;

  if (!id || !newName) {
    req.flash('error', 'Missing folder ID or new name');
    return res.redirect('back');
  }

  try {
    const folder = await prisma.folder.findUnique({ where: { id } });
    if (!folder) {
      req.flash('error', 'Folder not found');
      return res.redirect('back');
    }

    const finalName = await getUniqueFolderName(
      folder.parentId,
      folder.ownerId,
      newName,
      id // exclude current folder from collision check
    );

    await prisma.folder.update({
      where: { id },
      data: { name: finalName },
    });

    res.status(200).json({ success: true, newName: finalName });
  } catch (error) {
    console.error('Rename folder error:', error);
    req.flash('error', 'Rename failed');
    res.redirect('back');
  }
};

const isDescendant = (folders, sourceId, targetId) => {
  const map = new Map();
  folders.forEach(f => {
    if (!map.has(f.parentId)) map.set(f.parentId, []);
    map.get(f.parentId).push(f.id);
  });

  const stack = [sourceId];
  while (stack.length) {
    const current = stack.pop();
    const children = map.get(current) || [];
    if (children.includes(targetId)) return true;
    stack.push(...children);
  }

  return false;
};

const moveItem = async (req, res) => {
  const { itemId, itemType, destinationId } = req.body;
  const userId = req.session.user.id;

  if (!itemId || !itemType || destinationId === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Validate destination folder
    if (destinationId) {
      const destFolder = await prisma.folder.findUnique({ where: { id: destinationId } });
      if (!destFolder || destFolder.ownerId !== userId) {
        return res.status(403).json({ error: 'Invalid destination folder' });
      }
    }

    if (itemType === 'folder') {
      const folder = await prisma.folder.findUnique({ where: { id: itemId } });
      if (!folder || folder.ownerId !== userId) {
        return res.status(404).json({ error: 'Folder not found' });
      }

      // Prevent moving folder into itself or its subfolders
      if (folder.id === destinationId) {
        return res.status(400).json({ error: 'Cannot move folder into itself' });
      }

      const allUserFolders = await prisma.folder.findMany({
        where: { ownerId: userId },
        select: { id: true, parentId: true }
      });

      if (isDescendant(allUserFolders, folder.id, destinationId)) {
        return res.status(400).json({ error: 'Cannot move folder into its subfolder' });
      }

      const originalName = folder.name;

      // Resolve name collisions in destination
      const finalName = await getUniqueFolderName(
        destinationId,
        userId,
        folder.name,
        folder.id // exclude current folder from collision check
      );

      await prisma.folder.update({
        where: { id: itemId },
        data: { parentId: destinationId, name: finalName },
      });
      return res.status(200).json({ success: true, originalName, finalName });

    } else if (itemType === 'file') {
      const file = await prisma.file.findUnique({ where: { id: itemId } });
      if (!file || file.ownerId !== userId) {
        return res.status(404).json({ error: 'File not found' });
      }

      const originalName = file.name;

      // Resolve name collisions in destination
      const finalName = await getUniqueFileName(
        destinationId,
        userId,
        file.name,
        file.id // exclude current file from collision check
      );

      await prisma.file.update({
        where: { id: itemId },
        data: { folderId: destinationId, name: finalName },
      });
      return res.status(200).json({ success: true, originalName, finalName });
    } else {
      return res.status(400).json({ error: 'Invalid item type' });
    }
    
  } catch (err) {
    console.error('Move item error:', err);
    res.status(500).json({ error: 'Failed to move item' });
  }
};

const getAllDescendantFolderIds = async (folderId) => {
  const children = await prisma.folder.findMany({ where: { parentId: folderId } });
  const childIds = children.map(f => f.id);

  const nestedIds = await Promise.all(childIds.map(getAllDescendantFolderIds));
  return [folderId, ...childIds, ...nestedIds.flat()];
};

const deleteFilesFromFolders = async (folderIds) => {
  const files = await prisma.file.findMany({ where: { folderId: { in: folderIds } } });

  for (const file of files) {
    const relativePath = file.url.startsWith('/') ? file.url.slice(1) : file.url;
    const filePath = path.join(__dirname, '..', relativePath);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('🧹 Deleted:', filePath);
    } else {
      console.warn('⚠️ Missing on disk:', filePath);
    }
  }
};

const deleteItem = async (req, res) => {
  const itemType = req.params.type;
  const itemId = req.params.id;

  try {
    if (itemType === 'folder') {
      const folderIds = await getAllDescendantFolderIds(itemId);
      await deleteFilesFromFolders(folderIds);

      // Let Prisma cascade delete folders and files
      await prisma.folder.delete({ where: { id: itemId } });
    } else if (itemType === 'file') {
      const file = await prisma.file.findUnique({ where: { id: itemId } });
      if (!file) return res.status(404).json({ error: 'File not found in database' });

      const relativePath = file.url.startsWith('/') ? file.url.slice(1) : file.url;
      const filePath = path.join(__dirname, '..', relativePath);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('🧹 Deleted file from disk:', filePath);
      } else {
        console.warn('⚠️ File missing on disk:', filePath);
      }

      await prisma.file.delete({ where: { id: itemId } });

    } else {
      return res.status(400).json({ error: 'Invalid item type' });
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Failed to delete item' });
  }
};

module.exports = {
  getAllFolders,
  createFolder,
  getDashboard,
  getFolderContents,
  renameFolder,
  moveItem,
  deleteItem
}