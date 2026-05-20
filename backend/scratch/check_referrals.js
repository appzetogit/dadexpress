import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: 'd:/dadexpress/dad-express/backend/.env' });

async function checkReferrals() {
  try {
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI not found in .env');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB successfully\n');

    const db = mongoose.connection.db;

    // 1. Find User by referralCode "SAGAR7114"
    const targetCode = "SAGAR7114";
    const sagarUser = await db.collection('users').findOne({ referralCode: targetCode });

    if (!sagarUser) {
      console.log(`❌ User with referralCode "${targetCode}" NOT found!`);
      // Let's list some users with referral codes to see what they look like
      const usersWithCodes = await db.collection('users').find({ referralCode: { $exists: true } }).limit(5).toArray();
      console.log('\nSample users with referral codes in DB:');
      usersWithCodes.forEach(u => {
        console.log(`- Name: ${u.name}, Code: ${u.referralCode}, Stats: ${JSON.stringify(u.referralStats)}`);
      });
    } else {
      console.log(`✅ Found User with referralCode "${targetCode}":`);
      console.log(`   ID: ${sagarUser._id}`);
      console.log(`   Name: ${sagarUser.name}`);
      console.log(`   Phone: ${sagarUser.phone}`);
      console.log(`   Email: ${sagarUser.email}`);
      console.log(`   ReferralStats: ${JSON.stringify(sagarUser.referralStats)}`);
      console.log(`   ReferredBy: ${sagarUser.referredBy}`);

      // 2. Find all users referred by this user
      const referees = await db.collection('users').find({ referredBy: sagarUser._id }).toArray();
      console.log(`\n👥 Users referred by this user (Count: ${referees.length}):`);
      referees.forEach((r, idx) => {
        console.log(`  ${idx+1}. Name: ${r.name}, Phone: ${r.phone}, CreatedAt: ${r.createdAt}`);
      });

      // 3. Find Referral Logs for this referrer
      const logs = await db.collection('referrallogs').find({ referrer: sagarUser._id }).toArray();
      console.log(`\n📋 Referral Logs for this referrer (Count: ${logs.length}):`);
      for (const log of logs) {
        const refereeUser = await db.collection('users').findOne({ _id: log.referee });
        console.log(`  - Referee: ${refereeUser ? refereeUser.name : log.referee}`);
        console.log(`    Status: ${log.status}`);
        console.log(`    Referrer Reward: ${log.referrerReward}, Referee Reward: ${log.refereeReward}`);
        console.log(`    OrderId: ${log.orderId}`);
        console.log(`    CreatedAt: ${log.createdAt}`);
      }
    }

    // 4. Check Business Settings
    const settings = await db.collection('businesssettings').findOne();
    console.log('\n⚙️ Business Settings Referral Config:');
    if (settings) {
      console.log(JSON.stringify(settings.referral, null, 2));
    } else {
      console.log('❌ No business settings found!');
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkReferrals();
