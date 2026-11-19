const Company = require('../models/Company');
const EmailLog = require('../models/EmailLog');
const { testSmtpConnection } = require('../utils/emailService');
const { logAudit } = require('../utils/auditLogger');

// Helper to get company ID from user/request
const getUserCompanyId = async (req) => {
  if (req.query?.companyId || req.body?.companyId) {
    return req.query.companyId || req.body.companyId;
  }
  const user = req.user;
  const direct = req.companyId || user?.company?._id || user?.company;
  if (direct) return direct;
  if (user?.role === 'Super Admin') {
    const firstCompany = await Company.findOne({ status: 'Active' }).select('_id');
    return firstCompany?._id || null;
  }
  return null;
};

// @desc    Get company's current SMTP email settings
// @route   GET /api/company/email-settings
// @access  Private (Admin / CTO)
const getCompanySmtpSettings = async (req, res) => {
  try {
    const companyId = await getUserCompanyId(req);
    if (!companyId) {
      return res.status(400).json({ message: 'User must belong to a company' });
    }

    const company = await Company.findById(companyId).select('name contactEmail smtpSettings');
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    const smtp = company.smtpSettings || {};
    const hasPassword = Boolean(smtp.auth?.pass && smtp.auth.pass.trim().length > 0);

    res.json({
      success: true,
      company: {
        _id: company._id,
        name: company.name,
        contactEmail: company.contactEmail,
      },
      smtpSettings: {
        enabled: Boolean(smtp.enabled),
        host: smtp.host || '',
        port: smtp.port || 587,
        secure: Boolean(smtp.secure),
        authUser: smtp.auth?.user || '',
        hasPassword,
        fromName: smtp.fromName || company.name || '',
        fromEmail: smtp.fromEmail || smtp.auth?.user || company.contactEmail || '',
        tlsRejectUnauthorized: Boolean(smtp.tlsRejectUnauthorized),
        lastTestedAt: smtp.lastTestedAt || null,
        lastTestStatus: smtp.lastTestStatus || 'None',
        lastTestError: smtp.lastTestError || '',
      },
    });
  } catch (error) {
    console.error('Error in getCompanySmtpSettings:', error);
    res.status(500).json({ message: 'Failed to fetch email settings', error: error.message });
  }
};

// @desc    Update company's SMTP email settings
// @route   PUT /api/company/email-settings
// @access  Private (Admin / CTO)
const updateCompanySmtpSettings = async (req, res) => {
  try {
    const companyId = await getUserCompanyId(req);
    if (!companyId) {
      return res.status(400).json({ message: 'User must belong to a company' });
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    const {
      enabled,
      host,
      port,
      secure,
      authUser,
      authPass,
      fromName,
      fromEmail,
      tlsRejectUnauthorized,
    } = req.body;

    if (!company.smtpSettings) {
      company.smtpSettings = {};
    }
    if (!company.smtpSettings.auth) {
      company.smtpSettings.auth = {};
    }

    if (enabled !== undefined) company.smtpSettings.enabled = Boolean(enabled);
    if (host !== undefined) company.smtpSettings.host = host.trim();
    if (port !== undefined) company.smtpSettings.port = Number(port) || 587;
    if (secure !== undefined) company.smtpSettings.secure = Boolean(secure);
    if (authUser !== undefined) company.smtpSettings.auth.user = authUser.trim();

    // If new password provided and not masked bullets, update password
    if (authPass && !authPass.includes('••••')) {
      company.smtpSettings.auth.pass = authPass.trim();
    }

    if (fromName !== undefined) company.smtpSettings.fromName = fromName.trim();
    if (fromEmail !== undefined) company.smtpSettings.fromEmail = fromEmail.trim();
    if (tlsRejectUnauthorized !== undefined)
      company.smtpSettings.tlsRejectUnauthorized = Boolean(tlsRejectUnauthorized);

    await company.save();

    logAudit({
      req,
      action: 'COMPANY_SMTP_UPDATED',
      category: 'COMPANY',
      status: 'SUCCESS',
      details: {
        enabled: company.smtpSettings.enabled,
        host: company.smtpSettings.host,
        authUser: company.smtpSettings.auth.user,
        fromEmail: company.smtpSettings.fromEmail,
      },
    });

    res.json({
      success: true,
      message: 'Company SMTP settings saved successfully.',
      smtpSettings: {
        enabled: company.smtpSettings.enabled,
        host: company.smtpSettings.host,
        port: company.smtpSettings.port,
        secure: company.smtpSettings.secure,
        authUser: company.smtpSettings.auth.user,
        hasPassword: Boolean(company.smtpSettings.auth.pass),
        fromName: company.smtpSettings.fromName,
        fromEmail: company.smtpSettings.fromEmail,
        tlsRejectUnauthorized: company.smtpSettings.tlsRejectUnauthorized,
        lastTestedAt: company.smtpSettings.lastTestedAt,
        lastTestStatus: company.smtpSettings.lastTestStatus,
        lastTestError: company.smtpSettings.lastTestError,
      },
    });
  } catch (error) {
    console.error('Error in updateCompanySmtpSettings:', error);
    res.status(500).json({ message: 'Failed to update email settings', error: error.message });
  }
};

// @desc    Test SMTP connection & send test email
// @route   POST /api/company/email-settings/test
// @access  Private (Admin / CTO)
const testCompanySmtpSettings = async (req, res) => {
  try {
    const companyId = await getUserCompanyId(req);
    if (!companyId) {
      return res.status(400).json({ message: 'User must belong to a company' });
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    const {
      host,
      port,
      secure,
      authUser,
      authPass,
      fromName,
      fromEmail,
      tlsRejectUnauthorized,
      testRecipient,
    } = req.body;

    // Use passed credentials or fall back to saved credentials
    const targetHost = host || company.smtpSettings?.host;
    const targetPort = port || company.smtpSettings?.port || 587;
    const targetSecure = secure !== undefined ? secure : company.smtpSettings?.secure;
    const targetUser = authUser || company.smtpSettings?.auth?.user;
    const targetPass =
      authPass && !authPass.includes('••••') ? authPass : company.smtpSettings?.auth?.pass;
    const targetFromName = fromName || company.smtpSettings?.fromName || company.name;
    const targetFromEmail = fromEmail || company.smtpSettings?.fromEmail || targetUser;
    const targetTls =
      tlsRejectUnauthorized !== undefined
        ? tlsRejectUnauthorized
        : company.smtpSettings?.tlsRejectUnauthorized;

    const recipient = testRecipient && testRecipient.trim() ? testRecipient.trim() : req.user.email;

    if (!targetHost || !targetUser || !targetPass) {
      return res.status(400).json({
        message: 'SMTP Host, username/email, and password are required to test connection.',
      });
    }

    try {
      await testSmtpConnection(
        {
          host: targetHost,
          port: targetPort,
          secure: targetSecure,
          auth: {
            user: targetUser,
            pass: targetPass,
          },
          fromName: targetFromName,
          fromEmail: targetFromEmail,
          tlsRejectUnauthorized: targetTls,
        },
        recipient
      );

      // Record success in company settings
      if (company.smtpSettings) {
        company.smtpSettings.lastTestedAt = new Date();
        company.smtpSettings.lastTestStatus = 'Success';
        company.smtpSettings.lastTestError = '';
        await company.save();
      }

      logAudit({
        req,
        action: 'COMPANY_SMTP_TEST_SUCCESS',
        category: 'COMPANY',
        status: 'SUCCESS',
        details: { host: targetHost, recipient },
      });

      res.json({
        success: true,
        message: `SMTP connection verified successfully! A test email has been delivered to ${recipient}.`,
        testedAt: new Date(),
      });
    } catch (testErr) {
      console.error('SMTP test connection failed:', testErr.message);

      // Record failure in company settings
      if (company.smtpSettings) {
        company.smtpSettings.lastTestedAt = new Date();
        company.smtpSettings.lastTestStatus = 'Failed';
        company.smtpSettings.lastTestError = testErr.message;
        await company.save();
      }

      logAudit({
        req,
        action: 'COMPANY_SMTP_TEST_FAILED',
        category: 'COMPANY',
        status: 'FAILED',
        details: { host: targetHost, recipient, error: testErr.message },
      });

      let helpfulHint = '';
      const msg = testErr.message.toLowerCase();
      if (msg.includes('535') || msg.includes('badcredentials') || msg.includes('username and password not accepted')) {
        helpfulHint =
          'Authentication failed. If you are using Gmail, please create and use a 16-character Google App Password (not your normal Gmail account password). Ensure 2-Step Verification is enabled in your Google Account security settings.';
      } else if (msg.includes('etimedout') || msg.includes('econnrefused')) {
        helpfulHint =
          'Connection timed out or refused. Please verify your SMTP Host and Port. Common ports are 587 (TLS/STARTTLS) and 465 (SSL).';
      }

      res.status(400).json({
        success: false,
        message: 'SMTP connection or authentication failed.',
        error: testErr.message,
        hint: helpfulHint,
      });
    }
  } catch (error) {
    console.error('Error in testCompanySmtpSettings:', error);
    res.status(500).json({ message: 'Internal server error during SMTP test', error: error.message });
  }
};

// @desc    Get company's recent email delivery logs
// @route   GET /api/company/email-settings/logs
// @access  Private (Admin / CTO)
const getCompanyEmailLogs = async (req, res) => {
  try {
    const companyId = await getUserCompanyId(req);
    if (!companyId) {
      return res.json({ success: true, count: 0, logs: [] });
    }

    const logs = await EmailLog.find({ company: companyId })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      count: logs.length,
      logs: logs || [],
    });
  } catch (error) {
    console.error('Error fetching email logs:', error);
    res.status(500).json({ message: 'Failed to fetch email logs', error: error.message });
  }
};

module.exports = {
  getCompanySmtpSettings,
  updateCompanySmtpSettings,
  testCompanySmtpSettings,
  getCompanyEmailLogs,
};
