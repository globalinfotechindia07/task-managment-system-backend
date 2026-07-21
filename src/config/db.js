const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://mansibsharma10_db_user:global123@ac-23jo8un-shard-00-00.dlp0uvg.mongodb.net:27017,ac-23jo8un-shard-00-01.dlp0uvg.mongodb.net:27017,ac-23jo8un-shard-00-02.dlp0uvg.mongodb.net:27017/task-management-system?ssl=true&authSource=admin&retryWrites=true&w=majority');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
