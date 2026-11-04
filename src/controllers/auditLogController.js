const AuditLog = require('../models/AuditLog');
const User = require('../models/User');

// @desc    Get paginated audit logs with search and filters
// @route   GET /api/audit-logs
// @access  Private (Super Admin)
const getAuditLogs = async (req, res) => {
  try {
    const {
      search,
      category,
      status,
      company,
      startDate,
      endDate,
      page = 1,
      limit = 25,
    } = req.query;

    const query = {};

    // Filter by category
    if (category && category !== 'ALL') {
      query.category = category;
    }

    // Filter by status (SUCCESS, WARNING, ERROR)
    if (status && status !== 'ALL') {
      query.status = status;
    }

    // Filter by company/tenant
    if (company && company !== 'ALL') {
      query.company = company;
    }

    // Strict 7-day retention constraint: only return logs within the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Filter by date range (capped within last 7 days)
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        query.createdAt.$gte = start > sevenDaysAgo ? start : sevenDaysAgo;
      } else {
        query.createdAt.$gte = sevenDaysAgo;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    } else {
      query.createdAt = { $gte: sevenDaysAgo };
    }

    // Keyword search
    if (search && search.trim()) {
      const s = search.trim();
      query.$or = [
        { action: { $regex: s, $options: 'i' } },
        { userName: { $regex: s, $options: 'i' } },
        { userEmail: { $regex: s, $options: 'i' } },
        { companyName: { $regex: s, $options: 'i' } },
        { endpoint: { $regex: s, $options: 'i' } },
      ];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 25;
    const skip = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    res.json({
      success: true,
      logs,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum) || 1,
    });
  } catch (error) {
    console.error('Error in getAuditLogs:', error);
    res.status(500).json({ message: 'Failed to retrieve audit logs', error: error.message });
  }
};

// @desc    Get aggregate audit stats & user activity insights
// @route   GET /api/audit-logs/stats
// @access  Private (Super Admin)
const getAuditStats = async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalLogs,
      todayLogsCount,
      failedQueriesCount,
      activeUsersTodayArr,
      workActionsTodayCount,
      recentErrors,
      categoryStats,
    ] = await Promise.all([
      AuditLog.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      AuditLog.countDocuments({ createdAt: { $gte: todayStart } }),
      AuditLog.countDocuments({
        createdAt: { $gte: sevenDaysAgo },
        $or: [{ status: 'ERROR' }, { action: { $regex: 'FAIL|ERROR', $options: 'i' } }],
      }),
      AuditLog.distinct('user', {
        user: { $ne: null },
        createdAt: { $gte: todayStart },
      }),
      AuditLog.countDocuments({
        category: { $in: ['WORK', 'ATTENDANCE', 'PAYROLL'] },
        createdAt: { $gte: todayStart },
      }),
      AuditLog.find({
        createdAt: { $gte: sevenDaysAgo },
        $or: [{ status: 'ERROR' }, { action: { $regex: 'FAIL|ERROR', $options: 'i' } }],
      })
        .sort({ createdAt: -1 })
        .limit(6)
        .lean(),
      AuditLog.aggregate([
        {
          $match: { createdAt: { $gte: sevenDaysAgo } },
        },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Total registered users across system
    const totalUsersInSystem = await User.countDocuments();

    res.json({
      success: true,
      stats: {
        totalLogs,
        todayLogsCount,
        failedQueriesCount,
        activeUsersToday: activeUsersTodayArr.length,
        totalUsersInSystem,
        workActionsToday: workActionsTodayCount,
        categoryStats,
        recentErrors,
      },
    });
  } catch (error) {
    console.error('Error in getAuditStats:', error);
    res.status(500).json({ message: 'Failed to compute audit stats', error: error.message });
  }
};

// @desc    Clear logs older than specified days (Default: 7 days)
// @route   DELETE /api/audit-logs/cleanup
// @access  Private (Super Admin)
const clearOldLogs = async (req, res) => {
  try {
    const days = parseInt(req.query.days || 7, 10);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await AuditLog.deleteMany({ createdAt: { $lt: cutoff } });

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} audit logs older than ${days} days.`,
    });
  } catch (error) {
    console.error('Error in clearOldLogs:', error);
    res.status(500).json({ message: 'Failed to cleanup old audit logs', error: error.message });
  }
};

module.exports = {
  getAuditLogs,
  getAuditStats,
  clearOldLogs,
};

