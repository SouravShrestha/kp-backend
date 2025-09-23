const express = require('express');
const router = express.Router();
const supabase = require('../db/database');

// GET /folders - return all folders, or children by parent_id or parent_name
router.get('/', async (req, res) => {
  try {
    const { parent_id, parent_name } = req.query;
    
    if (parent_id) {
      // Get children folders by parent_id
      const { data, error } = await supabase
        .from('folder_hierarchy')
        .select(`
          folders!folder_hierarchy_folder_id_fkey(*)
        `)
        .eq('parent_folder_id', parent_id);
      
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data.map(item => item.folders));
    } else if (parent_name) {
      // First get the parent folder by name
      const { data: parentFolder, error: parentError } = await supabase
        .from('folders')
        .select('id')
        .eq('name', parent_name)
        .single();
      
      if (parentError) return res.status(500).json({ error: parentError.message });
      
      // Then get children
      const { data, error } = await supabase
        .from('folder_hierarchy')
        .select(`
          folders!folder_hierarchy_folder_id_fkey(*)
        `)
        .eq('parent_folder_id', parentFolder.id);
      
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data.map(item => item.folders));
    } else {
      // Return all folders
      const { data, error } = await supabase
        .from('folders')
        .select('*');
      
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /folders/:id - return folder by id
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('folders')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Folder not found' });
      }
      return res.status(500).json({ error: error.message });
    }
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
