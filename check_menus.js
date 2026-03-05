import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const MenuSchema = new mongoose.Schema({
    restaurant: mongoose.Schema.Types.ObjectId,
    sections: Array,
    isActive: Boolean,
});

const Menu = mongoose.model('Menu', MenuSchema);

async function checkMenus() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const count = await Menu.countDocuments();
        console.log(`Total Menus: ${count}`);

        const menus = await Menu.find().limit(5);
        menus.forEach((m, i) => {
            console.log(`Menu ${i + 1}: Restaurant ${m.restaurant}, Sections: ${m.sections?.length || 0}`);
            if (m.sections && m.sections.length > 0) {
                m.sections.forEach(s => {
                    console.log(`  Section: ${s.name}, Items: ${s.items?.length || 0}`);
                });
            }
        });

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkMenus();
