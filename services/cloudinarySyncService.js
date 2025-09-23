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

async function syncTestimonials() {
  try {
    const bucketName = process.env.SUPABASE_STORAGE_BUCKET;
    const fileName = process.env.TESTIMONIALS_JSON_FILE || 'testimonials.json';
    
    console.log(`Syncing testimonials from ${fileName} in ${bucketName} bucket...`);
    
    // Download the JSON file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(bucketName)
      .download(fileName);
    
    if (downloadError) {
      console.error('Testimonials download error:', downloadError);
      throw new Error(`Failed to download testimonials JSON file: ${downloadError.message}`);
    }
    
    // Convert blob to text and parse JSON
    const text = await fileData.text();
    const testimonialsData = JSON.parse(text);
    
    if (!Array.isArray(testimonialsData)) {
      throw new Error('Invalid JSON format. Expected an array of testimonials.');
    }
    
    console.log(`Found ${testimonialsData.length} testimonials in JSON file`);
    
    // Validate and prepare testimonials data
    const validatedTestimonials = testimonialsData.map((testimonial, index) => {
      const required = ['heading', 'details', 'name', 'occasion', 'date'];
      const missing = required.filter(field => !testimonial[field]);
      
      if (missing.length > 0) {
        throw new Error(`Testimonial at index ${index} is missing required fields: ${missing.join(', ')}`);
      }
      
      return {
        heading: testimonial.heading,
        details: testimonial.details,
        name: testimonial.name,
        occasion: testimonial.occasion,
        date: testimonial.date,
        image_url: testimonial.image_url || null
      };
    });
    
    // Clear existing testimonials and insert new ones
    const { error: deleteError } = await supabase
      .from('testimonials')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records
    
    if (deleteError) {
      console.error('Testimonials delete error:', deleteError);
      throw new Error(`Failed to clear existing testimonials: ${deleteError.message}`);
    }
    
    // Insert new testimonials
    const { data: insertedData, error: insertError } = await supabase
      .from('testimonials')
      .insert(validatedTestimonials)
      .select();
    
    if (insertError) {
      console.error('Testimonials insert error:', insertError);
      throw new Error(`Failed to insert testimonials: ${insertError.message}`);
    }
    
    console.log(`Successfully synced ${insertedData.length} testimonials`);
    return insertedData;
    
  } catch (error) {
    console.error('Testimonials sync failed:', error);
    throw error;
  }
}

async function runSync() {
  try {
    await syncAllRootFolders();
    console.log("Cloudinary sync complete.");
    
    await syncTestimonials();
    console.log("Testimonials sync complete.");
  } catch (e) {
    console.error("Sync failed:", e);
  }
}

module.exports = { runSync, syncTestimonials };
