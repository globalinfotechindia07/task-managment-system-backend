const cron = require('node-cron');
const AuditLog = require('../models/AuditLog');

const runAuditLogPurge = async () => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await AuditLog.deleteMany({ createdAt: { $lt: sevenDaysAgo } });
    if (result.deletedCount > 0) {
      console.log(`[AuditLog Purge Job] Successfully deleted ${result.deletedCount} audit logs older than 7 days.`);
    }
  } catch (error) {
    console.error('[AuditLog Purge Job Error]:', error.message);
  }
};

const initAuditLogCleanupJob = () => {
  // 1. Run immediate cleanup on server startup
  runAuditLogPurge();

  // 2. Schedule recurring cleanup every day at 01:00 AM ('0 1 * * *')
  cron.schedule('0 1 * * *', async () => {
    console.log('[AuditLog Purge Job] Running daily scheduled audit log cleanup...');
    await runAuditLogPurge();
  });
};

module.exports = initAuditLogCleanupJob;

