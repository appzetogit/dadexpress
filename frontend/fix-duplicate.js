import fs from 'fs';
const file = 'd:/dadexpress/dad-express/frontend/src/module/user/pages/dining/DiningRestaurantDetails.jsx';
const lines = fs.readFileSync(file, 'utf8').split('\n');
const indices = [];
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('{/* Tab Content */}')) {
        indices.push(i);
    }
}
if (indices.length > 1) {
    const start = indices[0];
    const end = indices[1];
    lines.splice(start, end - start);
    fs.writeFileSync(file, lines.join('\n'));
    console.log("Fixed the duplicate block!");
} else {
    console.log("Duplicate block not found");
}
