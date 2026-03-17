/**
 * J&M Serenity Spa — Email Helper (Nodemailer)
 * Sends booking confirmations and cancellation/reschedule links.
 * If SMTP is not configured, emails are silently skipped.
 */

const nodemailer = require("nodemailer");
const db = require("./db");

function getTransporter() {
  const settings = db.getAllSettings();
  if (!settings.smtp_host || !settings.smtp_user) return null;

  return nodemailer.createTransport({
    host: settings.smtp_host,
    port: parseInt(settings.smtp_port || "587", 10),
    secure: parseInt(settings.smtp_port || "587", 10) === 465,
    auth: {
      user: settings.smtp_user,
      pass: settings.smtp_pass,
    },
  });
}

function getFromAddress() {
  const settings = db.getAllSettings();
  return settings.smtp_from || settings.smtp_user || settings.email || "noreply@jmserenityspa.com";
}

async function sendBookingConfirmation(booking, addons, baseUrl) {
  const transporter = getTransporter();
  if (!transporter || !booking.client_email) return;

  const settings = db.getAllSettings();
  const spaName = settings.spa_name || "J&M Serenity Spa";
  const addonList = addons.length > 0
    ? addons.map(a => a.name + " (+$" + a.price + ")").join(", ")
    : "None";

  const cancelUrl = baseUrl + "/booking/manage/" + booking.cancel_token;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1f6f78;">Your Appointment is Confirmed!</h2>
      <p>Hi ${booking.client_name},</p>
      <p>Here are your appointment details:</p>
      <table style="border-collapse: collapse; width: 100%; margin: 1rem 0;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Service</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.service_name || "—"}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Date</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.date}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Time</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.time}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Duration</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.duration} minutes</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Therapist</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.therapist_name || "Assigned at arrival"}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Add-Ons</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${addonList}</td></tr>
      </table>
      <p>
        <a href="${cancelUrl}" style="display: inline-block; padding: 10px 24px; background: #1f6f78; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold;">Manage / Cancel Appointment</a>
      </p>
      <p style="color: #666; font-size: 14px;">
        Please arrive 5–10 minutes early. Payment is due at your appointment.<br/>
        To cancel or reschedule, please give at least 24 hours' notice.
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 1.5rem 0;" />
      <p style="color: #999; font-size: 12px;">${spaName} &bull; ${settings.address || "Highlands Ranch, CO"} &bull; ${settings.phone || ""}</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${spaName}" <${getFromAddress()}>`,
      to: booking.client_email,
      subject: "Appointment Confirmed — " + spaName,
      html,
    });
    console.log("Confirmation email sent to " + booking.client_email);
  } catch (err) {
    console.error("Email send error:", err.message);
  }
}

async function sendCancellationEmail(booking) {
  const transporter = getTransporter();
  if (!transporter || !booking.client_email) return;

  const settings = db.getAllSettings();
  const spaName = settings.spa_name || "J&M Serenity Spa";

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #c0392b;">Appointment Cancelled</h2>
      <p>Hi ${booking.client_name},</p>
      <p>Your appointment on <strong>${booking.date}</strong> at <strong>${booking.time}</strong> has been cancelled.</p>
      <p>If you'd like to rebook, visit <a href="${settings.email ? '' : '/book'}">our booking page</a>.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 1.5rem 0;" />
      <p style="color: #999; font-size: 12px;">${spaName}</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${spaName}" <${getFromAddress()}>`,
      to: booking.client_email,
      subject: "Appointment Cancelled — " + spaName,
      html,
    });
  } catch (err) {
    console.error("Email send error:", err.message);
  }
}

// Generic email sender for updates/newsletters
async function sendEmail(to, subject, textMessage) {
  const transporter = getTransporter();
  if (!transporter) throw new Error("SMTP not configured");

  const settings = db.getAllSettings();
  const spaName = settings.spa_name || "J&M Serenity Spa";
  const messageHtml = textMessage.replace(/\n/g, "<br />");

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="text-align: center; padding: 1.5rem; background: linear-gradient(135deg, #1f6f78, #114a50); border-radius: 12px 12px 0 0;">
        <h2 style="color: #fff; margin: 0;">${spaName}</h2>
        <p style="color: #c9a96e; margin: .3rem 0 0; font-style: italic;">Signature Treatments</p>
      </div>
      <div style="padding: 1.5rem; background: #fff; border: 1px solid #eee;">
        <div style="line-height: 1.7; font-size: 15px; color: #333;">${messageHtml}</div>
      </div>
      <div style="text-align: center; padding: 1rem; background: #f9f9f9; border-radius: 0 0 12px 12px; border: 1px solid #eee; border-top: none;">
        <p style="color: #999; font-size: 12px; margin: 0;">${spaName} &bull; ${settings.address || "Highlands Ranch, CO"}</p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"${spaName}" <${getFromAddress()}>`,
    to,
    subject,
    text: textMessage,
    html,
  });
}

module.exports = { sendBookingConfirmation, sendCancellationEmail, sendEmail };
