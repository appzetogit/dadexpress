import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    
    const usersCol = db.collection('users');
    const user = await usersCol.findOne({ _id: new mongoose.Types.ObjectId('69e735b589ebdfeccc94b518') });
    
    if (user) {
      console.log('--- FOUND CURRENT USER ---');
      console.log(`User ID: ${user._id}`);
      console.log(`Phone: ${user.phone}`);
      console.log(`Name: ${user.name}`);
      console.log(`Addresses:`, JSON.stringify(user.addresses, null, 2));
    } else {
      // Find any user matching 69e735b589eb
      const allUsers = await usersCol.find().toArray();
      const matched = allUsers.find(u => u._id.toString().startsWith('69e735b589eb'));
      if (matched) {
        console.log('--- FOUND MATCHED USER ---');
        console.log(`User ID: ${matched._id}`);
        console.log(`Phone: ${matched.phone}`);
        console.log(`Name: ${matched.name}`);
        console.log(`Addresses:`, JSON.stringify(matched.addresses, null, 2));
      } else {
        console.log('User not found');
      }
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
