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

async function syncPackages() {
  try {
    const bucketName = process.env.SUPABASE_STORAGE_BUCKET;
    const fileName = process.env.PACKAGES_JSON_FILE || 'packages.json';
    
    if (!bucketName) {
      throw new Error('SUPABASE_STORAGE_BUCKET environment variable is not set');
    }
    
    console.log(`Syncing packages from ${fileName} in ${bucketName} bucket...`);
    
    // Download the JSON file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(bucketName)
      .download(fileName);
    
    if (downloadError) {
      console.error('Packages download error:', downloadError);
      throw new Error(`Failed to download packages JSON file "${fileName}": ${downloadError.message || 'Unknown error'}`);
    }
    
    if (!fileData) {
      throw new Error('Downloaded packages file data is empty');
    }
    
    console.log('Packages file downloaded successfully, size:', fileData.size);
    
    // Convert blob to text and parse JSON
    const text = await fileData.text();
    const data = JSON.parse(text);
    
    // Validate the JSON structure - expecting { packages: [...], addons: [...] }
    if (!data.packages || !Array.isArray(data.packages)) {
      throw new Error('Invalid packages JSON format. Expected object with "packages" array.');
    }
    
    console.log(`Found ${data.packages.length} packages and ${data.addons?.length || 0} addons in JSON file`);
    
    // Clear existing packages and addons
    await supabase.from('addons').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('packages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // Insert packages
    for (const packageData of data.packages) {
      const required = ['name'];
      const missing = required.filter(field => !packageData[field]);
      
      if (missing.length > 0) {
        console.warn(`Package missing required fields: ${missing.join(', ')}, skipping...`);
        continue;
      }
      
      // Insert package with correct field mapping
      const { data: insertedPackage, error: packageError } = await supabase
        .from('packages')
        .insert({
          name: packageData.name,
          ideal_for: packageData.idealFor || null,
          includes: packageData.includes || null,
          price_aud: packageData.priceAUD || null,
          image: packageData.image || null
        })
        .select()
        .single();
      
      if (packageError) {
        console.error('Package insert error:', packageError);
        continue;
      }
      
      console.log(`Inserted package: ${packageData.name}`);
    }
    
    // Insert standalone addons (not linked to specific packages)
    if (data.addons && Array.isArray(data.addons)) {
      for (const addon of data.addons) {
        if (addon.name) {
          const { error: addonError } = await supabase
            .from('addons')
            .insert({
              package_id: null, // Standalone addon
              name: addon.name,
              price_aud: addon.priceAUD || null,
              unit: addon.unit || null,
              delivery: addon.delivery || null
            });
          
          if (addonError) {
            console.error('Addon insert error:', addonError);
          } else {
            console.log(`Inserted addon: ${addon.name}`);
          }
        }
      }
    }
    
    console.log(`Successfully synced ${data.packages.length} packages and ${data.addons?.length || 0} addons`);
    return data;
    
  } catch (error) {
    console.error('Packages sync failed:', error);
    throw error;
  }
}

async function syncFaqs() {
  try {
    const bucketName = process.env.SUPABASE_STORAGE_BUCKET;
    const fileName = process.env.FAQ_JSON_FILE || 'faq.json';
    
    if (!bucketName) {
      throw new Error('SUPABASE_STORAGE_BUCKET environment variable is not set');
    }
    
    console.log(`Syncing FAQs from ${fileName} in ${bucketName} bucket...`);
    
    // Download the JSON file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(bucketName)
      .download(fileName);
    
    if (downloadError) {
      console.error('FAQ download error:', downloadError);
      throw new Error(`Failed to download FAQ JSON file "${fileName}": ${downloadError.message || 'Unknown error'}`);
    }
    
    if (!fileData) {
      throw new Error('Downloaded FAQ file data is empty');
    }
    
    console.log('FAQ file downloaded successfully, size:', fileData.size);
    
    // Convert blob to text and parse JSON
    const text = await fileData.text();
    const faqData = JSON.parse(text);
    
    // Expected format: { categories: [{ name: "Category", faqs: [{ question: "", answer: "" }] }] }
    if (!faqData.categories || !Array.isArray(faqData.categories)) {
      throw new Error('Invalid FAQ JSON format. Expected object with "categories" array.');
    }
    
    console.log(`Found ${faqData.categories.length} FAQ categories in JSON file`);
    
    // Clear existing FAQs and categories
    await supabase.from('faqs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('faq_categories').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // Insert categories and FAQs
    for (const categoryData of faqData.categories) {
      if (!categoryData.name) {
        console.warn('Category missing name, skipping...');
        continue;
      }
      
      // Insert category
      const { data: insertedCategory, error: categoryError } = await supabase
        .from('faq_categories')
        .insert({
          name: categoryData.name
        })
        .select()
        .single();
      
      if (categoryError) {
        console.error('Category insert error:', categoryError);
        continue;
      }
      
      // Insert FAQs for this category
      if (categoryData.faqs && Array.isArray(categoryData.faqs)) {
        for (const faq of categoryData.faqs) {
          if (faq.question && faq.answer) {
            await supabase
              .from('faqs')
              .insert({
                category_id: insertedCategory.id,
                question: faq.question,
                answer: faq.answer
              });
          }
        }
      }
    }
    
    console.log(`Successfully synced ${faqData.categories.length} FAQ categories`);
    return faqData;
    
  } catch (error) {
    console.error('FAQ sync failed:', error);
    throw error;
  }
}

async function runSync() {
  try {
    await syncAllRootFolders();
    console.log("Cloudinary sync complete.");
    
    await syncTestimonials();
    console.log("Testimonials sync complete.");
    
    await syncPackages();
    console.log("Packages sync complete.");
    
    await syncFaqs();
    console.log("FAQ sync complete.");
  } catch (e) {
    console.error("Sync failed:", e);
  }
}

module.exports = { runSync, syncTestimonials, syncPackages, syncFaqs };
