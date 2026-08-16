/**
 * J&M Serenity Spa — Email Helper (Nodemailer)
 * Sends booking confirmations and cancellation/reschedule links.
 * If SMTP is not configured, emails are silently skipped.
 *
 * Message copy: every date, time, duration and price a customer sees goes
 * through lib/fmt — nobody should ever be emailed "2026-08-20" or "14:30".
 *
 * These bodies are assembled as HTML strings by hand, so anything that came
 * from a customer or from the settings table has to go through esc() below.
 * It plays the same role here that <%= %> plays in the views.
 */

const nodemailer = require("nodemailer");
const db = require("./db");
const fmt = require("./fmt");

/** HTML-escape a value for interpolation into an email body. */
function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

/* =========================================================================
   Booking detail helpers

   These duplicate the small lookups lib/sms.js does for the same messages.
   The pricing arithmetic is the one the terminal checkout in server.js uses —
   service price plus add-ons, less any membership percentage discount on the
   service — so the figure quoted here matches what the front desk rings up.
   ========================================================================= */

/** A Date as "YYYY-MM-DD" in local (spa) time. */
function ymdLocal(d) {
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + mo + "-" + day;
}

/** The active membership behind a booking, or null. Never throws. */
function memberFor(booking) {
  try {
    return booking.client_phone ? db.getMemberByPhone(booking.client_phone) : null;
  } catch (err) {
    console.error("Email member lookup error:", err.message);
    return null;
  }
}

/** The add-ons on a booking: the list the caller passed, else resolved by id. */
function addonsFor(booking, provided) {
  if (Array.isArray(provided)) return provided;
  try {
    if (!booking.addon_ids) return [];
    const ids = String(booking.addon_ids)
      .split(",")
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);
    return ids.length > 0 ? db.getAddonsByIds(ids) : [];
  } catch (err) {
    console.error("Email add-on lookup error:", err.message);
    return [];
  }
}

/**
 * Itemised cost of an appointment, or null when we can't price it confidently.
 * A service with no price on file — Water Head Massage has none — returns null
 * rather than a guess, and the email simply omits the cost section.
 */
function priceBreakdown(booking, addons, member) {
  try {
    const service = booking.service_id ? db.getServiceById(booking.service_id) : null;
    const servicePrice = service ? Number(service.price) : NaN;
    if (!Number.isFinite(servicePrice) || servicePrice <= 0) return null;

    const items = addons.filter((a) => a && Number.isFinite(Number(a.price)));
    const addonTotal = items.reduce((sum, a) => sum + Number(a.price), 0);

    const pct = member ? Number(member.discount_percent) : 0;
    // servicePrice * pct is already in cents, so this rounds the discount to
    // the nearest cent without a float tail.
    const discount = Number.isFinite(pct) && pct > 0 ? Math.round(servicePrice * pct) / 100 : 0;

    return {
      servicePrice,
      addons: items,
      addonTotal,
      discount,
      discountPercent: discount > 0 ? pct : 0,
      total: Math.round((servicePrice + addonTotal - discount) * 100) / 100,
    };
  } catch (err) {
    console.error("Email price lookup error:", err.message);
    return null;
  }
}

/**
 * Plan and visits remaining — the one thing a member wants from us, delivered
 * on a channel they already read instead of behind a login nobody could
 * support. Returns null whenever the number might be stale: visits_remaining
 * is only accurate once the monthly renewal has pushed next_billing forward,
 * and a wrong count is worse than no count.
 */
function membershipStatus(member) {
  if (!member) return null;
  if (member.visits_remaining === null || member.visits_remaining === undefined) return null;

  const left = Number(member.visits_remaining);
  if (!Number.isFinite(left) || left < 0) return null;

  const nextBilling = String(member.next_billing || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(nextBilling) && nextBilling <= ymdLocal(new Date())) return null;

  return {
    plan: member.plan_name || "Membership",
    visits: left === 0 ? "no visits" : left === 1 ? "1 visit" : left + " visits",
  };
}

/** "Maria S." or "Maria S. & Lisa K." for couples / four hands. */
function therapistNames(booking) {
  return [booking.therapist_name, booking.therapist2_name].filter(Boolean).join(" & ");
}

const ROW = 'style="padding: 8px; border-bottom: 1px solid #eee;"';

async function sendBookingConfirmation(booking, addons, baseUrl) {
  const transporter = getTransporter();
  if (!transporter || !booking.client_email) return;

  const settings = db.getAllSettings();
  const spaName = settings.spa_name || "J&M Serenity Spa";
  const bookingAddons = addonsFor(booking, addons);
  const member = memberFor(booking);
  const price = priceBreakdown(booking, bookingAddons, member);
  const membership = membershipStatus(member);
  const withWhom = therapistNames(booking);
  const duration = fmt.prettyDuration(booking.duration);

  const addonList = bookingAddons.length > 0
    ? bookingAddons.map((a) => esc(a.name) + " (+" + fmt.money(a.price) + ")").join(", ")
    : "None";

  const cancelUrl = baseUrl + "/booking/manage/" + booking.cancel_token;

  // Cost section. Omitted entirely when the service has no price on file.
  const costRows = price
    ? [
        `<tr><td ${ROW}>${esc(booking.service_name || "Service")}</td><td ${ROW} align="right">${fmt.money(price.servicePrice)}</td></tr>`,
        ...price.addons.map(
          (a) => `<tr><td ${ROW}>${esc(a.name)}</td><td ${ROW} align="right">+${fmt.money(a.price)}</td></tr>`
        ),
        price.discount > 0
          ? `<tr><td ${ROW}>Member discount (${esc(price.discountPercent)}% off)</td><td ${ROW} align="right">&minus;${fmt.money(price.discount)}</td></tr>`
          : "",
        `<tr><td style="padding: 8px;"><strong>Total</strong></td><td style="padding: 8px;" align="right"><strong>${fmt.money(price.total)}</strong></td></tr>`,
      ].join("")
    : "";

  const costBlock = price
    ? `
      <h3 style="margin: 1.5rem 0 .25rem; font-size: 16px;">What you'll pay</h3>
      <table style="border-collapse: collapse; width: 100%; margin: .5rem 0;">${costRows}</table>
      <p style="color: #666; font-size: 14px; margin-top: .25rem;">
        Payment is taken in person, after your session. There is nothing to pay online.
      </p>`
    : "";

  const memberBlock = membership
    ? `
      <p style="background: #f4f9f9; border-left: 3px solid #1f6f78; padding: .75rem 1rem; margin: 1.25rem 0;">
        <strong>${esc(membership.plan)}:</strong> ${esc(membership.visits)} left this month.
        We'll apply your membership benefits when you check in.
      </p>`
    : "";

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1f6f78;">Your Appointment is Confirmed!</h2>
      <p>Hi ${esc(booking.client_name)},</p>
      <p>Here are your appointment details:</p>
      <table style="border-collapse: collapse; width: 100%; margin: 1rem 0;">
        <tr><td ${ROW}><strong>Service</strong></td><td ${ROW}>${esc(booking.service_name || "—")}</td></tr>
        <tr><td ${ROW}><strong>When</strong></td><td ${ROW}>${esc(fmt.dateTime(booking.date, booking.time))}</td></tr>
        ${duration ? `<tr><td ${ROW}><strong>Duration</strong></td><td ${ROW}>${esc(duration)}</td></tr>` : ""}
        <tr><td ${ROW}><strong>Therapist</strong></td><td ${ROW}>${esc(withWhom || "Assigned at arrival")}</td></tr>
        <tr><td ${ROW}><strong>Add-Ons</strong></td><td ${ROW}>${addonList}</td></tr>
      </table>
      ${costBlock}
      ${memberBlock}
      <p>
        <a href="${esc(cancelUrl)}" style="display: inline-block; padding: 10px 24px; background: #1f6f78; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold;">Manage / Cancel Appointment</a>
      </p>
      <p style="color: #666; font-size: 14px;">
        Please arrive 5–10 minutes early.<br/>
        To cancel or reschedule, please give at least 24 hours' notice.
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 1.5rem 0;" />
      <p style="color: #999; font-size: 12px;">${esc(spaName)} &bull; ${esc(settings.address || "Littleton, CO")} &bull; ${esc(settings.phone || "")}</p>
    </div>
  `;

  // Plain-text alternative — some clients show it, and a message with no text
  // part at all scores worse with spam filters. null means "omit this line".
  const text = [
    "Your appointment is confirmed.",
    "",
    (booking.service_name || "Your treatment") + (duration ? ", " + duration : ""),
    fmt.dateTime(booking.date, booking.time),
    withWhom ? "With " + withWhom : null,
    bookingAddons.length > 0
      ? "Add-ons: " + bookingAddons.map((a) => a.name + " (+" + fmt.money(a.price) + ")").join(", ")
      : null,
    price ? "Total " + fmt.money(price.total) + ", paid in person after your session." : null,
    membership ? membership.plan + ": " + membership.visits + " left this month." : null,
    "",
    "Please arrive 5-10 minutes early.",
    "Manage or cancel: " + cancelUrl,
    "",
    spaName + " • " + (settings.address || "Littleton, CO") + " • " + (settings.phone || ""),
  ]
    .filter((line) => line !== null)
    .join("\n");

  try {
    await transporter.sendMail({
      from: `"${spaName}" <${getFromAddress()}>`,
      to: booking.client_email,
      subject: "Appointment Confirmed — " + spaName,
      text,
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
  const siteUrl = (settings.site_url || "https://jmserenityspa.com").replace(/\/+$/, "");

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #c0392b;">Appointment Cancelled</h2>
      <p>Hi ${esc(booking.client_name)},</p>
      <!-- No claim either way about what is owed: policies.ejs says a fee may
           apply to late and same-day cancellations, so this must not promise
           otherwise, and quoting the policy back at someone is not our job. -->
      <p>Your appointment on <strong>${esc(fmt.dateTime(booking.date, booking.time))}</strong> has been cancelled.</p>
      <p>If you'd like to rebook, visit <a href="${esc(siteUrl)}/book">our booking page</a>.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 1.5rem 0;" />
      <p style="color: #999; font-size: 12px;">${esc(spaName)} &bull; ${esc(settings.phone || "")}</p>
    </div>
  `;

  const text =
    "Your appointment on " + fmt.dateTime(booking.date, booking.time) +
    " has been cancelled.\n\n" +
    "To rebook: " + siteUrl + "/book\n\n" +
    spaName + (settings.phone ? " • " + settings.phone : "");

  try {
    await transporter.sendMail({
      from: `"${spaName}" <${getFromAddress()}>`,
      to: booking.client_email,
      subject: "Appointment Cancelled — " + spaName,
      text,
      html,
    });
  } catch (err) {
    console.error("Email send error:", err.message);
  }
}

// Generic email sender for updates/newsletters.
// opts: { unsubscribeUrl, imageUrl }
async function sendEmail(to, subject, textMessage, opts = {}) {
  const transporter = getTransporter();
  if (!transporter) throw new Error("SMTP not configured");

  const settings = db.getAllSettings();
  const spaName = settings.spa_name || "J&M Serenity Spa";
  const address = settings.address || "Littleton, CO";
  const messageHtml = textMessage.replace(/\n/g, "<br />");
  const imageBlock = opts.imageUrl
    ? `<div style="text-align:center; margin: 1.2rem 0;"><img src="${opts.imageUrl}" alt="${spaName}" style="max-width:100%; height:auto; border-radius:10px;" /></div>`
    : "";
  // CAN-SPAM: every marketing email must carry a working unsubscribe + our postal address.
  const unsubBlock = opts.unsubscribeUrl
    ? `<p style="color:#aaa; font-size:11px; margin:.5rem 0 0;">You're receiving this because you signed up for updates from ${spaName}.<br/><a href="${opts.unsubscribeUrl}" style="color:#999;">Unsubscribe</a> at any time.</p>`
    : "";

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="text-align: center; padding: 1.5rem; background: linear-gradient(135deg, #1f6f78, #114a50); border-radius: 12px 12px 0 0;">
        <h2 style="color: #fff; margin: 0;">${spaName}</h2>
        <p style="color: #c9a96e; margin: .3rem 0 0; font-style: italic;">Signature Treatments</p>
      </div>
      <div style="padding: 1.5rem; background: #fff; border: 1px solid #eee;">
        ${imageBlock}
        <div style="line-height: 1.7; font-size: 15px; color: #333;">${messageHtml}</div>
      </div>
      <div style="text-align: center; padding: 1rem; background: #f9f9f9; border-radius: 0 0 12px 12px; border: 1px solid #eee; border-top: none;">
        <p style="color: #999; font-size: 12px; margin: 0;">${spaName} &bull; ${address}</p>
        ${unsubBlock}
      </div>
    </div>
  `;

  const text = textMessage +
    `\n\n—\n${spaName} • ${address}` +
    (opts.unsubscribeUrl ? `\nUnsubscribe: ${opts.unsubscribeUrl}` : "");

  const mailOptions = {
    from: `"${spaName}" <${getFromAddress()}>`,
    to,
    subject,
    text,
    html,
  };
  // Contact-form messages set this to the customer's address so staff can just
  // hit reply. The From stays the spa's own domain — sending as the customer
  // would fail SPF/DKIM and land the mail in spam.
  if (opts.replyTo) mailOptions.replyTo = opts.replyTo;
  // One-click unsubscribe headers (Gmail/Yahoo bulk-sender requirement, RFC 8058)
  if (opts.unsubscribeUrl) {
    mailOptions.headers = {
      "List-Unsubscribe": `<${opts.unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };
  }

  await transporter.sendMail(mailOptions);
}

module.exports = { sendBookingConfirmation, sendCancellationEmail, sendEmail };
