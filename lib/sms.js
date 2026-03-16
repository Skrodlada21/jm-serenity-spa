/**
 * J&M Serenity Spa — SMS Helper (OpenPhone / Quo API)
 * Sends booking confirmations, reminders, and cancellation texts.
 * If OpenPhone is not configured, texts are silently skipped.
 *
 * OpenPhone API:
 *   POST https://api.openphone.com/v1/messages
 *   Headers: Authorization: <API_KEY>, Content-Type: application/json
 *   Body: { content, from, to }
 *
 * Settings required:
 *   openphone_api_key  — Your OpenPhone API key
 *   openphone_phone_id — Your OpenPhone phone number ID (from the API)
 *   openphone_from     — Your OpenPhone phone number (e.g. +17205551234)
 */

const db = require("./db");

const OPENPHONE_API_URL = "https://api.openphone.com/v1/messages";

/**
 * Send an SMS via OpenPhone API.
 * Returns true on success, false on failure or if not configured.
 */
async function sendSMS(to, content) {
  const settings = db.getAllSettings();
  const apiKey = settings.openphone_api_key;
  const phoneNumberId = settings.openphone_phone_id;

  if (!apiKey || !phoneNumberId) return false;

  // Normalize phone number — strip spaces/dashes, ensure +1 prefix
  let phone = to.replace(/[\s\-\(\)\.]/g, "");
  if (phone.length === 10) phone = "+1" + phone;
  else if (phone.length === 11 && phone.startsWith("1")) phone = "+" + phone;
  else if (!phone.startsWith("+")) phone = "+1" + phone;

  try {
    const res = await fetch(OPENPHONE_API_URL, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
        from: phoneNumberId,
        to: [phone],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("OpenPhone SMS error:", res.status, errText);
      return false;
    }

    console.log("SMS sent to " + phone);
    return true;
  } catch (err) {
    console.error("SMS send error:", err.message);
    return false;
  }
}

/**
 * Send booking confirmation text.
 */
async function sendBookingConfirmationSMS(booking, baseUrl) {
  if (!booking.client_phone) return false;

  const settings = db.getAllSettings();
  const spaName = settings.spa_name || "J&M Serenity Spa";
  const manageUrl = baseUrl + "/booking/manage/" + booking.cancel_token;

  const msg =
    `${spaName} — Appointment Confirmed!\n\n` +
    `Service: ${booking.service_name || "Your treatment"}\n` +
    `Date: ${booking.date}\n` +
    `Time: ${booking.time}\n` +
    `Duration: ${booking.duration} min\n` +
    (booking.therapist_name ? `Therapist: ${booking.therapist_name}\n` : "") +
    `\nPlease arrive 5-10 min early. Payment due at appointment.\n` +
    `\nManage/cancel: ${manageUrl}`;

  return sendSMS(booking.client_phone, msg);
}

/**
 * Send appointment reminder text (typically 24 hours before).
 */
async function sendReminderSMS(booking) {
  if (!booking.client_phone) return false;

  const settings = db.getAllSettings();
  const spaName = settings.spa_name || "J&M Serenity Spa";

  const msg =
    `Reminder from ${spaName}!\n\n` +
    `You have an appointment tomorrow:\n` +
    `${booking.service_name || "Your treatment"} at ${booking.time}\n` +
    (booking.therapist_name ? `with ${booking.therapist_name}\n` : "") +
    `\nPlease arrive 5-10 min early.\n` +
    `${settings.address || ""}\n` +
    `\nNeed to cancel? Reply to this text or call ${settings.phone || "us"}.`;

  return sendSMS(booking.client_phone, msg);
}

/**
 * Send cancellation text.
 */
async function sendCancellationSMS(booking) {
  if (!booking.client_phone) return false;

  const settings = db.getAllSettings();
  const spaName = settings.spa_name || "J&M Serenity Spa";

  const msg =
    `${spaName} — Your appointment on ${booking.date} at ${booking.time} has been cancelled.\n\n` +
    `To rebook, visit our website or call ${settings.phone || "us"}. We hope to see you soon!`;

  return sendSMS(booking.client_phone, msg);
}

/**
 * Check for appointments happening tomorrow and send reminders.
 * This should be called once a day (e.g. via setInterval or cron).
 * Only sends to confirmed bookings that haven't received a reminder yet.
 */
async function sendDailyReminders() {
  const settings = db.getAllSettings();
  if (!settings.openphone_api_key || !settings.openphone_phone_id) return;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const bookings = db.getBookingsForDate(tomorrowStr);
  const confirmed = bookings.filter(
    (b) => b.status === "confirmed" && b.client_phone && !b.reminder_sent
  );

  let sent = 0;
  for (const booking of confirmed) {
    const success = await sendReminderSMS(booking);
    if (success) {
      db.markReminderSent(booking.id);
      sent++;
      // Small delay between messages to avoid rate limiting
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  if (sent > 0) {
    console.log(`Sent ${sent} appointment reminders for ${tomorrowStr}`);
  }
}

module.exports = {
  sendSMS,
  sendBookingConfirmationSMS,
  sendReminderSMS,
  sendCancellationSMS,
  sendDailyReminders,
};
