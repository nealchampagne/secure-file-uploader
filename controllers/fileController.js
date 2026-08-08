const prisma = require('../lib/prisma.js');
const supabase = require('../lib/supabase.js');
const { getUniqueFileName } = require('../lib/fileUtils.js');
const path = require('node:path');
const fs = require('fs');

const viewFileDetails = async (req, res) => {
  const fileId = req.params.id;
  const userId = req.session.user.id;

  try {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: {
        user: true,
        folder: true,
      }
    });

    if (!file) {
      return res.status(404).send("File not found");
    } else if (file.ownerId !== userId) {
      return res.status(403).send("Access denied");
    };
    console.log('Here I go rendering again...')
    res.render('fileDetails', { file });
  } catch (err) {
    console.error('Error fetching file details:', err);
    res.status(500).send("Something went wrong");
  }
};

const downloadFile = async (req, res) => {
  const file = await prisma.file.findUnique({ where: { id: req.params.id } });
  if (!file) return res.status(404).json({ error: 'File not found' });

  try {
    const { data, error } = await supabase.storage
      .from('files')
      .download(file.path);

    if (error || !data) {
      console.error('Supabase download error:', error);
      return res.status(500).json({ error: 'Failed to download file from storage' });
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    res.send(buffer);
  } catch (err) {
    console.error('Download error:', err);
    return res.status(500).json({ error: 'Failed to download file' });
  }
};

const uploadFile = async (req, res) => {
  const { folderId, ownerId } = req.body;
  const uploaded = req.file;

  if (!uploaded || !folderId || !ownerId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {

    const finalName = await getUniqueFileName(folderId, ownerId, uploaded.originalname);

    const safeName = encodeURIComponent(finalName);

    const { data, error } = await supabase.storage
      .from('files') // Bucket name
      .upload(`user/${ownerId}/${finalName}`, uploaded.buffer, {
        contentType: uploaded.mimetype,
      });
    if (error) throw error;

    const { data: publicURLData, error: publicURLError } = supabase.storage
      .from('files')
      .getPublicUrl(`user/${ownerId}/${safeName}`);

    if (publicURLError) throw publicURLError;

    const publicURL = publicURLData.publicUrl;

    // Save metadata in Postgres
    await prisma.file.create({
      data: {
        name: finalName,
        folderId,
        ownerId,
        size: uploaded.size,
        mimeType: uploaded.mimetype,
        path: data.path, 
        url: publicURL,
      },
    });

    res.redirect(`/folders/${folderId}`);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
};

const renameFile = async (req, res) => {
  const id = req.body.id;
  const newName = req.body.newName?.trim();
  if (!id || !newName) return res.status(400).json({ error: 'Missing file ID or new name' });

  try {
    const file = await prisma.file.findUnique({ where: { id } });
    if (!file) return res.status(404).json({ error: 'File not found' });

    const ext = path.extname(file.name);
    const base = path.basename(newName, ext);
    const finalName = await getUniqueFileName(file.folderId, file.ownerId, `${base}${ext}`, id);
    
    await prisma.file.update({
      where: { id },
      data: { name: finalName },
    });

    res.status(200).json({ success: true, newName: finalName });
  } catch (error) {
    console.error('Rename error:', error);
    res.status(500).json({ error: 'Failed to rename file' });
  }
};

module.exports = {
  viewFileDetails,
  downloadFile,
  uploadFile,
  renameFile,
};