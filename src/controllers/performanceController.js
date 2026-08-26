const PerformanceLog = require('../models/PerformanceLog');
const User = require('../models/User');

// @desc    Get performance summary for all users (or filtered by department/team)
// @route   GET /api/performance/summary
// @access  Private (Admin, CTO, HR, Team Head)
const getPerformanceSummary = async (req, res) => {
  try {
    const { month, year, department } = req.query;
    
    // Base match criteria
    let matchCriteria = {};
    if (month) matchCriteria.month = parseInt(month);
    if (year) matchCriteria.year = parseInt(year);

    // Filter users if department is provided
    let userFilter = {};
    if (department) {
      userFilter.department = department;
    }
    const users = await User.find(userFilter).select('_id name email department designation profilePicture');
    const userIds = users.map(u => u._id);
    
    matchCriteria.user = { $in: userIds };

    const logs = await PerformanceLog.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: '$user',
          totalTasks: { $sum: 1 },
          onTimeTasks: { $sum: { $cond: [{ $eq: ['$status', 'OnTime'] }, 1, 0] } },
          lateTasks: { $sum: { $cond: [{ $eq: ['$status', 'Late'] }, 1, 0] } },
          totalDaysLate: { $sum: '$daysLate' }
        }
      }
    ]);

    const summary = users.map(user => {
      const userStat = logs.find(log => log._id.toString() === user._id.toString());
      return {
        user: user,
        stats: userStat || {
          totalTasks: 0,
          onTimeTasks: 0,
          lateTasks: 0,
          totalDaysLate: 0
        }
      };
    });

    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get detailed performance logs for a specific user
// @route   GET /api/performance/logs/:userId
// @access  Private (Admin, CTO, HR, Team Head)
const getUserPerformanceLogs = async (req, res) => {
  try {
    const { month, year } = req.query;
    const userId = req.params.userId;
    
    let filter = { user: userId };
    if (month) filter.month = parseInt(month);
    if (year) filter.year = parseInt(year);

    const logs = await PerformanceLog.find(filter)
      .populate('task', 'title status estimatedTimeDuration')
      .sort({ completedAt: -1 });
      
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getPerformanceSummary,
  getUserPerformanceLogs
};
