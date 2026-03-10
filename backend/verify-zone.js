import mongoose from 'mongoose';
import Zone from './modules/admin/models/Zone.js';

// Dummy zone bounding box: 0,0 to 10,10
const mockZone = new Zone({
  name: 'Test Zone',
  country: 'India',
  coordinates: [
    { latitude: 0, longitude: 0 },
    { latitude: 10, longitude: 0 },
    { latitude: 10, longitude: 10 },
    { latitude: 0, longitude: 10 }
  ]
});

// Mock saving it so pre-save hook runs to construct boundary array
mockZone.boundary = {
  type: 'Polygon',
  coordinates: [[[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]]
};

// Point inside
const inside = mockZone.containsPoint(5, 5);
console.log('Point (5,5) inside test zone? Expected: true | Actual:', inside);

// Point outside
const outside = mockZone.containsPoint(15, 15);
console.log('Point (15,15) inside test zone? Expected: false | Actual:', outside);

if (inside === true && outside === false) {
    console.log('✅ Zone verification successful');
} else {
    console.log('❌ Zone verification failed');
    process.exit(1);
}
