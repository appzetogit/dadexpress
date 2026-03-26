const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: String,
  password: { type: String, select: false }
});

userSchema.pre('save', async function (next) {
  console.log('Hook called, next is:', typeof next);
  if (!this.isModified('password')) {
    if (typeof next === 'function') {
      return next();
    } else {
      console.log('next is NOT a function in hook!');
      return;
    }
  }
  next();
});

const User = mongoose.model('User', userSchema);

async function test() {
  await mongoose.connect('mongodb://localhost:27017/test_db_debug');
  await User.deleteMany({});
  
  const user = new User({ name: 'Test' });
  try {
    await user.save();
    console.log('Save 1 success');
  } catch (err) {
    console.error('Save 1 error:', err.message);
  }
  
  user.name = 'Updated';
  try {
    await user.save();
    console.log('Save 2 success');
  } catch (err) {
    console.error('Save 2 error:', err.message);
  }
  
  await mongoose.disconnect();
}

test();
