import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

async function run() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('MONGODB_URI not found in environment');
      process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected!');

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    console.log(`Found ${collections.length} collections. Scanning for Cloudinary URLs...`);
    
    const urlMatches = [];

    // Helper to recursively find strings matching cloudinary in an object
    function findCloudinaryStrings(obj, pathStr = '') {
      const results = [];
      if (!obj) return results;

      if (typeof obj === 'string') {
        if (obj.includes('cloudinary.com')) {
          results.push({ path: pathStr, value: obj });
        }
      } else if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          results.push(...findCloudinaryStrings(item, `${pathStr}[${index}]`));
        });
      } else if (typeof obj === 'object') {
        // Skip buffers, ObjectIds, etc.
        if (obj.constructor && ['ObjectId', 'Buffer', 'Date'].includes(obj.constructor.name)) {
          return results;
        }
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            results.push(...findCloudinaryStrings(obj[key], pathStr ? `${pathStr}.${key}` : key));
          }
        }
      }
      return results;
    }

    for (const colInfo of collections) {
      const colName = colInfo.name;
      // Skip system collections or index collections
      if (colName.startsWith('system.')) continue;

      const collection = db.collection(colName);
      const docs = await collection.find({}).toArray();
      
      let colMatchCount = 0;
      docs.forEach(doc => {
        const matches = findCloudinaryStrings(doc);
        if (matches.length > 0) {
          colMatchCount++;
          urlMatches.push({
            collection: colName,
            id: doc._id,
            matches
          });
        }
      });

      if (colMatchCount > 0) {
        console.log(`  Collection [${colName}]: found ${colMatchCount} documents with Cloudinary URLs.`);
      }
    }

    console.log('\n--- SCAN RESULT SUMMARY ---');
    console.log(`Total documents with Cloudinary URLs: ${urlMatches.length}`);
    
    // Group and print unique URLs
    const uniqueUrls = new Set();
    urlMatches.forEach(item => {
      item.matches.forEach(m => uniqueUrls.add(m.value));
    });
    
    console.log(`Total unique Cloudinary URLs: ${uniqueUrls.size}`);
    console.log('\nUnique URLs list:');
    Array.from(uniqueUrls).forEach(url => console.log(`  - ${url}`));

    // Write full scan result to a file for reference
    fs.writeFileSync(
      path.join(process.cwd(), 'cloudinary_scan_results.json'),
      JSON.stringify(urlMatches, null, 2)
    );
    console.log('\nDetailed matches written to cloudinary_scan_results.json');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error during scan:', error);
    process.exit(1);
  }
}

run();
