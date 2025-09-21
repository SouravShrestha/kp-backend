const express = require('express');
const router = express.Router();
const db = require('../db/database');


// GET /images/by-folder-name/:folderName - return all images in a folder by folder name
router.get('/by-folder-name/:folderName', (req, res) => {
  const folderName = req.params.folderName;
  const sql = `
    SELECT images.* FROM images
    INNER JOIN folders ON images.folder_id = folders.id
    WHERE folders.name = ?
  `;
  db.all(sql, [folderName], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET /images/:folderId - return all images in a folder
router.get('/:folderId', (req, res) => {
  db.all('SELECT * FROM images WHERE folder_id = ?', [req.params.folderId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

module.exports = router;
