import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function checkRules() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // We don't import the model file to avoid side effects, we just query the collection directly
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));
    
    // Most likely collection name is 'deliveryboycommissions'
    const commissionCollection = db.collection('deliveryboycommissions');
    const rules = await commissionCollection.find({ status: true }).toArray();
    
    console.log('Active Rules:', JSON.stringify(rules, null, 2));
    
    // Also check FeeSettings
    const feeSettingsCollection = db.collection('feesettings');
    const settings = await feeSettingsCollection.find({ isActive: true }).toArray();
    console.log('Fee Settings:', JSON.stringify(settings, null, 2));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkRules();
