const nodemailer = require('nodemailer');

// Create reusable transporter (lazy initialization)
let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }
  return transporter;
};

// Send email notification
const sendEmail = async ({ to, subject, html }) => {
  try {
    // Skip email in development if not configured
    if (!process.env.EMAIL_USER || process.env.EMAIL_USER === 'your_email@gmail.com') {
      console.log(`[Email Skipped] To: ${to} | Subject: ${subject}`);
      return { success: true, skipped: true };
    }

    const info = await getTransporter().sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject,
      html
    });

    console.log(`[Email Sent] To: ${to} | MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[Email Error] ${error.message}`);
    return { success: false, error: error.message };
  }
};

// Notification templates
const notifyAdminNewReport = async (report, user) => {
  const severityColors = {
    low: '#10b981', medium: '#f59e0b', high: '#f97316', critical: '#ef4444'
  };
  const color = severityColors[report.severity] || '#6b7280';

  return sendEmail({
    to: process.env.ADMIN_EMAIL,
    subject: `🚨 New Emergency Report: ${report.title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a2e; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">🚨 New Emergency Report</h2>
        </div>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px; font-weight: bold;">Type:</td><td style="padding: 8px; text-transform: capitalize;">${report.type}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Title:</td><td style="padding: 8px;">${report.title}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Severity:</td><td style="padding: 8px;"><span style="background: ${color}; color: white; padding: 2px 10px; border-radius: 12px; font-size: 13px;">${report.severity}</span></td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Location:</td><td style="padding: 8px;">${report.location.address}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Reported By:</td><td style="padding: 8px;">${user.name} (${user.email})</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Description:</td><td style="padding: 8px;">${report.description}</td></tr>
          </table>
          <p style="margin-top: 16px; color: #6b7280; font-size: 12px;">This is an automated alert from the Emergency Alert System.</p>
        </div>
      </div>
    `
  });
};

const notifyUserStatusUpdate = async (report, userEmail) => {
  const statusColors = {
    'Pending': '#f59e0b', 'In Progress': '#3b82f6', 'Resolved': '#10b981', 'Dismissed': '#6b7280'
  };
  const color = statusColors[report.status] || '#6b7280';

  return sendEmail({
    to: userEmail,
    subject: `📋 Report Status Updated: ${report.title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a2e; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">📋 Report Status Updated</h2>
        </div>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px;">
          <p>Your emergency report <strong>"${report.title}"</strong> has been updated.</p>
          <div style="text-align: center; margin: 20px 0;">
            <span style="background: ${color}; color: white; padding: 8px 24px; border-radius: 20px; font-size: 16px; font-weight: bold;">${report.status}</span>
          </div>
          ${report.adminNotes ? `<p><strong>Admin Notes:</strong> ${report.adminNotes}</p>` : ''}
          <p style="margin-top: 16px; color: #6b7280; font-size: 12px;">This is an automated notification from the Emergency Alert System.</p>
        </div>
      </div>
    `
  });
};

module.exports = { sendEmail, notifyAdminNewReport, notifyUserStatusUpdate };
