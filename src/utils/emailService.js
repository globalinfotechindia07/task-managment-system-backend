const nodemailer = require('nodemailer');
const EmailLog = require('../models/EmailLog');
const Company = require('../models/Company');

// Global Fallback Transporter (Super Admin / Platform Default)
const defaultTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true' || false,
  auth: {
    user: process.env.SMTP_USER || 'globalinfotechindia07@gmail.com',
    pass: process.env.SMTP_PASS || 'milp oeru ubrf grtm',
  },
  tls: {
    rejectUnauthorized: false,
  },
});

/**
 * Resolves the appropriate transporter and sender header for a company.
 * If the company has configured custom SMTP and enabled it, use that.
 * Otherwise, falls back to the system's global SMTP.
 */
const getTransporterForCompany = async (companyId) => {
  if (companyId) {
    try {
      const company = await Company.findById(companyId);
      if (
        company &&
        company.smtpSettings &&
        company.smtpSettings.enabled &&
        company.smtpSettings.host &&
        company.smtpSettings.auth?.user &&
        company.smtpSettings.auth?.pass
      ) {
        const { host, port, secure, auth, fromName, fromEmail, tlsRejectUnauthorized } =
          company.smtpSettings;

        const customTransporter = nodemailer.createTransport({
          host: host.trim(),
          port: Number(port) || 587,
          secure: Boolean(secure),
          auth: {
            user: auth.user.trim(),
            pass: auth.pass.trim(),
          },
          tls: {
            rejectUnauthorized: Boolean(tlsRejectUnauthorized),
          },
        });

        const senderName = fromName ? fromName.trim() : company.name || 'Company Portal';
        const senderAddress = fromEmail ? fromEmail.trim() : auth.user.trim();
        const fromHeader = `"${senderName}" <${senderAddress}>`;

        return {
          transporter: customTransporter,
          from: fromHeader,
          senderType: 'CompanySMTP',
          companyId: company._id,
          companyName: company.name,
        };
      }
    } catch (err) {
      console.warn(`Failed to resolve company custom SMTP for ${companyId}, falling back to default:`, err.message);
    }
  }

  // Fallback to global default
  return {
    transporter: defaultTransporter,
    from: `"${process.env.SMTP_FROM_NAME || 'Platform Admin'}" <${process.env.SMTP_USER || 'globalinfotechindia07@gmail.com'}>`,
    senderType: 'GlobalSMTP',
    companyId: companyId || null,
    companyName: 'Company Portal',
  };
};

/**
 * Core function to send an email and log it.
 * Accepts options or companyId as the 4th parameter.
 */
const sendEmail = async (to, subject, html, options = {}) => {
  // Extract companyId if passed as a string/ObjectId or within options object
  let companyId = null;
  let customFrom = null;

  if (typeof options === 'string' || options?._bsontype === 'ObjectID' || options?._id) {
    companyId = options._id || options;
  } else if (typeof options === 'object') {
    companyId = options.companyId || options.company || null;
    customFrom = options.from || null;
  }

  const { transporter, from, senderType, companyId: resolvedCompanyId } =
    await getTransporterForCompany(companyId);

  const mailOptions = {
    from: customFrom || from,
    to,
    subject,
    html,
  };

  try {
    await transporter.sendMail(mailOptions);
    await EmailLog.create({
      company: resolvedCompanyId || undefined,
      from: mailOptions.from,
      recipient: to,
      subject,
      body: html,
      senderType,
      status: 'Sent',
    });
    console.log(`[${senderType}] Email successfully sent to ${to} ("${subject}")`);
    return { success: true, senderType, from: mailOptions.from };
  } catch (error) {
    console.error(`[${senderType}] Error sending email to ${to}:`, error.message);
    await EmailLog.create({
      company: resolvedCompanyId || undefined,
      from: mailOptions.from,
      recipient: to,
      subject,
      body: html,
      senderType,
      status: 'Failed',
      error: error.message,
    });
    return { success: false, error: error.message };
  }
};

/**
 * Test SMTP connection & send a test email.
 */
const testSmtpConnection = async (smtpConfig, testRecipient) => {
  const { host, port, secure, auth, fromName, fromEmail, tlsRejectUnauthorized } = smtpConfig;

  if (!host || !auth?.user || !auth?.pass) {
    throw new Error('Host, username/email, and password are required to test SMTP connection.');
  }

  const testTransporter = nodemailer.createTransport({
    host: host.trim(),
    port: Number(port) || 587,
    secure: Boolean(secure),
    auth: {
      user: auth.user.trim(),
      pass: auth.pass.trim(),
    },
    tls: {
      rejectUnauthorized: Boolean(tlsRejectUnauthorized),
    },
    connectionTimeout: 10000, // 10s timeout
  });

  // Verify credentials & connection
  await testTransporter.verify();

  // If test recipient provided, send a verification email
  if (testRecipient && testRecipient.trim()) {
    const senderName = fromName ? fromName.trim() : 'Company Portal';
    const senderAddress = fromEmail ? fromEmail.trim() : auth.user.trim();
    const fromHeader = `"${senderName}" <${senderAddress}>`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #4f46e5; margin: 0;">SMTP Verification Successful</h2>
          <p style="color: #64748b; font-size: 14px; margin-top: 6px;">Your company custom email gateway is working perfectly!</p>
        </div>
        
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin-bottom: 24px;">
          <h4 style="margin: 0 0 12px 0; color: #1e293b; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Connection Parameters</h4>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 6px 0; color: #64748b;"><strong>SMTP Host:</strong></td>
              <td style="padding: 6px 0; color: #0f172a; font-family: monospace;">${host}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;"><strong>Port / Secure:</strong></td>
              <td style="padding: 6px 0; color: #0f172a; font-family: monospace;">${port} (${secure ? 'SSL/TLS' : 'STARTTLS'})</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;"><strong>Sender Email:</strong></td>
              <td style="padding: 6px 0; color: #0f172a; font-family: monospace;">${senderAddress}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;"><strong>Sender Name:</strong></td>
              <td style="padding: 6px 0; color: #0f172a;">${senderName}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;"><strong>Delivered At:</strong></td>
              <td style="padding: 6px 0; color: #0f172a;">${new Date().toLocaleString()}</td>
            </tr>
          </table>
        </div>

        <p style="font-size: 13px; color: #475569; line-height: 1.6;">
          All future company emails (task assignments, announcements, monthly reports, ticket notifications, and alerts) for your staff and users will now be dispatched directly from your company's email address.
        </p>

        <div style="border-top: 1px solid #e2e8f0; margin-top: 24px; padding-top: 16px; text-align: center; font-size: 12px; color: #94a3b8;">
          Sent by Company Management System
        </div>
      </div>
    `;

    await testTransporter.sendMail({
      from: fromHeader,
      to: testRecipient.trim(),
      subject: `[SMTP Test] Verification email from ${senderName}`,
      html,
    });
  }

  return { success: true, message: 'SMTP credentials verified successfully.' };
};

/**
 * Send an email notification when a task is assigned.
 */
const sendTaskAssignmentEmail = async (task, assignedUser, assignedBy) => {
  if (!assignedUser || !assignedUser.email) return;

  const companyId =
    task.company ||
    assignedBy?.company?._id ||
    assignedBy?.company ||
    assignedUser?.company?._id ||
    assignedUser?.company;

  const subject = `New Task Assigned: ${task.title}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #4f46e5;">New Task Assignment</h2>
      <p>Hello <strong>${assignedUser.name}</strong>,</p>
      <p>A new task has been assigned to you by <strong>${assignedBy.name}</strong>.</p>
      
      <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #1e293b;">${task.title}</h3>
        <p style="color: #475569; font-size: 14px;">${task.description || 'No description provided.'}</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;"><strong>Priority:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a;">${task.priority || 'Medium'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;"><strong>Start Date:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a;">${task.startDate ? new Date(task.startDate).toLocaleString() : 'Not set'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;"><strong>Due Date:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a;">${task.dueDate ? new Date(task.dueDate).toLocaleString() : 'Not set'}</td>
          </tr>
        </table>
      </div>
      
      <div style="text-align: center; margin-top: 30px;">
        <a href="http://localhost:5174/admin/tasks" style="background-color: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View Task Details</a>
      </div>
    </div>
  `;

  await sendEmail(assignedUser.email, subject, html, { companyId });
};

/**
 * Send an email notification for a new announcement.
 */
const sendAnnouncementEmail = async (announcement, users, author) => {
  if (!users || users.length === 0) return;

  const companyId = announcement.company || author?.company?._id || author?.company;
  const subject = `Company Announcement: ${announcement.title}`;

  const attachmentsHtml =
    announcement.attachments && announcement.attachments.length > 0
      ? `<p style="font-size: 13px; color: #64748b; margin-top: 20px;"><em>This announcement includes attached files. Please log in to view them.</em></p>`
      : '';

  const priorityStyle =
    announcement.priority === 'High' ? 'color: #ef4444; font-weight: bold;' : 'color: #0f172a;';

  const htmlTemplate = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #4f46e5;">New Announcement</h2>
      
      <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #1e293b;">${announcement.title}</h3>
        <div style="color: #475569; font-size: 14px; white-space: pre-wrap;">${announcement.content}</div>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px;">
          <tr>
            <td style="padding: 8px 0; border-top: 1px solid #e2e8f0; color: #64748b;"><strong>Priority:</strong></td>
            <td style="padding: 8px 0; border-top: 1px solid #e2e8f0; ${priorityStyle}">${announcement.priority || 'Normal'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-top: 1px solid #e2e8f0; color: #64748b;"><strong>Date Published:</strong></td>
            <td style="padding: 8px 0; border-top: 1px solid #e2e8f0; color: #0f172a;">${new Date().toLocaleString()}</td>
          </tr>
        </table>
        ${attachmentsHtml}
      </div>
      
      <div style="text-align: center; margin-top: 30px;">
        <a href="http://localhost:5174/admin/announcements" style="background-color: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View in Portal</a>
      </div>
    </div>
  `;

  const emailPromises = users.map((user) => {
    if (user.email) {
      return sendEmail(user.email, subject, htmlTemplate, { companyId });
    }
    return Promise.resolve();
  });

  await Promise.allSettled(emailPromises);
};

/**
 * Send monthly performance report email.
 */
const sendPerformanceReportEmail = async (user, stats) => {
  if (!user || !user.email) return;

  const companyId = user.company?._id || user.company;
  const subject = `Monthly Performance Report: ${new Date().toLocaleString('default', { month: 'long' })}`;

  const performanceStatus = stats.lateTasks > 0 ? 'Needs Improvement' : 'Excellent';
  const statusColor = stats.lateTasks > 0 ? '#ef4444' : '#10b981';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #4f46e5;">Monthly Performance Report</h2>
      <p>Hello <strong>${user.name}</strong>,</p>
      <p>Here is your automated performance analysis for the last month.</p>
      
      <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #1e293b;">Task Analytics</h3>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;"><strong>Total Tasks Completed:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a;">${stats.totalTasks}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #10b981;"><strong>On-Time Completions:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #10b981;">${stats.onTimeTasks}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #ef4444;"><strong>Overdue Completions:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #ef4444;">${stats.lateTasks}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;"><strong>Total Days Late:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a;">${stats.totalDaysLate} Days</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b;"><strong>Overall Status:</strong></td>
            <td style="padding: 8px 0; font-weight: bold; color: ${statusColor};">${performanceStatus}</td>
          </tr>
        </table>
      </div>
      
      <div style="text-align: center; margin-top: 30px;">
        <a href="http://localhost:5174/admin/performance" style="background-color: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View Performance Dashboard</a>
      </div>
    </div>
  `;

  await sendEmail(user.email, subject, html, { companyId });
};

/**
 * Send an email with login credentials to a newly onboarded user.
 */
const sendWelcomeUserEmail = async (user, rawPassword, companyId) => {
  if (!user || !user.email) return;

  const resolvedCompanyId = companyId || user.company?._id || user.company;
  let companyName = 'Company Portal';
  try {
    if (resolvedCompanyId) {
      const company = await Company.findById(resolvedCompanyId).select('name');
      if (company?.name) companyName = company.name;
    }
  } catch (err) {
    // ignore
  }

  const subject = `Welcome to ${companyName} - Your Account Credentials`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #4f46e5; margin: 0 0 12px 0;">Welcome to ${companyName}!</h2>
      <p style="color: #334155; font-size: 14px;">Hello <strong>${user.name}</strong>,</p>
      <p style="color: #475569; font-size: 14px;">Your user account has been successfully created. You can now log into your workspace with the credentials below:</p>

      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Portal Login URL:</strong></td>
            <td style="padding: 6px 0; color: #4f46e5; font-family: monospace;">http://localhost:5174/login</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Username / Email:</strong></td>
            <td style="padding: 6px 0; color: #0f172a; font-family: monospace;">${user.email}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Temporary Password:</strong></td>
            <td style="padding: 6px 0; color: #0f172a; font-family: monospace; font-weight: bold;">${rawPassword}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Assigned Role:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">${user.role}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Designation:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">${user.designation || 'Staff'}</td>
          </tr>
        </table>
      </div>

      <div style="text-align: center; margin-top: 25px;">
        <a href="http://localhost:5174/login" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Log in to Workspace</a>
      </div>

      <p style="font-size: 12px; color: #94a3b8; margin-top: 30px; text-align: center;">
        Please change your password after logging in for security.
      </p>
    </div>
  `;

  await sendEmail(user.email, subject, html, { companyId: resolvedCompanyId });
};

module.exports = {
  sendEmail,
  testSmtpConnection,
  getTransporterForCompany,
  sendTaskAssignmentEmail,
  sendAnnouncementEmail,
  sendPerformanceReportEmail,
  sendWelcomeUserEmail,
};
