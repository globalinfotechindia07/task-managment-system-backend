const mongoose = require('mongoose');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const User = require('./models/User');
const Company = require('./models/Company');
const AuditLog = require('./models/AuditLog');
const Ticket = require('./models/Ticket');

dotenv.config();

const seed = async () => {
  try {
    await connectDB();
    console.log('Connected to MongoDB...');

    const user = await User.findOne({ role: { $in: ['Admin', 'HR Manager', 'User'] } });
    const company = await Company.findOne();
    const superAdmin = await User.findOne({ role: 'Super Admin' });

    // Seed Audit Logs if empty
    const auditCount = await AuditLog.countDocuments();
    if (auditCount === 0) {
      console.log('Seeding initial audit logs...');
      const sampleLogs = [
        {
          user: user?._id || null,
          userName: user?.name || 'Vikas Sharma',
          userEmail: user?.email || 'admin@globalinfotech.com',
          userRole: user?.role || 'Admin',
          company: company?._id || null,
          companyName: company?.name || 'Global Infotech Pvt Ltd',
          action: 'USER_LOGIN',
          category: 'AUTH',
          status: 'SUCCESS',
          details: { ip: '192.168.1.104', browser: 'Chrome 122 on Windows 11' },
          endpoint: '/api/auth/login',
          method: 'POST',
          statusCode: 200,
          createdAt: new Date(Date.now() - 30 * 60 * 1000),
        },
        {
          user: user?._id || null,
          userName: user?.name || 'Vikas Sharma',
          userEmail: user?.email || 'admin@globalinfotech.com',
          userRole: user?.role || 'Admin',
          company: company?._id || null,
          companyName: company?.name || 'Global Infotech Pvt Ltd',
          action: 'TASK_STATUS_CHANGED',
          category: 'WORK',
          status: 'SUCCESS',
          details: { taskId: '65f1234', title: 'Q3 Financial Audit Preparation', newStatus: 'In Progress' },
          endpoint: '/api/tasks/65f1234/status',
          method: 'PUT',
          statusCode: 200,
          createdAt: new Date(Date.now() - 25 * 60 * 1000),
        },
        {
          user: user?._id || null,
          userName: user?.name || 'Pooja Verma',
          userEmail: 'pooja.v@globalinfotech.com',
          userRole: 'HR Manager',
          company: company?._id || null,
          companyName: company?.name || 'Global Infotech Pvt Ltd',
          action: 'ATTENDANCE_PUNCH_IN',
          category: 'ATTENDANCE',
          status: 'SUCCESS',
          details: { status: 'Present', geofenceDistance: '42m inside radius' },
          endpoint: '/api/attendance/punch-in',
          method: 'POST',
          statusCode: 200,
          createdAt: new Date(Date.now() - 15 * 60 * 1000),
        },
        {
          user: user?._id || null,
          userName: 'Rohan Mehta',
          userEmail: 'rohan.m@globalinfotech.com',
          userRole: 'User',
          company: company?._id || null,
          companyName: company?.name || 'Global Infotech Pvt Ltd',
          action: 'QUERY_FAILED',
          category: 'DATABASE',
          status: 'ERROR',
          details: {
            errorName: 'CastError',
            message: 'Cast to ObjectId failed for value "invalid_proj_99" at path "_id" for model "Project"',
            stack: 'CastError: Cast to ObjectId failed for value "invalid_proj_99"\n    at model.Query.exec (/backend/node_modules/mongoose/lib/query.js:4891:21)',
          },
          endpoint: '/api/projects/invalid_proj_99',
          method: 'GET',
          statusCode: 500,
          createdAt: new Date(Date.now() - 10 * 60 * 1000),
        },
        {
          user: null,
          userName: 'Unknown Client',
          userEmail: 'attacker@unknown-scan.net',
          userRole: 'Guest',
          company: null,
          companyName: 'External',
          action: 'LOGIN_FAILED',
          category: 'AUTH',
          status: 'WARNING',
          details: { email: 'superadmin_test@corp.com', reason: 'Invalid email or password' },
          endpoint: '/api/auth/login',
          method: 'POST',
          statusCode: 401,
          createdAt: new Date(Date.now() - 5 * 60 * 1000),
        },
      ];

      await AuditLog.insertMany(sampleLogs);
      console.log('Seeded sample audit logs!');
    }

    // Seed sample tickets if empty
    const ticketCount = await Ticket.countDocuments();
    if (ticketCount === 0 && user) {
      console.log('Seeding initial tickets...');
      const sampleTicket = new Ticket({
        ticketNumber: 'TICK-10001',
        subject: 'Geofence location radius error during mobile punch-in',
        category: 'Attendance & Geofencing',
        priority: 'High',
        status: 'In Progress',
        description: 'Our employees in the 3rd floor office branch are getting "Outside of geofence radius" error even when connected to office Wi-Fi and present inside the campus.',
        user: user._id,
        userName: user.name,
        userEmail: user.email,
        userRole: user.role,
        company: company?._id || null,
        companyName: company?.name || 'Global Infotech Pvt Ltd',
        assignedTo: superAdmin?._id || null,
        resolutionNotes: 'Super admin verified coordinates. Recommended increasing office geofence buffer radius from 50m to 150m in Attendance Policy settings.',
        messages: [
          {
            sender: user._id,
            senderName: user.name,
            senderRole: user.role,
            isSuperAdmin: false,
            message: 'Our employees in the 3rd floor office branch are getting "Outside of geofence radius" error even when connected to office Wi-Fi and present inside the campus.',
            createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          },
          {
            sender: superAdmin?._id || user._id,
            senderName: superAdmin?.name || 'Super Admin Support',
            senderRole: 'Super Admin',
            isSuperAdmin: true,
            message: 'Hello Vikas, we reviewed your office GPS coordinates. High-rise buildings can have GPS drift of 60-80 meters. Please increase your policy radius to 150 meters in Attendance Settings and let us know if it resolves the issue.',
            createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
          },
        ],
        lastMessageAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
      });

      await sampleTicket.save();
      console.log('Seeded sample ticket TICK-10001!');
    }

    console.log('Done!');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding:', err);
    process.exit(1);
  }
};

seed();

