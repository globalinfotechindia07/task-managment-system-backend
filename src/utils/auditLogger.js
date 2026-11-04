const AuditLog = require('../models/AuditLog');

/**
 * Record an audit log entry for user activity, work actions, or query failures.
 */
const logAudit = async ({
  req,
  user,
  company,
  action,
  category = 'SYSTEM',
  status = 'SUCCESS',
  details = '',
  endpoint = '',
  method = '',
  statusCode = 200,
}) => {
  try {
    const actor = user || req?.user;
    const comp = company || req?.user?.company;

    await AuditLog.create({
      user: actor?._id || null,
      userName: actor?.name || 'System / Anonymous',
      userEmail: actor?.email || '',
      userRole: actor?.role || 'Guest',
      company: comp?._id || comp || null,
      companyName: comp?.name || (typeof comp === 'string' ? comp : 'Global System'),
      action,
      category,
      status,
      details,
      endpoint: endpoint || req?.originalUrl || req?.url || '',
      method: method || req?.method || '',
      statusCode: statusCode || (status === 'ERROR' ? 500 : 200),
      ipAddress: req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '',
      userAgent: req?.headers?.['user-agent'] || '',
    });
  } catch (err) {
    console.error('Audit log creation failed silently:', err.message);
  }
};

module.exports = { logAudit };

