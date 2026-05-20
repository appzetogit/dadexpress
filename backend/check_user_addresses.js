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
    
    // Find all users and check their addresses
    const usersCol = db.collection('users');
    const users = await usersCol.find().toArray();
    
    console.log('--- ALL USERS AND THEIR ADDRESSES ---');
    users.forEach(user => {
      console.log(`User ID: ${user._id}`);
      console.log(`Phone: ${user.phone}`);
      console.log(`Name: ${user.name}`);
      console.log(`Role: ${user.role}`);
      console.log(`Addresses:`, JSON.stringify(user.addresses, null, 2));
      console.log('------------------------------------');
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
