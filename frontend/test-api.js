import axios from 'axios';

async function test() {
  try {
    const res = await axios.get('http://localhost:5000/api/dining/restaurants/jrb-hotel-&-resturant');
    console.log("SUCCESS:", res.data);
  } catch (err) {
    console.error("ERROR:", err.response ? err.response.status : err.message);
  }
}
test();
