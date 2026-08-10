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
 *
 * Delivery health:
 *   Sends are fire-and-forget from server.js, so failures are recorded in
 *   memory and exposed via getSmsHealth() — see the notes on `smsHealth` below.
 */

const db = require("./db");

const OPENPHONE_API_URL = "https://api.openphone.com/v1/messages";

/**
 * In-memory SMS health tracking.
 *
 * The callers in server.js invoke these helpers fire-and-forget
 * (`sms.sendX(...).catch(() => {})`), so a failure would otherwise leave no
 * trace outside of pm2 logs. We keep a tiny record of the last error, a
 * rolling count of consecutive failures, and a separate flag for the
 * "prepaid credits exhausted" case — that one needs a different human action
 * (top up the Quo/OpenPhone balance) than a generic API error.
 *
 * This state is deliberately in-memory only: it resets on restart and never
 * touches the database or the request path.
 */
const smsHealth = {
  lastError: null, // { at, status, message } | null
  consecutiveFailures: 0,
  likelyOutOfCredits: false,
  lastSuccessAt: null, // ISO string | null
};

// Max characters of an API error body we retain (and log) — keeps the record small.
const MAX_ERROR_MESSAGE_LENGTH = 300;

/**
 * Does this status / error body look like an exhausted prepaid balance?
 * Quo (OpenPhone) bills API messaging against prepaid credits and fails the
 * send outright when the balance runs out.
 */
function isOutOfCreditsError(status, message) {
  // 402 Payment Required is definitive.
  if (status === 402) return true;
  // Auth and rate-limit failures have their own unambiguous meanings — never
  // read them as "out of credits", or we send the owner to top up the account
  // when the real fix is a bad API key or sending too fast.
  if (status === 401 || status === 403 || status === 429) return false;
  if (!message) return false;
  // "insufficient" only counts next to a money word; bare "quota" is dropped
  // because rate-limit bodies use it too.
  return /insufficient\s+(funds|credit|credits|balance)|payment required|billing|top[\s\-_]?up|out of credit/i.test(
    message
  );
}

/**
 * Record a failed send. Never throws.
 */
function recordSmsFailure(status, message) {
  const fullMessage = String(message == null ? "" : message)
    .replace(/\s+/g, " ")
    .trim();
  // Match against the FULL body — a billing message can sit past the truncation
  // boundary in Quo's JSON error payloads.
  const outOfCredits = isOutOfCreditsError(status, fullMessage);
  const shortMessage = fullMessage.slice(0, MAX_ERROR_MESSAGE_LENGTH);

  smsHealth.lastError = {
    at: new Date().toISOString(),
    status: typeof status === "number" ? status : null,
    message: shortMessage,
  };
  smsHealth.consecutiveFailures += 1;
  // Sticky: once we've seen an out-of-credits failure it stays flagged until a
  // send actually succeeds, so a later transient error can't mask the real cause.
  if (outOfCredits) smsHealth.likelyOutOfCredits = true;
}

/**
 * Record a successful send — clears the consecutive failure streak.
 * The last error is kept for reference but no longer counts as ongoing.
 */
function recordSmsSuccess() {
  smsHealth.consecutiveFailures = 0;
  smsHealth.likelyOutOfCredits = false;
  smsHealth.lastSuccessAt = new Date().toISOString();
}

/**
 * Current SMS delivery health, for the admin dashboard / diagnostics.
 * Returns a plain object; never throws.
 *
 * {
 *   configured: boolean,            // openphone_api_key AND openphone_phone_id are set
 *   lastError: { at, status, message } | null,
 *   consecutiveFailures: number,    // resets to 0 on any success
 *   likelyOutOfCredits: boolean,    // HTTP 402 or a credits/billing-shaped error body
 *   lastSuccessAt: string | null    // ISO timestamp
 * }
 */
function getSmsHealth() {
  let configured = false;
  try {
    const settings = db.getAllSettings();
    configured = Boolean(
      settings &&
        settings.openphone_api_key &&
        settings.openphone_phone_id
    );
  } catch (err) {
    console.error("SMS health check error:", err.message);
  }

  return {
    configured,
    lastError: smsHealth.lastError
      ? {
          at: smsHealth.lastError.at,
          status: smsHealth.lastError.status,
          message: smsHealth.lastError.message,
        }
      : null,
    consecutiveFailures: smsHealth.consecutiveFailures,
    likelyOutOfCredits: smsHealth.likelyOutOfCredits,
    lastSuccessAt: smsHealth.lastSuccessAt,
  };
}

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
      let errText = "";
      try {
        errText = await res.text();
      } catch (readErr) {
        errText = "(could not read error body: " + readErr.message + ")";
      }
      console.error("OpenPhone SMS error:", res.status, errText);
      recordSmsFailure(res.status, errText);
      if (smsHealth.likelyOutOfCredits) {
        console.error(
          "OpenPhone SMS appears to be out of prepaid credits — " +
            "top up the account or confirmations and reminders will keep failing."
        );
      }
      return false;
    }

    console.log("SMS sent to " + phone);
    recordSmsSuccess();
    return true;
  } catch (err) {
    console.error("SMS send error:", err.message);
    recordSmsFailure(null, err.message);
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
    `\nManage/cancel: ${manageUrl}` +
    `\nReply STOP to opt out of texts.`;

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
    `\nNeed to cancel? Reply to this text or call ${settings.phone || "us"}.` +
    `\nReply STOP to opt out.`;

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
  getSmsHealth,
};
