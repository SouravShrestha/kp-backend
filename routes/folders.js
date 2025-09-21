const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /folders - return all folders, or children by parent_id or parent_name
router.get('/', (req, res) => {
  const { parent_id, parent_name } = req.query;
  if (parent_id) {
    const sql = `
      SELECT f.* FROM folders f
      INNER JOIN folder_hierarchy h ON f.id = h.folder_id
      WHERE h.parent_folder_id = ?
    `;
    db.all(sql, [parent_id], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      return res.json(rows);
    });
  } else if (parent_name) {
    // Get children by parent_name
    const sql = `
      SELECT f2.* FROM folders f1
      INNER JOIN folder_hierarchy h ON f1.id = h.parent_folder_id
      INNER JOIN folders f2 ON f2.id = h.folder_id
      WHERE f1.name = ?
    `;
    db.all(sql, [parent_name], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      return res.json(rows);
    });
  } else {
    // Return all folders
    db.all('SELECT * FROM folders', [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  }
});

// GET /folders/:id - return folder by id
router.get('/:id', (req, res) => {
  db.get('SELECT * FROM folders WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Folder not found' });
    res.json(row);
  });
});

module.exports = router;
