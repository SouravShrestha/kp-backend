const express = require('express');
const router = express.Router();
const supabase = require('../db/database');
const { syncPackages } = require('../services/cloudinarySyncService');

// GET /packages - return all packages with their addons
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('packages')
      .select(`
        *,
        addons(*)
      `)
      .order('price_aud', { ascending: true });
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /packages/:id - return specific package with addons
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('packages')
      .select(`
        *,
        addons(*)
      `)
      .eq('id', req.params.id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Package not found' });
      }
      return res.status(500).json({ error: error.message });
    }
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /packages/addons/standalone - return standalone addons (not linked to packages)
router.get('/addons/standalone', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('addons')
      .select('*')
      .is('package_id', null)
      .order('name');
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /packages/addons/all - return all addons
router.get('/addons/all', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('addons')
      .select(`
        *,
        packages(name)
      `)
      .order('name');
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /packages/sync - sync packages from JSON file in Supabase Storage
router.post('/sync', async (req, res) => {
  try {
    console.log('Starting packages sync...');
    const result = await syncPackages();
    
    res.status(200).json({ 
      message: 'Packages synced successfully',
      packagesCount: result.packages?.length || 0,
      addonsCount: result.addons?.length || 0,
      data: result
    });
    
  } catch (error) {
    console.error('Packages sync error:', error);
    res.status(500).json({ 
      error: 'Failed to sync packages', 
      details: error.message 
    });
  }
});

module.exports = router;