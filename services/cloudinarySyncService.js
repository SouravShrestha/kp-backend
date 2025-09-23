const { v4: uuidv4 } = require("uuid");
require("dotenv").config();
const cloudinary = require("cloudinary").v2;
const supabase = require("../db/database");

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

async function upsertFolder(cloudinaryPath, parentId) {
  try {
    const name = cloudinaryPath.split("/").pop();
    
    // Check if folder exists
    const { data: existingFolder, error: selectError } = await supabase
      .from('folders')
      .select('id')
      .eq('cloudinary_path', cloudinaryPath)
      .single();
    
    if (selectError && selectError.code !== 'PGRST116') {
      throw selectError;
    }
    
    if (existingFolder) {
      // Folder exists, create hierarchy if parentId provided
      if (parentId) {
        await supabase
          .from('folder_hierarchy')
          .upsert({
            id: uuidv4(),
            parent_folder_id: parentId,
            folder_id: existingFolder.id
          }, {
            onConflict: 'parent_folder_id,folder_id'
          });
      }
      return existingFolder.id;
    } else {
      // Create new folder
      const newId = uuidv4();
      const { error: insertError } = await supabase
        .from('folders')
        .insert({
          id: newId,
          name,
          cloudinary_path: cloudinaryPath
        });
      
      if (insertError) throw insertError;
      
      // Create hierarchy if parentId provided
      if (parentId) {
        await supabase
          .from('folder_hierarchy')
          .insert({
            id: uuidv4(),
            parent_folder_id: parentId,
            folder_id: newId
          });
      }
      
      return newId;
    }
  } catch (error) {
    console.error('Error in upsertFolder:', error);
    throw error;
  }
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
      await upsertImage(img, folderId);
    }
    nextCursor = res.next_cursor;
  } while (nextCursor);
}

async function upsertImage(img, folderId) {
  try {
    // Check if image exists
    const { data: existingImage } = await supabase
      .from('images')
      .select('id')
      .eq('cloudinary_asset_id', img.asset_id)
      .single();
    
    if (existingImage) return; // Image already exists
    
    // Check if this is a cover image to update folder
    if (
      img.display_name &&
      img.display_name.split("/").pop().toLowerCase().startsWith("cover")
    ) {
      await supabase
        .from('folders')
        .update({
          is_event_folder: true,
          event_date: img.context?.event_date || null,
          event_name: img.context?.event_name || null,
        })
        .eq('id', folderId);
    }
    
    // Insert new image
    await supabase
      .from('images')
      .insert({
        id: uuidv4(),
        cloudinary_asset_id: img.asset_id,
        cloudinary_filename: img.filename,
        cloudinary_display_name: img.display_name,
        cloudinary_format: img.format,
        cloudinary_created_at: img.created_at,
        cloudinary_image_url: img.secure_url,
        folder_id: folderId,
      });
  } catch (error) {
    console.error('Error in upsertImage:', error);
  }
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
