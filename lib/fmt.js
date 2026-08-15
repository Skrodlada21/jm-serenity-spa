/**
 * J&M Serenity Spa — display formatting helpers.
 *
 * Dates and times are stored as "2026-08-20" and "14:30" because that sorts and
 * compares cleanly. Customers should never see either form. Everything that
 * faces a client — web pages, confirmation texts, emails — goes through here.
 *
 * All parsing is done on the string parts. Never hand a "YYYY-MM-DD" to the Date
 * constructor: it parses as UTC midnight and comes back as the previous day in
 * US timezones.
 */

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-08-20" -> "Thursday, August 20" (adds the year only if it isn't this one). */
function prettyDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!m) return String(value || "");
  const y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return String(value);
  const local = new Date(y, mo - 1, d, 12, 0, 0);   // noon: DST can't shift the date
  const base = DAYS[local.getDay()] + ", " + MONTHS[mo - 1] + " " + d;
  return y === new Date().getFullYear() ? base : base + ", " + y;
}

/** "2026-08-20" -> "Thu, Aug 20" — for tables and tight spaces. */
function shortDate(value) {
  const full = prettyDate(value);
  if (full === String(value || "")) return full;
  const [dayPart, rest] = full.split(", ");
  const [monthName, dayNum] = rest.split(" ");
  return dayPart.slice(0, 3) + ", " + monthName.slice(0, 3) + " " + dayNum;
}

/** "14:30" -> "2:30 PM"; "14:00" -> "2 PM". */
function prettyTime(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!m) return String(value || "");
  const h = parseInt(m[1], 10), mins = m[2];
  if (isNaN(h) || h > 23) return String(value);
  const h12 = (h % 12) || 12;
  const suffix = h >= 12 ? "PM" : "AM";
  return mins === "00" ? h12 + " " + suffix : h12 + ":" + mins + " " + suffix;
}

/** 90 -> "1 hr 30 min"; 60 -> "1 hour"; 30 -> "30 min". */
function prettyDuration(minutes) {
  const n = parseInt(minutes, 10);
  if (isNaN(n) || n <= 0) return "";
  if (n < 60) return n + " min";
  const h = Math.floor(n / 60), m = n % 60;
  const hPart = h === 1 ? "1 hour" : h + " hours";
  return m === 0 ? hPart : (h === 1 ? "1 hr" : h + " hr") + " " + m + " min";
}

/** 120 -> "$120"; 119.5 -> "$119.50". */
function money(amount) {
  const n = Number(amount);
  if (isNaN(n)) return "";
  return "$" + (Number.isInteger(n) ? String(n) : n.toFixed(2));
}

/** "(303) 500-5845" -> "+13035005845" for tel: hrefs. Empty string if unusable. */
function telHref(display) {
  const digits = String(display || "").replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.charAt(0) === "1") return "+" + digits;
  return "";
}

/** "2026-08-20" + "14:30" -> "Thursday, August 20 at 2:30 PM". */
function dateTime(dateValue, timeValue) {
  const d = prettyDate(dateValue);
  const t = prettyTime(timeValue);
  return t ? d + " at " + t : d;
}

module.exports = { prettyDate, shortDate, prettyTime, prettyDuration, money, telHref, dateTime };
