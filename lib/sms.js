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
 *
 * Message copy:
 *   All customer-facing dates, times, durations and prices go through lib/fmt.
 *   See the "Message content" section below for the rules the templates follow.
 */

const db = require("./db");
const fmt = require("./fmt");

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

/* =========================================================================
   Message content
   -------------------------------------------------------------------------
   Two rules govern every template below.

   1. Nothing raw from the database reaches a customer. Dates, times,
      durations and prices all go through lib/fmt, so a text reads
      "Thursday, August 20 at 2:30 PM", never "2026-08-20 at 14:30".

   2. Plain ASCII only. SMS bills per segment, and one character outside the
      GSM-7 alphabet — an em dash, a curly quote, an ellipsis — silently
      re-encodes the entire message as UCS-2 and drops the segment size from
      153 characters to 67. The em dash that used to open the confirmation
      was turning a 2-segment text into a 5-segment one on every booking.
      Use "-" and '.
   ========================================================================= */

/** A Date as "YYYY-MM-DD" in local (spa) time. */
function ymdLocal(d) {
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + mo + "-" + day;
}

/**
 * The active membership behind a booking, or null.
 *
 * Never throws. These builders are called fire-and-forget
 * (`sms.sendX(...).catch(() => {})`), so an exception raised while looking up
 * a nice-to-have detail would silently swallow the whole confirmation.
 */
function memberFor(booking) {
  try {
    return booking.client_phone ? db.getMemberByPhone(booking.client_phone) : null;
  } catch (err) {
    console.error("SMS member lookup error:", err.message);
    return null;
  }
}

/**
 * What this appointment costs, or null when we can't say confidently.
 *
 * Same arithmetic the terminal checkout uses in server.js: service price plus
 * add-ons, less any membership percentage discount on the service, so the
 * number in the text matches what the front desk rings up.
 *
 * Returns null when the service has no price on file — Water Head Massage
 * doesn't have one, and a guessed price is much worse than no price.
 */
function priceForBooking(booking, member) {
  try {
    const service = booking.service_id ? db.getServiceById(booking.service_id) : null;
    const servicePrice = service ? Number(service.price) : NaN;
    if (!Number.isFinite(servicePrice) || servicePrice <= 0) return null;

    let addonTotal = 0;
    if (booking.addon_ids) {
      const ids = String(booking.addon_ids)
        .split(",")
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0);
      if (ids.length > 0) {
        for (const addon of db.getAddonsByIds(ids)) {
          const p = Number(addon.price);
          if (Number.isFinite(p)) addonTotal += p;
        }
      }
    }

    const pct = member ? Number(member.discount_percent) : 0;
    const discount = Number.isFinite(pct) && pct > 0 ? (servicePrice * pct) / 100 : 0;

    return Math.round((servicePrice + addonTotal - discount) * 100) / 100;
  } catch (err) {
    console.error("SMS price lookup error:", err.message);
    return null;
  }
}

/**
 * One line telling a member where their plan stands.
 *
 * This is deliberately the whole of the "member area" the site doesn't have:
 * it delivers the only thing a member actually wants to know, on a channel
 * they already read, and it costs the front desk nothing.
 *
 * Returns null whenever the count might be wrong. visits_remaining is only
 * accurate once the monthly renewal has run and pushed next_billing forward;
 * until then it is last cycle's leftover. A wrong visit count produces exactly
 * the English phone call nobody here can answer, so when in doubt say nothing.
 */
function membershipVisitsLine(member) {
  if (!member) return null;
  if (member.visits_remaining === null || member.visits_remaining === undefined) return null;

  const left = Number(member.visits_remaining);
  if (!Number.isFinite(left) || left < 0) return null;

  // next_billing on or before today means the renewal hasn't been applied yet.
  const nextBilling = String(member.next_billing || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(nextBilling) && nextBilling <= ymdLocal(new Date())) return null;

  const plan = member.plan_name || "Membership";
  const visits = left === 0 ? "no visits" : left === 1 ? "1 visit" : left + " visits";
  return `${plan}: ${visits} left this month.`;
}

/** "Maria S." or "Maria S. & Lisa K." for couples / four hands; "" if unassigned. */
function therapistNames(booking) {
  return [booking.therapist_name, booking.therapist2_name].filter(Boolean).join(" & ");
}

/** Site URL from settings with any trailing slashes removed; "" when unset. */
function siteUrlFromSettings(settings) {
  return String(settings.site_url || "").trim().replace(/\/+$/, "");
}

/**
 * Send booking confirmation text.
 *
 * Typical length is 2 segments; a member line pushes it to 3.
 */
async function sendBookingConfirmationSMS(booking, baseUrl) {
  if (!booking.client_phone) return false;

  const settings = db.getAllSettings();
  const spaName = settings.spa_name || "J&M Serenity Spa";
  const member = memberFor(booking);
  const total = priceForBooking(booking, member);
  const memberLine = membershipVisitsLine(member);
  const duration = fmt.prettyDuration(booking.duration);
  const withWhom = therapistNames(booking);
  const manageUrl =
    baseUrl && booking.cancel_token ? baseUrl + "/booking/manage/" + booking.cancel_token : "";

  const msg =
    `${spaName} - you're booked!\n` +
    `${booking.service_name || "Your treatment"}${duration ? ", " + duration : ""}\n` +
    `${fmt.dateTime(booking.date, booking.time)}\n` +
    (withWhom ? `with ${withWhom}\n` : "") +
    (total === null ? "" : `Total ${fmt.money(total)}. Pay in person after your session.\n`) +
    (memberLine ? `${memberLine}\n` : "") +
    `Arrive 5-10 min early.\n` +
    (manageUrl ? `Change/cancel: ${manageUrl}\n` : `To change it, call ${settings.phone || "us"}.\n`) +
    `Reply STOP to opt out.`;

  return sendSMS(booking.client_phone, msg);
}

/**
 * Send appointment reminder text (typically 24 hours before).
 *
 * Drops the duration the confirmation already gave them and carries the
 * address instead — this is the message someone reads on the way over.
 */
async function sendReminderSMS(booking) {
  if (!booking.client_phone) return false;

  const settings = db.getAllSettings();
  const spaName = settings.spa_name || "J&M Serenity Spa";
  const member = memberFor(booking);
  const total = priceForBooking(booking, member);
  const memberLine = membershipVisitsLine(member);
  const withWhom = therapistNames(booking);

  // Reminders come from a daily job, with no request to read a host off, so
  // the self-service link is only offered when site_url is actually set. A
  // link that 404s is worse than a phone number — and the old copy here said
  // "reply to this text", which sends English nobody at the desk can read.
  const siteUrl = siteUrlFromSettings(settings);
  const manageUrl =
    siteUrl && booking.cancel_token ? siteUrl + "/booking/manage/" + booking.cancel_token : "";

  const msg =
    `${spaName} - tomorrow\n` +
    `${booking.service_name || "Your treatment"}\n` +
    `${fmt.dateTime(booking.date, booking.time)}\n` +
    (withWhom ? `with ${withWhom}\n` : "") +
    // Short form on purpose: the confirmation already spelled out that payment
    // happens in person after the session, and the full sentence here costs a
    // whole extra segment on every reminder we send.
    (total === null ? "" : `Total ${fmt.money(total)}, pay in person.\n`) +
    (memberLine ? `${memberLine}\n` : "") +
    (settings.address ? `${settings.address}\n` : "") +
    `Arrive 5-10 min early.\n` +
    (manageUrl ? `Change/cancel: ${manageUrl}\n` : `To change it, call ${settings.phone || "us"}.\n`) +
    `Reply STOP to opt out.`;

  return sendSMS(booking.client_phone, msg);
}

/**
 * Send cancellation text. One segment.
 */
async function sendCancellationSMS(booking) {
  if (!booking.client_phone) return false;

  const settings = db.getAllSettings();
  const spaName = settings.spa_name || "J&M Serenity Spa";
  const siteUrl = siteUrlFromSettings(settings);
  const phone = settings.phone || "us";

  const msg =
    `${spaName}: your ${fmt.dateTime(booking.date, booking.time)} appointment is cancelled.\n` +
    (siteUrl ? `Rebook: ${siteUrl}/book or call ${phone}.\n` : `To rebook, call ${phone}.\n`) +
    `See you soon!`;

  return sendSMS(booking.client_phone, msg);
}

/**
 * Check for appointments happening tomorrow and send reminders.
 * server.js runs this every 30 minutes; bookings are marked once sent, so the
 * repeat runs are no-ops. Only confirmed bookings that haven't been reminded
 * yet are texted.
 */
async function sendDailyReminders() {
  const settings = db.getAllSettings();
  if (!settings.openphone_api_key || !settings.openphone_phone_id) return;

  // Local date, not toISOString(): UTC rolls over at 6pm Colorado time, so
  // every evening run used to compute "tomorrow" as the day after tomorrow.
  // Those clients got a text saying "tomorrow" two days early and were then
  // flagged as reminded, so they never received the real 24-hour reminder.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = ymdLocal(tomorrow);

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
