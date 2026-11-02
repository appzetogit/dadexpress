import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import RestaurantWallet from '../modules/restaurant/models/RestaurantWallet.js';

async function cleanupDuplicateWalletTransactions() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI not found in environment');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');

    const wallets = await RestaurantWallet.find({});
    console.log(`🔍 Checking ${wallets.length} restaurant wallets for duplicate order transactions...`);

    let cleanedWalletsCount = 0;
    let totalDuplicatesRemoved = 0;

    for (const wallet of wallets) {
      if (!wallet.transactions || wallet.transactions.length === 0) continue;

      const seenOrderIds = new Set();
      const uniqueTransactions = [];
      let walletModified = false;

      for (const t of wallet.transactions) {
        if (t.type === 'payment' && t.orderId) {
          const orderKey = t.orderId.toString();
          if (seenOrderIds.has(orderKey)) {
            console.log(`⚠️ Found duplicate payment for order ${orderKey} (₹${t.amount}) in restaurant wallet ${wallet.restaurantId}. Removing duplicate...`);
            walletModified = true;
            totalDuplicatesRemoved++;
            continue; // Skip duplicate!
          }
          seenOrderIds.add(orderKey);
        }
        uniqueTransactions.push(t);
      }

      if (walletModified) {
        wallet.transactions = uniqueTransactions;

        // Recalculate balances correctly from unique transactions
        let totalBalance = 0;
        let totalEarned = 0;
        let totalWithdrawn = 0;

        for (const t of uniqueTransactions) {
          if (t.status === 'Completed') {
            if (t.type === 'payment' || t.type === 'bonus' || t.type === 'refund') {
              totalBalance += t.amount;
              totalEarned += t.amount;
            } else if (t.type === 'withdrawal') {
              totalBalance -= t.amount;
              totalWithdrawn += t.amount;
            } else if (t.type === 'deduction') {
              totalBalance -= t.amount;
            }
          }
        }

        wallet.totalBalance = Math.max(0, Math.round(totalBalance * 100) / 100);
        wallet.totalEarned = Math.max(0, Math.round(totalEarned * 100) / 100);
        wallet.totalWithdrawn = Math.max(0, Math.round(totalWithdrawn * 100) / 100);

        await wallet.save();
        cleanedWalletsCount++;
        console.log(`✅ Corrected wallet for restaurant ${wallet.restaurantId}. New balance: ₹${wallet.totalBalance}, totalEarned: ₹${wallet.totalEarned}`);
      }
    }

    console.log(`🎉 Cleanup completed! Cleaned ${cleanedWalletsCount} wallets, removed ${totalDuplicatesRemoved} duplicate transactions.`);
  } catch (err) {
    console.error('❌ Error during cleanup:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from DB');
  }
}

cleanupDuplicateWalletTransactions();

