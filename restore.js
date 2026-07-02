const { execSync } = require('child_process');
try {
    execSync('git checkout frontend/src/module/user/pages/dining/TableBooking.jsx', { stdio: 'inherit' });
    console.log('Restored');
} catch (e) {
    console.error(e);
}
