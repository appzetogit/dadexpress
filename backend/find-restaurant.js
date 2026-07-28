import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first'); // Fix for Windows IPv6 DNS lookup issues with Mongo Atlas

dotenv.config({ path: './.env' }); // load backend env relative to backend directory

// Define schema inline
const RestaurantSchema = new mongoose.Schema({
  name: String,
  slug: String,
  isActive: Boolean,
}, { strict: false });

const Restaurant = mongoose.model('Restaurant', RestaurantSchema);

async function find() {
  try {
    const uri = process.env.MONGODB_URI;
    console.log("URI found:", uri ? "Yes (hidden for security)" : "No");
    await mongoose.connect(uri);
    console.log("Connected to DB successfully");
    const r = await Restaurant.find({ name: /JRB/i });
    console.log("Found restaurants:", r.map(doc => ({ id: doc._id, name: doc.name, slug: doc.slug, isActive: doc.isActive })));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
find();
