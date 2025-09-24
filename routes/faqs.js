const express = require('express');
const router = express.Router();
const supabase = require('../db/database');
const { syncFaqs } = require('../services/cloudinarySyncService');

// GET /faqs - return all FAQ categories with their FAQs
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('faq_categories')
      .select(`
        *,
        faqs(*)
      `)
      .order('name');
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /faqs/categories - return all FAQ categories only
router.get('/categories', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('faq_categories')
      .select('*')
      .order('name');
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /faqs/categories/:id - return specific category with its FAQs
router.get('/categories/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('faq_categories')
      .select(`
        *,
        faqs(*)
      `)
      .eq('id', req.params.id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'FAQ category not found' });
      }
      return res.status(500).json({ error: error.message });
    }
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /faqs/categories/:categoryId/faqs - return FAQs for a specific category
router.get('/categories/:categoryId/faqs', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('faqs')
      .select(`
        *,
        faq_categories(name)
      `)
      .eq('category_id', req.params.categoryId)
      .order('created_at');
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /faqs/questions/:id - return specific FAQ by ID
router.get('/questions/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('faqs')
      .select(`
        *,
        faq_categories(name)
      `)
      .eq('id', req.params.id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'FAQ not found' });
      }
      return res.status(500).json({ error: error.message });
    }
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /faqs/search?q=keyword - search FAQs by question or answer
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query "q" is required' });
    }
    
    const { data, error } = await supabase
      .from('faqs')
      .select(`
        *,
        faq_categories(name)
      `)
      .or(`question.ilike.%${q}%,answer.ilike.%${q}%`)
      .order('created_at');
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /faqs/sync - sync FAQs from JSON file in Supabase Storage
router.post('/sync', async (req, res) => {
  try {
    console.log('Starting FAQs sync...');
    const result = await syncFaqs();
    
    res.status(200).json({ 
      message: 'FAQs synced successfully',
      categoriesCount: result.categories?.length || 0,
      data: result
    });
    
  } catch (error) {
    console.error('FAQs sync error:', error);
    res.status(500).json({ 
      error: 'Failed to sync FAQs', 
      details: error.message 
    });
  }
});

module.exports = router;