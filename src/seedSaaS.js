const mongoose = require('mongoose');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const User = require('./models/User');
const Company = require('./models/Company');
const SubscriptionPlan = require('./models/SubscriptionPlan');
const AttendancePolicy = require('./models/AttendancePolicy');

dotenv.config();

const seedSaaS = async () => {
  try {
    await connectDB();
    console.log('MongoDB Connected for SaaS Seeding...');

    // 1. Seed Subscription Plans
    const plansData = [
      {
        name: 'Starter Tier',
        price: 999,
        billingCycle: 'Monthly',
        maxEmployees: 15,
        durationDays: 30,
        features: ['Up to 15 Employees', 'Task & Project Tracking', 'Basic Attendance', 'Team Chat'],
        description: 'Ideal for small startups and growing teams.',
        isActive: true
      },
      {
        name: 'Professional Tier',
        price: 2499,
        billingCycle: 'Monthly',
        maxEmployees: 50,
        durationDays: 30,
        features: ['Up to 50 Employees', 'Geofenced Mobile Attendance', 'Automated Payroll & Salary Slips', 'Announcements & Push Notifications', 'HD Video Meetings'],
        description: 'Complete suite for established organizations.',
        isActive: true
      },
      {
        name: 'Enterprise Tier',
        price: 24999,
        billingCycle: 'Yearly',
        maxEmployees: 250,
        durationDays: 365,
        features: ['Up to 250 Employees', 'All Pro Features', 'Dedicated Support', 'Custom Attendance Geo-Fencing', 'Audit Logging & Analytics'],
        description: 'For corporate enterprises requiring scale and premium reliability.',
        isActive: true
      }
    ];

    const seededPlans = [];
    for (const p of plansData) {
      let existingPlan = await SubscriptionPlan.findOne({ name: p.name });
      if (!existingPlan) {
        existingPlan = await SubscriptionPlan.create(p);
        console.log(`Created Plan: ${p.name}`);
      } else {
        console.log(`Plan already exists: ${p.name}`);
      }
      seededPlans.push(existingPlan);
    }

    const proPlan = seededPlans.find(p => p.name.includes('Professional')) || seededPlans[0];

    // 2. Seed Super Admin
    let superAdmin = await User.findOne({ role: 'Super Admin' });
    if (!superAdmin) {
      superAdmin = await User.create({
        name: 'Platform Super Admin',
        email: 'superadmin@globalinfotech.com',
        password: 'admin123',
        role: 'Super Admin',
        designation: 'Platform Administrator'
      });
      console.log('Created Super Admin: superadmin@globalinfotech.com / admin123');
    } else {
      console.log(`Super Admin already exists: ${superAdmin.email}`);
    }

    // 3. Find or Create Default Company for existing Office
    let defaultCompany = await Company.findOne({ companyCode: 'GIT-HQ' });
    if (!defaultCompany) {
      // Find current Admin user
      const existingAdmin = await User.findOne({ role: 'Admin' });

      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(startDate.getDate() + 365);

      defaultCompany = await Company.create({
        name: 'Global InfoTech (HQ)',
        companyCode: 'GIT-HQ',
        industry: 'Information Technology',
        location: 'Mumbai, India',
        address: 'Tech Park, Main Street, Powai',
        contactEmail: 'contact@globalinfotech.com',
        phone: '+91 9876543210',
        adminUser: existingAdmin ? existingAdmin._id : null,
        status: 'Active',
        subscription: {
          plan: proPlan._id,
          planName: proPlan.name,
          status: 'Active',
          startDate,
          endDate,
          maxEmployees: proPlan.maxEmployees
        }
      });
      console.log('Created Default Company: Global InfoTech (HQ)');
    }

    // 4. Link existing users without company to defaultCompany
    const unassignedUsers = await User.find({
      role: { $ne: 'Super Admin' },
      $or: [{ company: { $exists: false } }, { company: null }]
    });

    if (unassignedUsers.length > 0) {
      console.log(`Migrating ${unassignedUsers.length} users to Company "${defaultCompany.name}"...`);
      for (const u of unassignedUsers) {
        u.company = defaultCompany._id;
        await u.save();
      }
      console.log('User company linking complete!');
    }

    // 5. Ensure AttendancePolicy exists for defaultCompany
    let defaultPolicy = await AttendancePolicy.findOne({ company: defaultCompany._id });
    if (!defaultPolicy) {
      await AttendancePolicy.create({
        company: defaultCompany._id,
        inTime: '09:30',
        outTime: '18:30',
        bufferMinutes: 15,
        allowedRadiusMeters: 500
      });
      console.log('Created Attendance Policy for Default Company');
    }

    // 6. Link unassigned Tasks, Projects, and Attendance to default company
    const Task = require('./models/Task');
    const Project = require('./models/Project');
    const Attendance = require('./models/Attendance');
    const UserSalary = require('./models/UserSalary');
    const SalarySlip = require('./models/SalarySlip');

    await Task.updateMany({ $or: [{ company: { $exists: false } }, { company: null }] }, { $set: { company: defaultCompany._id } });
    await Project.updateMany({ $or: [{ company: { $exists: false } }, { company: null }] }, { $set: { company: defaultCompany._id } });
    await Attendance.updateMany({ $or: [{ company: { $exists: false } }, { company: null }] }, { $set: { company: defaultCompany._id } });
    await UserSalary.updateMany({ $or: [{ company: { $exists: false } }, { company: null }] }, { $set: { company: defaultCompany._id } });
    await SalarySlip.updateMany({ $or: [{ company: { $exists: false } }, { company: null }] }, { $set: { company: defaultCompany._id } });

    console.log('Linked unassigned tasks, projects, attendances and payroll to default company');
    console.log('✅ SaaS Seeding and Data Migration successfully completed!');
    process.exit(0);
  } catch (error) {
    console.error('Error during SaaS Seeding:', error);
    process.exit(1);
  }
};

seedSaaS();
