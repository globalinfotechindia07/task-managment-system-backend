const cron = require('node-cron');
const { generateSalary } = require('../controllers/payrollController');

// Mock req and res for the controller
const mockReq = { body: {} };
const mockRes = {
  json: (data) => console.log('Payroll Cron:', data.message),
  status: (code) => ({
    json: (data) => console.error(`Payroll Cron Error ${code}:`, data.message)
  })
};

const initMonthlyPayrollJob = () => {
  // Run at 23:55 on the last day of every month
  // Or 00:05 on the 1st of every month
  cron.schedule('5 0 1 * *', async () => {
    console.log('Running monthly automated payroll generation job...');
    try {
      const date = new Date();
      let targetMonth = date.getMonth(); // previous month
      let targetYear = date.getFullYear();
      
      if (targetMonth === 0) {
        targetMonth = 12;
        targetYear -= 1;
      }
      
      mockReq.body = { month: targetMonth, year: targetYear };
      
      await generateSalary(mockReq, mockRes);
      console.log('Monthly payroll job completed successfully.');
    } catch (error) {
      console.error('Error running monthly payroll job:', error);
    }
  });
};

module.exports = initMonthlyPayrollJob;
