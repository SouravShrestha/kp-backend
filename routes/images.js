const express = require('express');
const router = express.Router();
const supabase = require('../db/database');

// GET /images/by-folder-name/:folderName - return all images in a folder by folder name
router.get('/by-folder-name/:folderName', async (req, res) => {
  try {
    const folderName = req.params.folderName;
    
    // First get the folder by name
    const { data: folder, error: folderError } = await supabase
      .from('folders')
      .select('id')
      .eq('name', folderName)
      .single();
    
    if (folderError) {
      if (folderError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Folder not found' });
      }
      return res.status(500).json({ error: folderError.message });
    }
    
    // Then get images for that folder
    const { data, error } = await supabase
      .from('images')
      .select('*')
      .eq('folder_id', folder.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /images/:folderId - return all images in a folder
router.get('/:folderId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('images')
      .select('*')
      .eq('folder_id', req.params.folderId);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
