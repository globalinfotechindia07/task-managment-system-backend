const nodemailer = require('nodemailer');
const EmailLog = require('../models/EmailLog');

// Configure the transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || 'globalinfotechindia07@gmail.com',
    pass: process.env.SMTP_PASS || 'milp oeru ubrf grtm'
  },
  tls: {
    rejectUnauthorized: false
  }
});

/**
 * Core function to send an email and log it
 */
const sendEmail = async (to, subject, html) => {
  const mailOptions = {
    from: '"Global Infotech" <globalinfotechindia07@gmail.com>',
    to,
    subject,
    html
  };

  try {
    await transporter.sendMail(mailOptions);
    await EmailLog.create({
      recipient: to,
      subject,
      body: html,
      status: 'Sent'
    });
    console.log(`Email sent successfully to ${to}`);
  } catch (error) {
    console.error(`Error sending email to ${to}:`, error);
    await EmailLog.create({
      recipient: to,
      subject,
      body: html,
      status: 'Failed',
      error: error.message
    });
  }
};

/**
 * Send an email notification when a task is assigned
 */
const sendTaskAssignmentEmail = async (task, assignedUser, assignedBy) => {
  if (!assignedUser || !assignedUser.email) return;

  const subject = `New Task Assigned: ${task.title}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #4f46e5;">New Task Assignment</h2>
      <p>Hello <strong>${assignedUser.name}</strong>,</p>
      <p>A new task has been assigned to you by <strong>${assignedBy.name}</strong> (Team Head).</p>
      
      <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #1e293b;">${task.title}</h3>
        <p style="color: #475569; font-size: 14px;">${task.description}</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;"><strong>Priority:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a;">${task.priority}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;"><strong>Start Date:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a;">${task.startDate ? new Date(task.startDate).toLocaleString() : 'Not set'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;"><strong>Due Date:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a;">${task.dueDate ? new Date(task.dueDate).toLocaleString() : 'Not set'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b;"><strong>Estimated Duration:</strong></td>
            <td style="padding: 8px 0; color: #0f172a;">${task.estimatedTimeDuration ? task.estimatedTimeDuration + ' Hours' : 'Not set'}</td>
          </tr>
        </table>
      </div>
      
      <div style="text-align: center; margin-top: 30px;">
        <a href="http://localhost:5174/user/tasks" style="background-color: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Task Details</a>
      </div>
    </div>
  `;

  await sendEmail(assignedUser.email, subject, html);
};

/**
 * Send an email notification for a new announcement
 */
const sendAnnouncementEmail = async (announcement, users) => {
  if (!users || users.length === 0) return;

  const subject = `Company Announcement: ${announcement.title}`;

  const attachmentsHtml = announcement.attachments && announcement.attachments.length > 0
    ? `<p style="font-size: 13px; color: #64748b; margin-top: 20px;"><em>This announcement includes attached files. Please log in to view them.</em></p>`
    : '';

  const priorityStyle = announcement.priority === 'High' ? 'color: #ef4444; font-weight: bold;' : 'color: #0f172a;';

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
        <a href="http://localhost:5174/" style="background-color: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">Log in to Portal</a>
      </div>
    </div>
  `;

  // Send to all users concurrently
  const emailPromises = users.map(user => {
    if (user.email) {
      return sendEmail(user.email, subject, htmlTemplate);
    }
    return Promise.resolve();
  });

  await Promise.allSettled(emailPromises);
};

module.exports = {
  sendTaskAssignmentEmail,
  sendAnnouncementEmail
};
