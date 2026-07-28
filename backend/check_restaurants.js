import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function checkRestaurants() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const restaurants = await db.collection('restaurants').find({}).toArray();
    
    let approved = 0;
    let active = 0;
    let inactive = 0;
    
    let unapproved = 0;
    let pending = 0;
    let rejected = 0;
    let incomplete = 0;

    for (const r of restaurants) {
      if (r.approvedAt) {
        approved++;
        if (r.isActive) active++;
        else inactive++;
      } else {
        unapproved++;
        if (r.rejectionReason) rejected++;
        else if (r.onboarding && r.onboarding.completedSteps >= 1) pending++;
        else incomplete++;
      }
    }

    console.log(`\n=== RESTAURANT DATABASE STATS ===`);
    console.log(`Total Restaurants in Database: ${restaurants.length}`);
    console.log(`\n✅ APPROVED RESTAURANTS: ${approved}`);
    console.log(`   - Active (Live on app): ${active}`);
    console.log(`   - Inactive (Disabled): ${inactive}`);
    console.log(`\n❌ UNAPPROVED RESTAURANTS: ${unapproved}`);
    console.log(`   - Pending (Waiting for admin): ${pending}`);
    console.log(`   - Rejected: ${rejected}`);
    console.log(`   - Incomplete Registration: ${incomplete}`);
    console.log(`=================================\n`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkRestaurants();
