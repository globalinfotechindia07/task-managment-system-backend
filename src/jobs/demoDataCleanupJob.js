const cron = require('node-cron');
const { ensureDemoAccountsExist, cleanStaleDemoData } = require('../services/demoService');

/**
 * Initializes the Demo Sandbox Data Cleanup Job.
 * - Seeds/verifies demo accounts and baseline data on startup.
 * - Purges visitor-created test data older than 24 hours on startup.
 * - Runs every hour to continuously maintain a 24-hour rolling cleanup of demo data.
 */
const initDemoDataCleanupJob = async () => {
  try {
    console.log('[Demo Sandbox] Initializing Demo Accounts & 24h Auto-Cleanup Job...');
    
    // 1. Ensure demo accounts exist on boot
    await ensureDemoAccountsExist();

    // 2. Run initial cleanup of demo data older than 24h on boot
    await cleanStaleDemoData();

    // 3. Schedule recurring hourly check ('0 * * * *')
    cron.schedule('0 * * * *', async () => {
      console.log('[Demo Sandbox Job] Running hourly 24h demo data auto-cleanup...');
      await cleanStaleDemoData();
    });

    console.log('[Demo Sandbox] Demo 24h auto-cleanup job registered successfully.');
  } catch (error) {
    console.error('[Demo Sandbox Init Error]:', error.message);
  }
};

module.exports = initDemoDataCleanupJob;
