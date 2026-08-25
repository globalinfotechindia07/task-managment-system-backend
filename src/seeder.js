const mongoose = require('mongoose');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const User = require('./models/User');

dotenv.config();
connectDB();

const importData = async () => {
  try {
    await User.deleteMany(); // Clear existing users

    const admin = await User.create([
      {
        name: 'Admin User',
        email: 'admin@globalinfotech.com',
        password: 'password123',
        role: 'Admin',
        designation: 'System Administrator'
      },
      {
        name: 'DM Tawade',
        email: 'dmtawade18@gmail.com',
        password: 'password123',
        role: 'Admin',
        designation: 'System Administrator'
      }
    ]);

    const cto = await User.create({
      name: 'Chief Technology Officer',
      email: 'cto@globalinfotech.com',
      password: 'password123',
      role: 'CTO',
      designation: 'CTO'
    });

    const pm = await User.create({
      name: 'Project Manager',
      email: 'pm@globalinfotech.com',
      password: 'password123',
      role: 'Team Head',
      designation: 'Project Manager'
    });

    const mm = await User.create({
      name: 'Marketing Manager',
      email: 'mm@globalinfotech.com',
      password: 'password123',
      role: 'Team Head',
      designation: 'Marketing Manager'
    });

    const hr = await User.create({
      name: 'HR Manager',
      email: 'hr@globalinfotech.com',
      password: 'password123',
      role: 'HR Manager',
      designation: 'HR Manager'
    });

    const users = [
      {
        name: 'John Fullstack',
        email: 'fullstack@globalinfotech.com',
        password: 'password123',
        role: 'User',
        designation: 'Full Stack Developer',
        department: 'IT',
        teamHead: pm._id
      },
      {
        name: 'Jane Frontend',
        email: 'frontend@globalinfotech.com',
        password: 'password123',
        role: 'User',
        designation: 'Frontend Developer',
        department: 'IT',
        teamHead: pm._id
      },
      {
        name: 'Bob Backend',
        email: 'backend@globalinfotech.com',
        password: 'password123',
        role: 'User',
        designation: 'Backend Developer',
        department: 'IT',
        teamHead: pm._id
      },
      {
        name: 'Alice AppDev',
        email: 'appdev@globalinfotech.com',
        password: 'password123',
        role: 'User',
        designation: 'App Developer',
        department: 'IT',
        teamHead: pm._id
      },
      {
        name: 'Mike Marketing',
        email: 'marketing@globalinfotech.com',
        password: 'password123',
        role: 'User',
        designation: 'Marketing Executive',
        department: 'Marketing',
        teamHead: mm._id
      }
    ];

    await User.create(users);
    console.log('Data Imported!');
    process.exit();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

importData();
