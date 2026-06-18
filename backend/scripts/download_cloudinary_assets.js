import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

// Configure Cloudinary with source credentials
cloudinary.config({
  cloud_name: 'dqhw7qfdl',
  api_key: '461845894553186',
  api_secret: 'Q8Q2KertUxn0vGfMloEci0n4MHc'
});

async function downloadFile(url, targetPath) {
  // Ensure target directory exists
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const writer = fs.createWriteStream(targetPath);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });
  
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function run() {
  try {
    const migrationDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(migrationDir)) {
      fs.mkdirSync(migrationDir, { recursive: true });
    }

    const resourceTypes = ['image', 'video', 'raw'];
    const allResources = [];

    console.log('🚀 Fetching all resources from Cloudinary...');

    for (const type of resourceTypes) {
      let nextCursor = null;
      console.log(`\nFetching resources of type: ${type}`);
      
      do {
        try {
          const result = await cloudinary.api.resources({
            resource_type: type,
            max_results: 500,
            next_cursor: nextCursor
          });

          if (result.resources && result.resources.length > 0) {
            allResources.push(...result.resources);
            console.log(`  Fetched ${result.resources.length} resources (Total: ${allResources.length})`);
          }
          nextCursor = result.next_cursor;
        } catch (err) {
          console.warn(`  Info/Error fetching type [${type}]:`, err.message);
          break; // Break if resource type doesn't exist or has other errors
        }
      } while (nextCursor);
    }

    console.log(`\nTotal assets fetched: ${allResources.length}`);

    // Save metadata JSON
    const metadataPath = path.join(migrationDir, 'cloudinary_metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(allResources, null, 2));
    console.log(`✅ Cloudinary metadata saved to: ${metadataPath}`);

    // Download files with a concurrency pool of 30 parallel downloads
    console.log('\n📥 Downloading assets in parallel...');
    let downloadedCount = 0;
    let errorCount = 0;
    
    const CONCURRENCY = 30;
    const tasks = allResources.map((asset, index) => async () => {
      const secureUrl = asset.secure_url;
      const publicId = asset.public_id;
      const format = asset.format || (asset.resource_type === 'raw' ? '' : 'bin');
      const ext = format ? `.${format}` : '';
      const localRelativePath = `${publicId}${ext}`;
      const targetPath = path.join(migrationDir, localRelativePath);

      try {
        await downloadFile(secureUrl, targetPath);
        downloadedCount++;
        if (downloadedCount % 50 === 0 || downloadedCount === allResources.length) {
          console.log(`[Progress] Downloaded ${downloadedCount}/${allResources.length} assets...`);
        }
      } catch (err) {
        console.error(`❌ Failed to download [${index + 1}] ${publicId}${ext}:`, err.message);
        errorCount++;
      }
    });

    const executing = [];
    for (const task of tasks) {
      const p = Promise.resolve().then(() => task());
      if (CONCURRENCY <= tasks.length) {
        const e = p.then(() => executing.splice(executing.indexOf(e), 1));
        executing.push(e);
        if (executing.length >= CONCURRENCY) {
          await Promise.race(executing);
        }
      }
    }
    await Promise.all(executing);

    console.log(`\n🎉 Download complete!`);
    console.log(`   - Success: ${downloadedCount}`);
    console.log(`   - Failed: ${errorCount}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

run();
