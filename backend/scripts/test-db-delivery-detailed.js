import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const deliverySchema = new mongoose.Schema({
    fcmToken: String,
    fcmTokenMobile: String,
    status: String,
    isActive: Boolean
}, { collection: 'deliveries' });

async function checkDeliveries() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const Delivery = mongoose.model('DeliveryCheck2', deliverySchema);

        const withTokens = await Delivery.find({ $or: [{ fcmToken: { $exists: true, $ne: null } }, { fcmTokenMobile: { $exists: true, $ne: null } }] });
        console.log(`Deliveries with any token: ${withTokens.length}`);

        withTokens.forEach(d => {
            console.log(`ID: ${d._id}`);
            console.log(`fcmToken: "${d.fcmToken}"`);
            console.log(`fcmTokenMobile: "${d.fcmTokenMobile}"`);
            console.log(`status: ${d.status}`);
            console.log(`isActive: ${d.isActive}`);
            console.log('---');
        });

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkDeliveries();
