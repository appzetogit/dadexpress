import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const MONGO_URI = "mongodb+srv://dadexpress7392_db_user:PFlpxlxxIVcCAKBD@cluster0.mvacj1n.mongodb.net/dadexpress?retryWrites=true&w=majority";

async function updateDiningRestaurantLocation() {
  try {
    await mongoose.connect(MONGO_URI, { 
      serverSelectionTimeoutMS: 10000,
      family: 4 // Force IPv4
    });
    console.log("Connected to DB");

    const db = mongoose.connection.db;

    // Find all dining restaurants and show their locations
    const restaurants = await db.collection("diningrestaurants").find({}).toArray();
    console.log("Found restaurants:", restaurants.map(r => ({ name: r.name, location: r.location })));

    // Update JRB Hotel location
    const result = await db.collection("diningrestaurants").updateMany(
      { location: { $regex: /^\-?\d+\.?\d*,\s*-?\d+\.?\d*$/ } }, // matches "27.19, 75.95" pattern
      [{ $set: { location: { $concat: ["$name", " - India"] } } }]
    );

    console.log("Updated", result.modifiedCount, "restaurants");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

updateDiningRestaurantLocation();
