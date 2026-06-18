import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

dotenv.config();

function cloudinaryToLocalPath(url) {
  if (typeof url !== 'string') return url;
  
  // Matches URLs like https://res.cloudinary.com/dqhw7qfdl/image/upload/v1718712345/appzeto/restaurant/profile/image1.png
  // or https://res.cloudinary.com/dqhw7qfdl/image/upload/appzeto/restaurant/profile/image1.png
  // or res.cloudinary.com/dqhw7qfdl/...
  const regex = /(https?:\/\/)?res\.cloudinary\.com\/dqhw7qfdl\/(image|video|raw)\/upload\/(v\d+\/)?(.+)/i;
  const match = url.match(regex);
  if (match) {
    const resourcePath = match[4];
    return `/uploads/${resourcePath}`;
  }
  return url;
}

function migrateObject(obj) {
  let modified = false;
  if (!obj) return { obj, modified };

  if (typeof obj === 'string') {
    const localPath = cloudinaryToLocalPath(obj);
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
    
    console.log(`Found ${collections.length} collections. Migrating Cloudinary URLs...`);
    
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

    console.log(`\n🎉 Database migration complete! Total documents updated: ${totalUpdatedDocs}`);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Database migration failed:', error);
    process.exit(1);
  }
}

run();
