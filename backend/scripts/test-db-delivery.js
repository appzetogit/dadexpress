import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const deliverySchema = new mongoose.Schema({
    fcmToken: String,
    status: String,
    isActive: Boolean
}, { collection: 'deliveries' });

async function checkDeliveries() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const Delivery = mongoose.model('DeliveryCheck', deliverySchema);

        const allDeliveries = await Delivery.find({});
        console.log(`Total deliveries in DB: ${allDeliveries.length}`);

        const withTokens = await Delivery.find({ fcmToken: { $exists: true, $ne: null } });
        console.log(`Deliveries with fcmToken: ${withTokens.length}`);

        if (withTokens.length > 0) {
            console.log('Sample delivery with token:');
            console.log(JSON.stringify({
                _id: withTokens[0]._id,
                fcmToken: withTokens[0].fcmToken ? 'exists' : 'null',
                status: withTokens[0].status,
                isActive: withTokens[0].isActive
            }, null, 2));
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkDeliveries();
