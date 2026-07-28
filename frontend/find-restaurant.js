import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '../.env' }); // load backend env

// Define schema inline to avoid imports if they are complex
const RestaurantSchema = new mongoose.Schema({
  name: String,
  slug: String,
  isActive: Boolean,
}, { strict: false });

const Restaurant = mongoose.model('Restaurant', RestaurantSchema);

async function find() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/dadexpress');
    console.log("Connected to DB");
    const r = await Restaurant.find({ name: /JRB/i });
    console.log("Found restaurants:", r.map(doc => ({ id: doc._id, name: doc.name, slug: doc.slug, isActive: doc.isActive })));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
find();
