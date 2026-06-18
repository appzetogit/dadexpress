import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

dotenv.config();

function uploadsToImagesPath(url) {
  if (typeof url !== 'string') return url;
  
  // Replace starting with /uploads/ with /images/
  if (url.startsWith('/uploads/')) {
    return url.replace('/uploads/', '/images/');
  }
  return url;
}

function migrateObject(obj) {
  let modified = false;
  if (!obj) return { obj, modified };

  if (typeof obj === 'string') {
    const localPath = uploadsToImagesPath(obj);
    if (localPath !== obj) {
      return { obj: localPath, modified: true };
    }
    return { obj, modified: false };
  }

  if (Array.isArray(obj)) {
    const newArr = [];
    for (let i = 0; i < obj.length; i++) {
      const res = migrateObject(obj[i]);
      newArr.push(res.obj);
      if (res.modified) modified = true;
    }
    return { obj: newArr, modified };
  }

  if (typeof obj === 'object') {
    if (obj.constructor && ['ObjectId', 'Buffer', 'Date'].includes(obj.constructor.name)) {
      return { obj, modified: false };
    }
    const newObj = { ...obj };
    for (const key in newObj) {
      if (Object.prototype.hasOwnProperty.call(newObj, key)) {
        const res = migrateObject(newObj[key]);
        newObj[key] = res.obj;
        if (res.modified) modified = true;
      }
    }
    return { obj: newObj, modified };
  }

  return { obj, modified: false };
}

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
    
    console.log(`Found ${collections.length} collections. Migrating /uploads/ paths to /images/...`);
    
    let totalUpdatedDocs = 0;

    for (const colInfo of collections) {
      const colName = colInfo.name;
      if (colName.startsWith('system.')) continue;

      const collection = db.collection(colName);
      const docs = await collection.find({}).toArray();
      
      let colUpdatedCount = 0;
      
      for (const doc of docs) {
        const updatedFields = {};
        let isDocModified = false;

        for (const key in doc) {
          if (key === '_id') continue;
          
          const res = migrateObject(doc[key]);
          if (res.modified) {
            updatedFields[key] = res.obj;
            isDocModified = true;
          }
        }

        if (isDocModified) {
          await collection.updateOne({ _id: doc._id }, { $set: updatedFields });
          colUpdatedCount++;
        }
      }

      if (colUpdatedCount > 0) {
        console.log(`  Collection [${colName}]: updated ${colUpdatedCount} documents.`);
        totalUpdatedDocs += colUpdatedCount;
      }
    }

    console.log(`\n🎉 Database path migration complete! Total documents updated: ${totalUpdatedDocs}`);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Database migration failed:', error);
    process.exit(1);
  }
}

run();
