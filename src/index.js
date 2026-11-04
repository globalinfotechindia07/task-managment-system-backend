const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// Load env vars if any
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const path = require('path');
const initMonthlyReportJob = require('./jobs/monthlyReportJob');
const initMonthlyPayrollJob = require('./jobs/monthlyPayrollJob');
const initAuditLogCleanupJob = require('./jobs/auditLogCleanupJob');

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/tasks', require('./routes/taskRoutes'));
app.use('/api/announcements', require('./routes/announcementRoutes'));
app.use('/api/push', require('./routes/pushRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));
app.use('/api/projects', require('./routes/projectRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/performance', require('./routes/performanceRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/payroll', require('./routes/payrollRoutes'));
app.use('/api/companies', require('./routes/companyRoutes'));
app.use('/api/plans', require('./routes/subscriptionPlanRoutes'));
app.use('/api/site-content', require('./routes/siteContentRoutes'));
app.use('/api/roles', require('./routes/roleRoutes'));
app.use('/api/audit-logs', require('./routes/auditLogRoutes'));
app.use('/api/tickets', require('./routes/ticketRoutes'));
app.use('/api/crm', require('./routes/crmRoutes'));
app.use('/api/sprints', require('./routes/sprintRoutes'));
app.use('/api/integrations', require('./routes/integrationRoutes'));

// Serve static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Error handler middleware (auto-logs failed queries & exceptions to AuditLog)
const { logAudit } = require('./utils/auditLogger');

app.use((err, req, res, next) => {
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : (err.statusCode || 500);

  // Automatically record audit log for query / server errors
  logAudit({
    req,
    action: err.name === 'MongoServerError' || err.name === 'CastError' || err.name === 'ValidationError'
      ? 'QUERY_FAILED'
      : 'API_ERROR',
    category: err.name && err.name.includes('Mongo') ? 'DATABASE' : 'SYSTEM',
    status: 'ERROR',
    statusCode,
    details: {
      name: err.name,
      message: err.message,
      stack: process.env.NODE_ENV === 'production' ? null : err.stack,
      body: req.body ? { ...req.body, password: req.body.password ? '***' : undefined } : null,
      query: req.query,
      params: req.params,
    },
  });

  res.status(statusCode).json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
});

const http = require('http');
const { initSocket } = require('./utils/socketService');

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
initSocket(server);

// Initialize Cron Jobs
initMonthlyReportJob();
initMonthlyPayrollJob();
initAuditLogCleanupJob();

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => console.log(`Server started on port ${PORT}`));
