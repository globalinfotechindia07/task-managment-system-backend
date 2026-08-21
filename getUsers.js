require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');

const run = async () => {
  try {
    await mongoose.connect('mongodb://mansibsharma10_db_user:global123@ac-23jo8un-shard-00-00.dlp0uvg.mongodb.net:27017,ac-23jo8un-shard-00-01.dlp0uvg.mongodb.net:27017,ac-23jo8un-shard-00-02.dlp0uvg.mongodb.net:27017/task-management-system?ssl=true&authSource=admin&retryWrites=true&w=majority');
    console.log('MongoDB Connected');
    
    const users = await User.find({}, 'email name role status').lean();
    console.log('\n--- All Users in Database ---');
    console.table(users);
    
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

run();
