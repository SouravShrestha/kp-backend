const { v4: uuidv4 } = require("uuid");
require("dotenv").config();
const cloudinary = require("cloudinary").v2;
const db = require("../db/database");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function syncFoldersAndImages(parentPath, parentId = null) {
  const folders = await cloudinary.api
    .sub_folders(parentPath)
    .then((res) => res.folders)
    .catch(() => []);
  let folderId = await upsertFolder(parentPath, parentId);
  await syncImagesForFolder(parentPath, folderId);
  for (const folder of folders) {
    await syncFoldersAndImages(folder.path, folderId);
  }
}

async function syncAllRootFolders() {
  const rootFoldersEnv = process.env.CLOUDINARY_ROOT_FOLDERS || "";
  const rootFolders = rootFoldersEnv
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  for (const root of rootFolders) {
    await syncFoldersAndImages(root, null);
  }
}

function upsertFolder(cloudinaryPath, parentId) {
  return new Promise((resolve, reject) => {
    const name = cloudinaryPath.split("/").pop();
    db.get(
      "SELECT id FROM folders WHERE cloudinary_path = ?",
      [cloudinaryPath],
      (err, row) => {
        if (err) return reject(err);
        if (row) {
          if (parentId) {
            db.run(
              "INSERT OR IGNORE INTO folder_hierarchy (id, parent_folder_id, folder_id) VALUES (?, ?, ?)",
              [uuidv4(), parentId, row.id]
            );
          }
          return resolve(row.id);
        } else {
          const newId = uuidv4();
          db.run(
            "INSERT OR IGNORE INTO folders (id, name, cloudinary_path) VALUES (?, ?, ?)",
            [newId, name, cloudinaryPath],
            function (err) {
              if (err) return reject(err);
              if (parentId) {
                db.run(
                  "INSERT OR IGNORE INTO folder_hierarchy (id, parent_folder_id, folder_id) VALUES (?, ?, ?)",
                  [uuidv4(), parentId, newId]
                );
              }
              db.get(
                "SELECT id FROM folders WHERE cloudinary_path = ?",
                [cloudinaryPath],
                (err2, row2) => {
                  if (err2) return reject(err2);
                  resolve(row2.id);
                }
              );
            }
          );
        }
      }
    );
  });
}

async function syncImagesForFolder(cloudinaryPath, folderId) {
  let nextCursor = undefined;
  do {
    const res = await cloudinary.search
      .expression(`folder:"${cloudinaryPath}"`)
      .with_field("context")
      .max_results(100)
      .next_cursor(nextCursor)
      .execute();
    for (const img of res.resources) {
      upsertImage(img, folderId);
    }
    nextCursor = res.next_cursor;
  } while (nextCursor);
}

function upsertImage(img, folderId) {
  db.get(
    "SELECT id FROM images WHERE cloudinary_asset_id = ?",
    [img.asset_id],
    (err, row) => {
      if (row) return;
      if (
        img.display_name &&
        img.display_name.split("/").pop().toLowerCase().startsWith("cover")
      ) {
        db.run(
          "UPDATE folders SET is_event_folder = 1, event_date = ?, event_name = ? WHERE id = ?",
          [
            img.context?.event_date || null,
            img.context?.event_name || null,
            folderId,
          ]
        );
      }
      db.run(
        "INSERT INTO images (id, cloudinary_asset_id, cloudinary_filename, cloudinary_display_name, cloudinary_format, cloudinary_created_at, cloudinary_image_url, folder_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          uuidv4(),
          img.asset_id,
          img.filename,
          img.display_name,
          img.format,
          img.created_at,
          img.secure_url,
          folderId,
        ]
      );
    }
  );
}

async function runSync() {
  try {
    await syncAllRootFolders();
    console.log("Cloudinary sync complete.");
  } catch (e) {
    console.error("Cloudinary sync failed:", e);
  }
}

module.exports = { runSync };
