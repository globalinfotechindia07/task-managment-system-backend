const cron = require('node-cron');
const PerformanceLog = require('../models/PerformanceLog');
const User = require('../models/User');
const { sendPerformanceReportEmail } = require('../utils/emailService');

const initMonthlyReportJob = () => {
  // Run at 00:00 on the 1st of every month
  cron.schedule('0 0 1 * *', async () => {
    console.log('Running monthly performance report job...');
    try {
      const date = new Date();
      // Calculate previous month
      let targetMonth = date.getMonth(); // 0-indexed, so getMonth() is the previous month's 1-indexed number
      let targetYear = date.getFullYear();
      
      if (targetMonth === 0) {
        targetMonth = 12;
        targetYear -= 1;
      }

      const users = await User.find({ role: { $ne: 'Admin' } }); // Skip sending to system admins if preferred

      for (const user of users) {
        const logs = await PerformanceLog.find({
          user: user._id,
          month: targetMonth,
          year: targetYear
        });

        if (logs.length > 0) {
          const stats = {
            totalTasks: logs.length,
            onTimeTasks: logs.filter(l => l.status === 'OnTime').length,
            lateTasks: logs.filter(l => l.status === 'Late').length,
            totalDaysLate: logs.reduce((acc, l) => acc + (l.daysLate || 0), 0)
          };
          
          await sendPerformanceReportEmail(user, stats);
        }
      }
      
      console.log('Monthly performance report job completed successfully.');
    } catch (error) {
      console.error('Error running monthly performance report job:', error);
    }
  });
};

module.exports = initMonthlyReportJob;
