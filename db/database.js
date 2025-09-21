const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../database.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Failed to connect to database:', err.message);
    process.exit(1);
  }
  console.log('Connected to SQLite database.');
});

const createTables = () => {
  db.run(`CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cloudinary_path TEXT NOT NULL UNIQUE,
    external_id TEXT,
    is_event_folder INTEGER DEFAULT 0,
    event_name TEXT,
    event_date TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    cloudinary_asset_id TEXT NOT NULL,
    cloudinary_filename TEXT NOT NULL,
    cloudinary_display_name TEXT,
    cloudinary_format TEXT,
    cloudinary_created_at TEXT,
    cloudinary_image_url TEXT NOT NULL,
    folder_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(folder_id) REFERENCES folders(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS folder_hierarchy (
    id TEXT PRIMARY KEY,
    parent_folder_id TEXT NOT NULL,
    folder_id TEXT NOT NULL,
    UNIQUE(parent_folder_id, folder_id),
    FOREIGN KEY(parent_folder_id) REFERENCES folders(id),
    FOREIGN KEY(folder_id) REFERENCES folders(id)
  )`);
};

createTables();

module.exports = db;
