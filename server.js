/**
 * J&M Serenity Spa — Express Server
 * All public + admin routes
 */

const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const multer = require("multer");
const db = require("./lib/db");
const scanWatch = require("./lib/scan-watch");
const scanMail = require("./lib/scan-mail");
const email = require("./lib/email");
const sms = require("./lib/sms");
const square = require("./lib/square");
const fmt = require("./lib/fmt");

// Image uploads: only accept real image types, and derive the stored
// extension from the (validated) mimetype — never from the client filename.
// This prevents uploading .svg/.html that would execute as script on our origin.
const IMAGE_MIME_EXT = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};
function imageFileFilter(req, file, cb) {
  if (IMAGE_MIME_EXT[file.mimetype]) return cb(null, true);
  cb(new Error("Only JPG, PNG, GIF, and WEBP images are allowed"));
}
function randomName(prefix, ext) {
  return prefix + "-" + Date.now() + "-" + crypto.randomBytes(6).toString("hex") + ext;
}

// Multer config for therapist photos
const photoDir = path.join(__dirname, "public", "images", "therapists");
if (!fs.existsSync(photoDir)) fs.mkdirSync(photoDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, photoDir),
  filename: (req, file, cb) => cb(null, randomName("therapist", IMAGE_MIME_EXT[file.mimetype] || ".jpg")),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFileFilter });

// Gallery photo upload
const galleryDir = path.join(__dirname, "public", "images", "gallery");
if (!fs.existsSync(galleryDir)) fs.mkdirSync(galleryDir, { recursive: true });

const galleryStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, galleryDir),
  filename: (req, file, cb) => cb(null, randomName("gallery", IMAGE_MIME_EXT[file.mimetype] || ".jpg")),
});
const galleryUpload = multer({ storage: galleryStorage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: imageFileFilter });

// Update/newsletter images — stored in the PUBLIC image dir because email
// clients must be able to load them from a public URL.
const updatesImgDir = path.join(__dirname, "public", "images", "updates");
if (!fs.existsSync(updatesImgDir)) fs.mkdirSync(updatesImgDir, { recursive: true });
const updateImageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, updatesImgDir),
  filename: (req, file, cb) => cb(null, randomName("update", IMAGE_MIME_EXT[file.mimetype] || ".jpg")),
});
const updateImageUpload = multer({ storage: updateImageStorage, limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: imageFileFilter });

// Expense receipt upload (photos or PDFs).
// Stored OUTSIDE the public web root and served only through an
// authenticated route (see /admin/receipts/:file) so financial documents
// are never directly reachable. Filenames are random to defeat enumeration.
const receiptDir = path.join(__dirname, "private_uploads", "receipts");
if (!fs.existsSync(receiptDir)) fs.mkdirSync(receiptDir, { recursive: true });

const RECEIPT_MIME_EXT = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
};
const receiptStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, receiptDir),
  filename: (req, file, cb) => cb(null, randomName("receipt", RECEIPT_MIME_EXT[file.mimetype] || ".dat")),
});
const receiptUpload = multer({
  storage: receiptStorage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB for PDFs
  fileFilter: (req, file, cb) => {
    if (RECEIPT_MIME_EXT[file.mimetype]) return cb(null, true);
    cb(new Error("Only JPG, PNG, GIF, and PDF files allowed"));
  },
});

// Business documents (COI, welcome packet, licenses, contracts). Stored OUTSIDE
// the public web root; only downloadable through an authenticated admin route
// (which forces a file download, never inline rendering).
const documentsDir = path.join(__dirname, "private_uploads", "documents");
if (!fs.existsSync(documentsDir)) fs.mkdirSync(documentsDir, { recursive: true });

const DOC_ALLOWED_EXT = new Set([".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".doc", ".docx", ".xls", ".xlsx", ".txt", ".csv"]);
const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, documentsDir),
  filename: (req, file, cb) => cb(null, randomName("doc", path.extname(file.originalname).toLowerCase() || ".dat")),
});
const documentUpload = multer({
  storage: documentStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (req, file, cb) => {
    if (DOC_ALLOWED_EXT.has(path.extname(file.originalname).toLowerCase())) return cb(null, true);
    cb(new Error("Unsupported file type"));
  },
});

const app = express();
const PORT = process.env.PORT || 3000;

// Behind Nginx Proxy Manager (+ Cloudflare): trust the first proxy hop so
// req.ip is the real client (for rate limiting), req.secure reflects the
// terminated TLS, and secure cookies work.
app.set("trust proxy", 1);

// Security headers. CSP is left off for now because the templates rely on
// inline styles/scripts and some remote images (coming-soon); enabling a
// strict policy would break rendering. HSTS/frameguard/nosniff/referrer are safe.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    hsts: { maxAge: 31536000, includeSubDomains: true },
  })
);

// Public base URL for links placed in outbound email/SMS. Prefer a configured
// value over the request Host header to avoid Host-header link poisoning.
function publicBaseUrl(req) {
  const configured = db.getSetting("site_url");
  if (configured) return configured.replace(/\/+$/, "");
  return req.protocol + "://" + req.get("host");
}

// Redirect back to the referring page ONLY if it is same-origin; otherwise
// use a safe fallback. Prevents open-redirect via a forged Referer header.
/**
 * Human-readable opening hours derived from settings — the single source used by
 * the footer, contact page and coming-soon page, so an hours change in admin can
 * never leave one page contradicting another.
 *   "Every day 9am–9pm"  |  "Mon–Sat 9am–7pm · Closed Sunday"
 * settings.open_days is a comma list where 1=Mon .. 6=Sat, 7=Sun (0 also accepted).
 */
function formatBusinessHours(settings) {
  const s = settings || {};
  // Signage style ("9am", "7:30pm"), which is not the same as lib/fmt's
  // prettyTime ("9 AM") — named so it can't be confused with the shared helper.
  const hourLabel = (value, fallback) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
    if (!m) return fallback;
    const h = parseInt(m[1], 10);
    const mins = m[2];
    if (isNaN(h) || h > 23) return fallback;
    return ((h % 12) || 12) + (mins === "00" ? "" : ":" + mins) + (h >= 12 ? "pm" : "am");
  };
  const open = hourLabel(s.open_time, "9am");
  const close = hourLabel(s.close_time, "7pm");

  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const nums = String(s.open_days || "1,2,3,4,5,6")
    .split(",")
    .map((d) => { const n = parseInt(d, 10); return n === 7 ? 0 : n; })
    .filter((n) => n >= 0 && n <= 6);
  const open7 = [0, 1, 2, 3, 4, 5, 6].every((n) => nums.includes(n));
  if (open7) return "Every day " + open + "–" + close;

  // Order Mon-first so a normal week reads as a range, then note the closed days.
  const week = [1, 2, 3, 4, 5, 6, 0].filter((n) => nums.includes(n));
  if (week.length === 0) return "Hours by appointment";
  const label = week.length === 1
    ? names[week[0]]
    : names[week[0]] + "–" + names[week[week.length - 1]];
  const closed = [1, 2, 3, 4, 5, 6, 0].filter((n) => !nums.includes(n)).map((n) => names[n]);
  return label + " " + open + "–" + close +
    (closed.length ? " · Closed " + closed.join(", ") : "");
}

/* Desk staff work at /desk/gift-certificates; the manager at /admin. Success
   paths used to hard-code /admin, which is requireAdmin — so a CORRECT action
   by a desk user bounced them to the manager's password screen while the sale
   had already gone through. They would then redo it and duplicate the record. */
function giftBase(req) {
  return req.session && req.session.admin ? "/admin" : "/desk";
}

function safeBack(req, fallback) {
  const ref = req.get("Referrer") || req.get("Referer");
  if (ref) {
    try {
      if (new URL(ref).host === req.get("host")) return ref;
    } catch (e) { /* ignore malformed referer */ }
  }
  return fallback;
}

/* =========================================================================
   Rate Limiting (simple in-memory)
   ========================================================================= */

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 10; // max bookings per IP per window

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    entry = { start: now, count: 0 };
  }
  entry.count++;
  rateLimitMap.set(ip, entry);
  if (entry.count > RATE_LIMIT_MAX) {
    return res.status(429).send("Too many requests. Please try again later.");
  }
  next();
}

// Clean up rate limit map periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.start > RATE_LIMIT_WINDOW) rateLimitMap.delete(ip);
  }
}, 5 * 60 * 1000);

// Stricter limiter for authentication endpoints (login / PIN unlock) to stop
// online password/PIN brute-forcing. Keyed per-IP; short window, low ceiling.
const authLimitMap = new Map();
const AUTH_WINDOW = 15 * 60 * 1000; // 15 minutes
const AUTH_MAX = 25; // attempts per IP per window

function authRateLimit(req, res, next) {
  // Key per ROUTE as well as per IP. The whole spa NATs to one address, so a
  // single shared budget meant the manager, the desk and the lobby tablet
  // competed for the same handful of logins — and an anonymous prod of one
  // endpoint could lock staff out of all the others.
  const ip = req.ip || req.connection.remoteAddress;
  const key = req.path + "|" + ip;
  const now = Date.now();
  let entry = authLimitMap.get(key);
  if (!entry || now - entry.start > AUTH_WINDOW) entry = { start: now, count: 0 };
  entry.count++;
  authLimitMap.set(key, entry);
  if (entry.count > AUTH_MAX) {
    return res.status(429).send("Too many attempts. Please wait a few minutes and try again.");
  }
  next();
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of authLimitMap) {
    if (now - entry.start > AUTH_WINDOW) authLimitMap.delete(ip);
  }
}, 5 * 60 * 1000);

// Looser limiter for read-only phone lookups (client / member autofill).
// Generous enough never to bother a real person filling out one form, but
// low enough to make phone-number enumeration impractical.
const lookupLimitMap = new Map();
const LOOKUP_WINDOW = 15 * 60 * 1000;
const LOOKUP_MAX = 40;

function lookupRateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  let entry = lookupLimitMap.get(ip);
  if (!entry || now - entry.start > LOOKUP_WINDOW) entry = { start: now, count: 0 };
  entry.count++;
  lookupLimitMap.set(ip, entry);
  if (entry.count > LOOKUP_MAX) return res.status(429).json({ client: null, member: null });
  next();
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of lookupLimitMap) {
    if (now - entry.start > LOOKUP_WINDOW) lookupLimitMap.delete(ip);
  }
}, 5 * 60 * 1000);

/* =========================================================================
   Outbound send ledger
   -------------------------------------------------------------------------
   Booking a slot makes us text and email whatever recipient the form names.
   That is an open relay paid for out of prepaid texting credit, and a burst of
   junk messages is also how a business loses its A2P registration. The per-IP
   limiter above does not help: an abuser with a handful of IPs, or one who is
   simply patient, stays under it.

   So the *recipients* are metered too, independent of who asked. Nobody gets
   more than a few confirmations a day, and the whole spa cannot send more than
   a day's worth of legitimate traffic no matter what. Refusing only skips the
   message — the appointment is still booked, and staff still see it.
   ========================================================================= */

const SEND_WINDOW = 24 * 60 * 60 * 1000;
const SEND_MAX_PER_RECIPIENT = 3;  // per phone number / email address per day
const SEND_MAX_PER_DAY = 200;      // total outbound confirmations per day

const sendLedger = new Map();
let sendTotal = { start: Date.now(), count: 0 };

// Normalized ledger key, or "" when there is nothing worth sending to.
function sendKey(channel, value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (channel === "sms") {
    let digits = raw.replace(/\D/g, "");
    // sendSMS() normalizes 10-digit and leading-1 11-digit numbers to the SAME
    // +1 destination, so key on the last 10 digits or one phone gets two
    // buckets and twice the allowance just by varying the format.
    if (digits.length === 11 && digits.charAt(0) === "1") digits = digits.slice(1);
    return digits.length >= 7 ? "sms:" + digits.slice(-10) : "";
  }
  return raw.includes("@") ? "email:" + raw : "";
}

// Only shows enough of a recipient to recognize it in the log.
function maskRecipient(channel, value) {
  const raw = String(value || "").trim();
  if (channel === "sms") return "***" + raw.replace(/\D/g, "").slice(-4);
  const at = raw.indexOf("@");
  return at > 0 ? "***" + raw.slice(at) : "***";
}

/**
 * True if we should send, and records the send. False means skip it quietly.
 * Never throws — a bookkeeping problem must not cost the customer a booking.
 */
function outboundAllowed(channel, value) {
  try {
    const key = sendKey(channel, value);
    if (!key) return false; // no usable address — nothing to send

    const now = Date.now();
    if (now - sendTotal.start > SEND_WINDOW) sendTotal = { start: now, count: 0 };
    if (sendTotal.count >= SEND_MAX_PER_DAY) {
      console.warn("Outbound " + channel + " skipped: daily cap of " + SEND_MAX_PER_DAY + " reached");
      return false;
    }

    let entry = sendLedger.get(key);
    if (!entry || now - entry.start > SEND_WINDOW) entry = { start: now, count: 0 };
    if (entry.count >= SEND_MAX_PER_RECIPIENT) {
      sendLedger.set(key, entry);
      console.warn("Outbound " + channel + " skipped: " + maskRecipient(channel, value) +
        " already received " + entry.count + " today");
      return false;
    }

    entry.count++;
    sendLedger.set(key, entry);
    sendTotal.count++;
    return true;
  } catch (e) {
    console.warn("Outbound send ledger error — skipping " + channel + ":", e.message);
    return false;
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of sendLedger) {
    if (now - entry.start > SEND_WINDOW) sendLedger.delete(key);
  }
}, 60 * 60 * 1000);

/* =========================================================================
   Dates
   ========================================================================= */

/**
 * Local calendar date as "YYYY-MM-DD", offset by whole days.
 *   localDate(0) -> today   localDate(-2) -> two days ago   localDate(90) -> 90 days out
 * Built from local parts on purpose: toISOString() is UTC and rolls the date
 * over in the evening in Colorado.
 */
function localDate(offsetDays) {
  const d = new Date();
  if (offsetDays) d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

// How far ahead the public booking form will accept an appointment. Staff are
// not held to this — /admin/phone-booking can book any date.
const MAX_BOOKING_DAYS_AHEAD = 90;

// A booking link (confirm / manage / cancel / reschedule) stops working a
// couple of days after the appointment. The token is in a text message and an
// email that live in the customer's phone forever; without an expiry, anyone
// who later reads that message can pull up the customer's name, phone and
// history years from now.
const BOOKING_LINK_GRACE_DAYS = 2;

function bookingLinkExpired(booking) {
  if (!booking || !booking.date) return false;
  return String(booking.date) < localDate(-BOOKING_LINK_GRACE_DAYS);
}

// Positive integer id from a form field, or null. Keeps NaN out of SQL.
function toId(value) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Was a value actually supplied by the form (vs. left blank)?
function wasSupplied(value) {
  return String(value == null ? "" : value).trim() !== "";
}

function isActiveTherapistId(id) {
  if (!id) return false;
  const therapist = db.getTherapistById(id);
  return !!(therapist && therapist.active);
}

/* =========================================================================
   HTML Escaping (for XSS prevention)
   ========================================================================= */

function escapeHtml(str) {
  if (!str) return "";
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return str.replace(/[&<>"']/g, (c) => map[c]);
}

/* =========================================================================
   Middleware
   ========================================================================= */

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session secret: use env var, or generate and store in database on first run
let sessionSecret = db.getSetting("session_secret");
if (!sessionSecret || sessionSecret === "jm-spa-secret-key-change-me") {
  sessionSecret = crypto.randomBytes(32).toString("hex");
  db.setSetting("session_secret", sessionSecret);
  console.log("✓ Generated and stored new session secret");
}

app.use(
  session({
    secret: process.env.SESSION_SECRET || sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 8 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
      // "auto" sets the Secure flag only on HTTPS requests (via trust proxy),
      // so the cookie still works for direct HTTP access on the LAN.
      secure: "auto",
    },
  })
);

// CSRF Token middleware — makes a per-session token available to templates.
app.use((req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString("hex");
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
});

// CSRF protection for all state-changing requests. A request passes if it
// either carries the correct session token OR originates from our own site
// (Origin/Referer host is one we recognize). Combined with SameSite=Lax
// cookies this blocks cross-site forgery without a token in every form.
// The allow-list tolerates the reverse proxy rewriting the Host header.
function allowedHosts(req) {
  const set = new Set(["jmserenityspa.com", "www.jmserenityspa.com"]);
  const h = req.get("host");
  if (h) set.add(h.toLowerCase());
  const site = db.getSetting("site_url");
  if (site) {
    try { set.add(new URL(site).host.toLowerCase()); } catch (e) { /* ignore */ }
  }
  return set;
}
function verifyCsrf(req, res, next) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();

  // One-click List-Unsubscribe POSTs come from mail providers with no Origin/token.
  // This action is public, idempotent, and safe, so it is exempt from CSRF.
  if (req.path.startsWith("/unsubscribe/")) return next();

  const token = (req.body && req.body._csrf) || req.get("x-csrf-token");
  if (token && req.session.csrfToken && token === req.session.csrfToken) return next();

  const source = req.get("origin") || req.get("referer");
  if (source) {
    try {
      if (allowedHosts(req).has(new URL(source).host.toLowerCase())) return next();
    } catch (e) { /* malformed — fall through to block */ }
  }
  return res.status(403).send("Request blocked for security (invalid origin).");
}
app.use(verifyCsrf);

app.use((req, res, next) => {
  res.locals.settings = db.getAllSettings();
  res.locals.hoursText = formatBusinessHours(res.locals.settings);
  res.locals.isAdmin = !!req.session.admin;
  // Shared display formatting (dates, times, money, tel: links) for every view,
  // so no template has to reinvent "2:30 PM" or "Thursday, August 20".
  res.locals.fmt = fmt;
  // Prevent browser caching of HTML pages so setting changes take effect immediately
  if (!req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2)$/)) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
  }
  next();
});

function requireAdmin(req, res, next) {
  if (req.session.admin) return next();
  res.redirect("/admin/login");
}

// Allows both admin and front-desk sessions (for booking action routes)
function requireStaff(req, res, next) {
  if (req.session.admin || req.session.desk) return next();
  res.redirect("/admin/login");
}

function requireDesk(req, res, next) {
  if (req.session.desk || req.session.admin) return next();
  res.redirect("/desk/login");
}

/* -------------------------------------------------------------------------
   Kiosk gate — the lobby tablet (/arrive and /checkin)
   -------------------------------------------------------------------------
   These pages take no login by design: a client walks up and uses them. But
   they were reachable by ANYONE on the internet, which meant a stranger could
   overwrite a real client's health intake (conditions, medications, pregnancy)
   and record a consent signature in their name, or query who is at the spa
   today. Intake links are never emailed to clients — these pages are only ever
   used on the tablet in the lobby — so the device is authorized once with the
   front-desk PIN and then stays authorized. Clients still touch nothing but
   the form itself.
   ------------------------------------------------------------------------- */
const KIOSK_SESSION_MS = 180 * 24 * 60 * 60 * 1000; // ~6 months between unlocks

function isKiosk(req) {
  return !!(req.session && (req.session.kiosk || req.session.desk || req.session.admin));
}

// For full page loads — show the unlock screen instead of the kiosk page.
function requireKioskPage(req, res, next) {
  if (isKiosk(req)) return next();
  res.status(401).render("kiosk-unlock", { next: req.originalUrl, error: "" });
}

// For the kiosk's own fetch() calls — never redirect, just refuse.
function requireKioskApi(req, res, next) {
  if (isKiosk(req)) return next();
  res.status(403).json({ ok: false, error: "This device is not set up for check-in." });
}

/* =========================================================================
   COMING SOON MODE
   ========================================================================= */

// Direct route to see the coming soon page (always accessible)
app.get("/coming-soon", (req, res) => {
  res.render("coming-soon", { baseUrl: publicBaseUrl(req) });
});

// Preview mode: sets a session flag so you can browse the real site even when coming-soon is on
app.get("/preview", (req, res) => {
  req.session.preview = true;
  res.redirect("/");
});

// Stop previewing — go back to seeing the coming-soon page
app.get("/preview/off", (req, res) => {
  req.session.preview = false;
  res.redirect("/");
});

// Middleware: redirect public visitors to coming-soon page
app.use((req, res, next) => {
  const comingSoon = db.getSetting("coming_soon") === "1";
  if (!comingSoon) return next();

  // These paths always bypass coming-soon mode
  const bypass = [
    "/admin", "/desk", "/api/", "/checkin", "/arrive", "/kiosk/",
    "/coming-soon", "/preview", "/unsubscribe",
    "/menu", "/tv/",
    "/style.css", "/script.js", "/images/", "/favicon"
  ];
  if (bypass.some(p => req.path.startsWith(p))) return next();

  // Admin, desk staff, and preview sessions bypass
  if (req.session.admin || req.session.desk || req.session.preview) return next();

  // Everyone else sees coming soon — no caching so changes take effect immediately
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  return res.render("coming-soon", { baseUrl: publicBaseUrl(req) });
});

/* =========================================================================
   PUBLIC ROUTES
   ========================================================================= */

app.get("/", (req, res) => {
  res.render("index", {
    activePage: "home",
    services: db.getActiveServices(),
    addons: db.getActiveAddons(),
    reviews: db.getApprovedReviews().slice(0, 3),
    therapists: db.getActiveTherapists(),
  });
});

app.get("/treatments", (req, res) => {
  res.render("services", { activePage: "treatments", services: db.getActiveServices(), addons: db.getActiveAddons() });
});

app.get("/about", (req, res) => {
  res.render("about", { activePage: "about", therapists: db.getActiveTherapists() });
});

app.get("/contact", (req, res) =>
  res.render("contact", {
    activePage: "contact",
    sent: req.query.sent === "1",
    contactError: req.query.error === "1",
  })
);
app.get("/policies", (req, res) => res.render("policies", { activePage: "policies" }));
/* Contact form. This used to be a bare redirect — the customer was told their
   message was sent and it was thrown away. It now actually emails the spa.
   Rate-limited and ledgered like every other outbound path, because a public
   form that sends mail is a spam relay otherwise. */
app.post("/contact", rateLimit, (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 120);
  const from = String(req.body.email || "").trim().slice(0, 200);
  const message = String(req.body.message || "").trim().slice(0, 4000);

  if (!name || !from || !message || !from.includes("@")) {
    return res.redirect("/contact?error=1");
  }

  const settings = db.getAllSettings();
  const to = settings.email || settings.smtp_from || settings.smtp_user;

  // Ledger on the SENDER's address so one person cannot flood the inbox, and
  // deliver to the spa. Reply-To is the customer so staff can just hit reply.
  if (to && outboundAllowed("email", from)) {
    email
      .sendEmail(
        to,
        "Website message from " + name,
        "From: " + name + " <" + from + ">\n\n" + message,
        { replyTo: from }
      )
      .catch((err) => console.error("Contact form email failed:", err.message));
  } else if (!to) {
    console.error("Contact form: no destination address configured (settings.email).");
  }

  res.redirect("/contact?sent=1");
});

// Gallery page
app.get("/gallery", (req, res) => {
  res.render("gallery", { activePage: "gallery", images: db.getActiveGalleryImages() });
});

// Reviews / Testimonials page
app.get("/reviews", (req, res) => {
  res.render("reviews", {
    activePage: "reviews",
    reviews: db.getApprovedReviews(),
    therapists: db.getActiveTherapists(),
    submitted: req.query.submitted === "1",
  });
});

app.post("/reviews", rateLimit, (req, res) => {
  const { client_name, rating, text, therapist_id } = req.body;
  db.addReview(client_name, parseInt(rating, 10) || 5, text || "", therapist_id ? parseInt(therapist_id, 10) : null);
  res.redirect("/reviews?submitted=1");
});

// Gift Certificate lookup
app.get("/gift-certificates", (req, res) => {
  const code = req.query.code || "";
  let cert = null;
  if (code) cert = db.getGiftCertificateByCode(code.trim().toUpperCase());
  res.render("gift-certificates", { activePage: "gift", code, cert });
});

// Booking
app.get("/book", (req, res) => {
  res.render("booking", {
    activePage: "book",
    services: db.getActiveServices(),
    addons: db.getActiveAddons(),
    therapists: db.getActiveTherapists(),
    preselect: req.query.service || "",
    // The "Book with <name>" buttons on /about link to /book?therapist=<id>.
    // Without this the param was dropped and the customer landed on a form that
    // had forgotten the therapist they just chose.
    preselectTherapist: req.query.therapist || "",
    // Sparse map of therapists who charge their own rate. Almost always empty —
    // most therapists use the menu price — so this adds nothing to the page in
    // the normal case.
    therapistPrices: db.getAllTherapistPrices(),
    bookingError: req.query.error || "",
    waitlisted: req.query.waitlisted === "1",
  });
});

app.post("/book", rateLimit, (req, res) => {
  const { client_name, client_phone, client_email, service_id, therapist_id, therapist2_id, gender_pref, areas, notes, addon_ids } = req.body;
  // Normalized here so the same value is validated, checked for availability
  // and written — a duplicated field arrives as an array otherwise.
  const date = String(req.body.date || "");
  const time = String(req.body.time || "");

  // An inactive service is one the spa has taken off the menu. It is still in
  // the table (bookings reference it), so it must be rejected explicitly or an
  // old form — or a hand-made POST — can still book a treatment nobody offers.
  const service = db.getServiceById(toId(service_id));
  if (!service || !service.active) return res.redirect("/book?error=invalid_service");

  // The availability check the customer saw happened in their browser, possibly
  // minutes ago. Re-validate here or two people with the same slot open in two
  // tabs both get a confirmation text and both show up.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return res.redirect("/book?error=invalid_time");
  }
  // Nothing in the past, and nothing so far out that it is either a typo or
  // someone filling the calendar with junk the staff would have to clear by hand.
  if (date < localDate(0) || date > localDate(MAX_BOOKING_DAYS_AHEAD)) {
    return res.redirect("/book?error=invalid_time");
  }

  // A therapist id only ever comes from our own <select>. If one arrives that
  // is not a real, active therapist it is either a stale page or a forged post,
  // and letting it through writes a booking assigned to nobody.
  const therapistId = toId(therapist_id);
  const therapist2Id = toId(therapist2_id);
  if ((wasSupplied(therapist_id) && !isActiveTherapistId(therapistId)) ||
      (wasSupplied(therapist2_id) && !isActiveTherapistId(therapist2Id))) {
    return res.redirect("/book?error=other");
  }

  const stillOpen = db.getAvailableSlots(
    service.id, date, therapistId, therapist2Id, gender_pref || ""
  ).some((s) => s.time === time);
  if (!stillOpen) return res.redirect("/book?error=slot_taken");

  // Lock in the price the customer was shown. If they chose a therapist with
  // their own rate, that is the price — and it cannot drift later if the menu
  // changes. "No preference" always gets the menu price, because that is what
  // was on screen.
  const bookedPrice = db.priceForTherapist(service.id, therapist_id ? parseInt(therapist_id, 10) : null);

  // Auto-save/update client profile
  if (client_phone) db.upsertClient(client_phone, client_name || "", client_email || "");

  const aidStr = addon_ids ? (Array.isArray(addon_ids) ? addon_ids.join(",") : addon_ids) : "";
  const cancelToken = crypto.randomBytes(16).toString("hex");

  const result = db.createBooking({
    clientName: client_name || client_phone,
    clientPhone: client_phone,
    clientEmail: client_email || "",
    serviceId: service.id,
    therapistId,
    therapist2Id,
    genderPref: gender_pref || "",
    notes: notes || "",
    areas: areas || "",
    date, time,
    duration: service.duration,
    source: "online",
    addonIds: aidStr,
    cancelToken,
    quotedPrice: bookedPrice,
  });

  // Send email & SMS confirmation (async, non-blocking). The booking is already
  // written — if the ledger refuses the send, the appointment still stands and
  // shows up on the front desk screen like any other.
  const booking = db.getBookingById(result.lastInsertRowid);
  const addons = aidStr ? db.getAddonsByIds(aidStr.split(",").map(Number)) : [];
  const baseUrl = publicBaseUrl(req);
  if (outboundAllowed("email", booking.client_email)) {
    email.sendBookingConfirmation(booking, addons, baseUrl).catch(() => {});
  }
  if (outboundAllowed("sms", booking.client_phone)) {
    sms.sendBookingConfirmationSMS(booking, baseUrl).catch(() => {});
  }

  // Redirect using the unguessable cancel token, not the sequential id,
  // so confirmation pages can't be enumerated to harvest customer PII.
  res.redirect("/booking-confirm/" + cancelToken);
});

app.get("/booking-confirm/:token", (req, res) => {
  const booking = db.getBookingByToken(req.params.token);
  if (!booking || bookingLinkExpired(booking)) return res.redirect("/book");
  const bookingAddons = booking.addon_ids ? db.getAddonsByIds(booking.addon_ids.split(",").map(Number)) : [];
  res.render("booking-confirm", { activePage: "book", booking, bookingAddons });
});

// Client self-service: manage / cancel / reschedule via token
function manageUrl(token, query) {
  return "/booking/manage/" + encodeURIComponent(token) + (query || "");
}

// Renders the "we can't show you this" version of the manage page.
function renderManageError(res, message) {
  res.render("booking-manage", {
    activePage: "book",
    booking: null,
    error: message,
    services: [],
    therapists: [],
    slots: [],
  });
}

app.get("/booking/manage/:token", (req, res) => {
  const booking = db.getBookingByToken(req.params.token);
  const helpLine = db.getSetting("phone") || "";

  // A cancelled booking is NOT a missing one. Collapsing the two told a customer
  // who had just cancelled that their booking did not exist, which reads as "the
  // cancellation didn't work" — and the next thing they do is phone a front desk
  // that cannot answer them in English. Show the booking, marked cancelled.
  if (!booking) {
    return renderManageError(res, "We couldn't find that booking." +
      (helpLine ? " Please call us at " + helpLine + " and we'll help." : ""));
  }
  if (bookingLinkExpired(booking)) {
    return renderManageError(res, "This booking link has expired." +
      (helpLine ? " Please call us at " + helpLine + " to book again." : ""));
  }

  res.render("booking-manage", {
    activePage: "book",
    booking,
    error: null,
    services: db.getActiveServices(),
    therapists: db.getActiveTherapists(),
    slots: [],
    // Left undefined (not false) when absent: the view tests these with typeof,
    // so a defined-but-false value would show the banner on every visit.
    cancelled: req.query.cancelled === "1" ? true : undefined,
    rescheduled: req.query.rescheduled === "1" ? true : undefined,
    rescheduleError: req.query.error === "slot_taken"
      ? "That time is no longer available. Please pick another one."
      : (req.query.error === "invalid_time"
        ? "Please choose a date and time within the next " + MAX_BOOKING_DAYS_AHEAD + " days."
        : undefined),
  });
});

app.post("/booking/cancel/:token", (req, res) => {
  const booking = db.getBookingByToken(req.params.token);
  // Only a live booking can be cancelled: an expired link or an already
  // cancelled/completed appointment just goes back to the page.
  if (!booking || bookingLinkExpired(booking) || booking.status !== "confirmed") {
    return res.redirect(manageUrl(req.params.token));
  }
  db.cancelBooking(booking.id);
  if (outboundAllowed("email", booking.client_email)) {
    email.sendCancellationEmail(booking).catch(() => {});
  }
  // Ledger these too. The whole path is anonymous-reachable: book with a
  // victim's number, read the token out of the confirm redirect, then cancel —
  // an unmetered send here would defeat the per-recipient cap entirely.
  if (outboundAllowed("sms", booking.client_phone)) {
    sms.sendCancellationSMS(booking).catch(() => {});
  }
  res.redirect(manageUrl(req.params.token, "?cancelled=1"));
});

app.post("/booking/reschedule/:token", (req, res) => {
  const booking = db.getBookingByToken(req.params.token);
  if (!booking || bookingLinkExpired(booking) || booking.status !== "confirmed") {
    return res.redirect(manageUrl(req.params.token));
  }

  // Same treatment as POST /book: this route wrote whatever date and time it was
  // handed, so a customer (or a bot) could move an appointment to 3am, to last
  // year, or on top of a slot that is already taken.
  const date = String(req.body.date || "");
  const time = String(req.body.time || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) ||
      date < localDate(0) || date > localDate(MAX_BOOKING_DAYS_AHEAD)) {
    return res.redirect(manageUrl(req.params.token, "?error=invalid_time"));
  }

  // Submitting the form unchanged is not a reschedule. Worth short-circuiting:
  // the appointment still occupies its own slot, so the availability check below
  // would report the customer's own time as taken.
  if (date === booking.date && time === booking.time) {
    return res.redirect(manageUrl(req.params.token, "?rescheduled=1"));
  }

  const stillOpen = db.getAvailableSlots(
    booking.service_id, date,
    booking.therapist_id || null,
    booking.therapist2_id || null,
    booking.gender_pref || ""
  ).some((s) => s.time === time);
  if (!stillOpen) return res.redirect(manageUrl(req.params.token, "?error=slot_taken"));

  db.rescheduleBooking(booking.id, date, time);
  res.redirect(manageUrl(req.params.token, "?rescheduled=1"));
});

// Waitlist (public form submission)
app.post("/waitlist", rateLimit, (req, res) => {
  const { client_name, client_phone, client_email, service_id, therapist_id, preferred_date, preferred_time, notes } = req.body;
  db.addToWaitlist({
    clientName: client_name,
    clientPhone: client_phone,
    clientEmail: client_email || "",
    serviceId: service_id ? parseInt(service_id, 10) : null,
    therapistId: therapist_id ? parseInt(therapist_id, 10) : null,
    preferredDate: preferred_date,
    preferredTime: preferred_time || "",
    notes: notes || "",
  });
  res.redirect("/book?waitlisted=1");
});

// Availability API
app.get("/api/availability", (req, res) => {
  const { service_id, date, therapist_id, therapist2_id, gender_pref } = req.query;
  if (!service_id || !date) return res.json({ slots: [] });
  const slots = db.getAvailableSlots(
    parseInt(service_id, 10), date,
    therapist_id ? parseInt(therapist_id, 10) : null,
    therapist2_id ? parseInt(therapist2_id, 10) : null,
    gender_pref || null
  );
  res.json({ slots });
});

// Client lookup by phone (public — used on booking forms).
// Rate limited and intentionally minimal: returns only name/email so the
// booking form can autofill. Stored preference/health notes are NOT exposed
// to this unauthenticated endpoint (staff tools use full profiles instead).
// Kiosk-or-staff only. Its remaining callers are the kiosk /checkin page and
// admin phone-booking, both already authenticated. Public, it returned a name
// and email for ANY phone number — and for a massage spa, merely confirming a
// number belongs to a client is itself sensitive.
app.get("/api/client-lookup", requireKioskApi, lookupRateLimit, (req, res) => {
  const phone = (req.query.phone || "").trim();
  if (!phone || phone.replace(/\D/g, "").length < 7) return res.json({ client: null });
  const client = db.getClientByPhone(phone);
  if (client) {
    res.json({ client: {
      name: client.name,
      email: client.email,
      phone: client.phone,
      intake_complete: !!client.intake_complete,
    }});
  } else {
    // Also check bookings for name/email from prior visits
    const history = db.getClientHistory(phone);
    if (history.length > 0) {
      res.json({ client: {
        name: history[0].client_name || "",
        email: history[0].client_email || "",
        phone: phone,
        intake_complete: false,
      }});
    } else {
      res.json({ client: null });
    }
  }
});

// Therapists API (for dynamic filtering)
// REMOVED: GET /api/therapists — it returned SELECT * from therapists to any
// anonymous caller, which included every therapist's employee PIN, their work
// schedule and their employment status. Nothing in the app ever called it; the
// pages that show therapists render them server-side. If a public therapist
// feed is ever needed, return an explicit whitelist of columns (id, name,
// gender, specialties, photo, bio) — never the row.

// Unsubscribe from update emails (CAN-SPAM). GET = the link people click;
// POST = one-click List-Unsubscribe from the mail client. Both just work.
app.get("/unsubscribe/:token", (req, res) => {
  const row = db.unsubscribeByToken(req.params.token);
  res.render("unsubscribe", {
    spaName: db.getSetting("spa_name") || "J&M Serenity Spa",
    found: !!row,
    email: row ? row.email : null,
  });
});
app.post("/unsubscribe/:token", (req, res) => {
  db.unsubscribeByToken(req.params.token);
  res.status(200).send("Unsubscribed");
});

// Email signup (coming soon page)
// Honeypot: bots fill hidden fields, real humans don't see them
app.post("/api/signup", rateLimit, (req, res) => {
  // Honeypot check — if the hidden field is filled, silently pretend we succeeded
  if (req.body._hp && req.body._hp.length > 0) {
    return res.json({ ok: true });
  }
  const email = (req.body.email || "").trim();
  // Reject obviously fake emails (common disposable/bogus patterns)
  const legitEmail = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~\-]+@[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!email || !legitEmail.test(email)) {
    return res.json({ ok: false, error: "Please enter a valid email." });
  }
  // Block common throwaway/disposable domains
  const blockedDomains = /@(mailinator\.com|guerrillamail\.com|10minutemail\.com|tempmail|yopmail|sharklasers|trashmail|throwaway|dispostable)\./i;
  if (blockedDomains.test(email)) {
    return res.json({ ok: true }); // silently accept but don't store
  }
  try {
    db.addEmailSignup(email);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: "Something went wrong." });
  }
});

/* =========================================================================
   CUSTOMER CHECK-IN (Tablet / Kiosk)
   ========================================================================= */

/* =========================================================================
   SELF CHECK-IN KIOSK (tablet at the front desk)
   ========================================================================= */

/* Kiosk device setup. Done once per tablet by a staff member using the
   front-desk PIN; the session is then kept alive for ~6 months so clients
   never see this screen. */
app.post("/kiosk/unlock", authRateLimit, (req, res) => {
  const deskPw = db.getSetting("desk_password") || "1234";
  const adminPw = db.getSetting("admin_password") || "";
  const entered = String(req.body.password || "");
  const dest = typeof req.body.next === "string" && req.body.next.startsWith("/") && !req.body.next.startsWith("//")
    ? req.body.next
    : "/arrive";
  if (entered && (entered === deskPw || (adminPw && entered === adminPw))) {
    return req.session.regenerate((err) => {
      if (err) return res.status(500).render("kiosk-unlock", { next: dest, error: "Something went wrong. Try again." });
      req.session.kiosk = true;
      authLimitMap.delete("/kiosk/unlock|" + (req.ip || ""));
      req.session.cookie.maxAge = KIOSK_SESSION_MS;
      res.redirect(dest);
    });
  }
  res.status(401).render("kiosk-unlock", { next: dest, error: "Wrong PIN. Try again." });
});

app.get("/arrive", requireKioskPage, (req, res) => {
  res.render("arrive", { services: db.getActiveServices() });
});

// Look up today's appointments for a phone number
app.post("/api/arrive/lookup", requireKioskApi, lookupRateLimit, (req, res) => {
  const phone = (req.body.phone || "").trim();
  if (!phone || phone.replace(/\D/g, "").length < 7) return res.json({ bookings: [] });
  const bookings = db.getTodayBookingsByPhone(phone).map(function (b) {
    return {
      id: b.id,
      time: b.time,
      service: b.service_name || "",
      therapist: b.therapist_name || "",
      name: b.client_name || "",
      arrived: !!b.arrived_at,
    };
  });
  res.json({ bookings });
});

// Mark an appointment as arrived / checked in
app.post("/api/arrive/checkin", requireKioskApi, (req, res) => {
  const id = parseInt(req.body.booking_id, 10);
  if (!id) return res.json({ ok: false });
  db.markBookingArrived(id);
  res.json({ ok: true });
});

// Walk-in: add to the front-desk waiting list
app.post("/api/arrive/walkin", requireKioskApi, (req, res) => {
  const name = (req.body.name || "").trim();
  const phone = (req.body.phone || "").trim();
  const serviceId = req.body.service_id ? parseInt(req.body.service_id, 10) : null;
  if (!name || !phone) return res.json({ ok: false, error: "Please enter your name and phone number." });
  const now = new Date();
  const hh = now.getHours(), mm = String(now.getMinutes()).padStart(2, "0");
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  db.addToWaitlist({
    clientName: name,
    clientPhone: phone,
    clientEmail: "",
    serviceId: serviceId,
    therapistId: null,
    preferredDate: localDate(0),
    preferredTime: "Walk-in",
    notes: "Walk-in — checked in at " + h12 + ":" + mm + " " + ampm,
  });
  res.json({ ok: true });
});

app.get("/checkin", requireKioskPage, (req, res) => {
  res.render("checkin", {});
});

app.post("/checkin", requireKioskPage, (req, res) => {
  const { phone, name, email, birthday, address,
    emergency_name, emergency_phone,
    health_conditions, allergies, medications,
    pregnancy, pressure_pref, areas_to_focus, areas_to_avoid,
    notes, consent } = req.body;

  if (!phone || phone.replace(/\D/g, "").length < 7) {
    return res.redirect("/checkin");
  }

  // Upsert basic client info first
  db.upsertClient(phone, name || "", email || "");

  // Now update the full intake
  db.updateClientIntake(phone, {
    name: name || "",
    email: email || "",
    birthday: birthday || "",
    address: address || "",
    emergency_name: emergency_name || "",
    emergency_phone: emergency_phone || "",
    health_conditions: health_conditions || "",
    allergies: allergies || "",
    medications: medications || "",
    pregnancy: pregnancy === "1" ? 1 : 0,
    pressure_pref: pressure_pref || "",
    areas_to_focus: areas_to_focus || "",
    areas_to_avoid: areas_to_avoid || "",
    notes: notes || "",
    consent_signed: consent === "1" ? 1 : 0,
    consent_date: consent === "1" ? new Date().toISOString().split("T")[0] : "",
    intake_complete: 1,
  });

  res.render("checkin", { success: { name: name || "" } });
});

/* =========================================================================
   ADMIN ROUTES
   ========================================================================= */

app.get("/admin/login", (req, res) => res.render("admin/login", { activePage: "admin", error: null }));

app.post("/admin/login", authRateLimit, (req, res) => {
  const password = db.getSetting("admin_password") || "serenity2025";
  if (req.body.password === password) {
    // Regenerate the session on privilege change to prevent session fixation.
    return req.session.regenerate((err) => {
      if (err) return res.render("admin/login", { activePage: "admin", error: "Login error, please try again." });
      req.session.admin = true;
      res.redirect("/admin");
    });
  }
  res.render("admin/login", { activePage: "admin", error: "Incorrect password" });
});

app.get("/admin/logout", (req, res) => { req.session.destroy(); res.redirect("/"); });

// Front Desk (simplified view)
app.get("/admin/front-desk", requireAdmin, (req, res) => {
  const today = localDate(0);
  const todayBookings = db.getBookingsForDate(today).map((b) => {
    b.is_member = b.client_phone ? !!db.getMemberByPhone(b.client_phone) : false;
    return b;
  });
  res.render("admin/front-desk", {
    query: req.query,
    activePage: "admin-dashboard",
    todayBookings,
    upcoming: db.getUpcomingBookings(10),
    therapists: db.getActiveTherapists(),
    services: db.getActiveServices(),
    allAddons: db.getAllAddons(),
    waiting: db.getWaitlist().filter((w) => w.preferred_date === today),
    booked: req.query.booked === "1",
    seated: req.query.seated || false,
  });
});

// Dashboard
app.get("/admin", requireAdmin, (req, res) => {
  const today = localDate(0);
  const viewDate = req.query.date || today;
  const todayBookings = db.getBookingsForDate(viewDate).map((b) => {
    b.is_member = b.client_phone ? !!db.getMemberByPhone(b.client_phone) : false;
    return b;
  });
  res.render("admin/dashboard", {
    activePage: "admin-dashboard",
    stats: db.getBookingStats(),
    todayBookings,
    upcoming: db.getUpcomingBookings(20),
    therapists: db.getActiveTherapists(),
    summary: db.getDailySummary(viewDate),
    allAddons: db.getAllAddons(),
    today,
    viewDate,
    signupCount: db.getEmailSignupCount(),
    smsHealth: sms.getSmsHealth(),
  });
});

// Therapists management
app.get("/admin/therapists", requireAdmin, (req, res) => {
  const editId = req.query.edit ? parseInt(req.query.edit, 10) : null;
  res.render("admin/therapists", {
    activePage: "admin-therapists",
    therapists: db.getAllTherapists(),
    services: db.getActiveServices(),
    editTherapist: editId ? db.getTherapistById(editId) : null,
    therapistPrices: editId ? db.getTherapistPrices(editId) : [],
  });
});

app.post("/admin/therapists", requireAdmin, upload.single("photo"), (req, res) => {
  const { name, gender, specialties, service_ids, bio, work_days, start_time, end_time, pin } = req.body;
  const sids = Array.isArray(service_ids) ? service_ids.join(",") : service_ids || "";
  const wdays = Array.isArray(work_days) ? work_days.join(",") : work_days || "";
  const photo = req.file ? "/images/therapists/" + req.file.filename : "";
  const info = db.addTherapist(name, gender || "female", specialties || "", sids, photo, bio || "", wdays, start_time || "", end_time || "", pin || "");
  if (info && info.lastInsertRowid) {
    db.setTherapistPay(info.lastInsertRowid, req.body.commission_percent, req.body.housing_status, req.body.housing_rent_monthly);
  }
  res.redirect("/admin/therapists");
});

app.post("/admin/therapists/:id/edit", requireAdmin, upload.single("photo"), (req, res) => {
  const { name, gender, specialties, service_ids, bio, existing_photo, work_days, start_time, end_time, pin } = req.body;
  const sids = Array.isArray(service_ids) ? service_ids.join(",") : service_ids || "";
  const wdays = Array.isArray(work_days) ? work_days.join(",") : work_days || "";
  const photo = req.file ? "/images/therapists/" + req.file.filename : (existing_photo || "");
  const tid = parseInt(req.params.id, 10);
  db.updateTherapist(tid, name, gender || "female", specialties || "", sids, photo, bio || "", wdays, start_time || "", end_time || "", pin || "");
  db.setTherapistPay(tid, req.body.commission_percent, req.body.housing_status, req.body.housing_rent_monthly);
  // Per-service price overrides: a blank or zero field clears the override and
  // the menu price applies again.
  db.getActiveServices().forEach((svc) => {
    const raw = req.body["price_" + svc.id];
    if (raw !== undefined) db.setTherapistPrice(tid, svc.id, parseFloat(raw) || 0);
  });
  res.redirect("/admin/therapists?edit=" + tid);
});

app.post("/admin/therapists/:id/toggle", requireAdmin, (req, res) => {
  db.toggleTherapist(parseInt(req.params.id, 10));
  res.redirect("/admin/therapists");
});

app.post("/admin/therapists/:id/delete", requireAdmin, (req, res) => {
  db.deleteTherapist(parseInt(req.params.id, 10));
  res.redirect("/admin/therapists");
});

app.post("/admin/therapists/:id/departed", requireAdmin, (req, res) => {
  const status = req.body.departure_status || "left";
  db.markTherapistDeparted(parseInt(req.params.id, 10), status);
  res.redirect("/admin/therapists");
});

app.post("/admin/therapists/:id/rehire", requireAdmin, (req, res) => {
  db.reactivateTherapist(parseInt(req.params.id, 10));
  res.redirect("/admin/therapists");
});

// Services & Add-Ons management
app.get("/admin/services", requireAdmin, (req, res) => {
  const editId = req.query.edit ? parseInt(req.query.edit, 10) : null;
  const editAddonId = req.query.editAddon ? parseInt(req.query.editAddon, 10) : null;
  res.render("admin/services", {
    activePage: "admin-services",
    services: db.getAllServices(),
    addons: db.getAllAddons(),
    editService: editId ? db.getServiceById(editId) : null,
    editAddon: editAddonId ? db.getAddonById(editAddonId) : null,
  });
});

app.post("/admin/services", requireAdmin, (req, res) => {
  const { name, description, duration, price, category, good_for } = req.body;
  db.addService(name, description || "", parseInt(duration, 10), parseFloat(price), category, good_for || "");
  res.redirect("/admin/services");
});

app.post("/admin/services/:id/edit", requireAdmin, (req, res) => {
  const { name, description, duration, price, category, good_for } = req.body;
  db.updateService(parseInt(req.params.id, 10), name, description || "", parseInt(duration, 10), parseFloat(price), category, good_for || "");
  res.redirect("/admin/services");
});

app.post("/admin/services/:id/toggle", requireAdmin, (req, res) => {
  db.toggleService(parseInt(req.params.id, 10));
  res.redirect("/admin/services");
});

app.post("/admin/services/:id/delete", requireAdmin, (req, res) => {
  db.deleteService(parseInt(req.params.id, 10));
  res.redirect("/admin/services");
});

// Add-Ons CRUD
app.post("/admin/addons", requireAdmin, (req, res) => {
  const { name, description, price } = req.body;
  db.addAddon(name, description || "", parseFloat(price));
  res.redirect("/admin/services#addons");
});

app.post("/admin/addons/:id/edit", requireAdmin, (req, res) => {
  const { name, description, price } = req.body;
  db.updateAddon(parseInt(req.params.id, 10), name, description || "", parseFloat(price));
  res.redirect("/admin/services#addons");
});

app.post("/admin/addons/:id/toggle", requireAdmin, (req, res) => {
  db.toggleAddon(parseInt(req.params.id, 10));
  res.redirect("/admin/services#addons");
});

app.post("/admin/addons/:id/delete", requireAdmin, (req, res) => {
  db.deleteAddon(parseInt(req.params.id, 10));
  res.redirect("/admin/services#addons");
});

// Phone booking
app.get("/admin/phone-booking", requireAdmin, (req, res) => {
  res.render("admin/phone-booking", {
    activePage: "admin-phone",
    services: db.getActiveServices(),
    addons: db.getActiveAddons(),
    therapists: db.getActiveTherapists(),
  });
});

app.post("/admin/phone-booking", requireStaff, (req, res) => {
  const { client_name, client_phone, client_email, service_id, therapist_id, therapist2_id, gender_pref, date, time, areas, notes, addon_ids, recurring_weeks } = req.body;
  const service = db.getServiceById(parseInt(service_id, 10));
  if (!service) return res.redirect(req.session.admin ? "/admin/phone-booking?error=1" : "/desk/booking?error=1");

  // Auto-save/update client profile
  if (client_phone) db.upsertClient(client_phone, client_name || "", client_email || "");

  const aidStr = addon_ids ? (Array.isArray(addon_ids) ? addon_ids.join(",") : addon_ids) : "";
  const recurringId = recurring_weeks && parseInt(recurring_weeks, 10) > 0 ? crypto.randomBytes(8).toString("hex") : "";
  const weeksCount = parseInt(recurring_weeks, 10) || 0;

  // Create the initial booking
  const cancelToken = crypto.randomBytes(16).toString("hex");
  db.createBooking({
    clientName: client_name || client_phone,
    clientPhone: client_phone,
    clientEmail: client_email || "",
    serviceId: parseInt(service_id, 10),
    therapistId: therapist_id ? parseInt(therapist_id, 10) : null,
    therapist2Id: therapist2_id ? parseInt(therapist2_id, 10) : null,
    genderPref: gender_pref || "",
    notes: notes || "",
    areas: areas || "",
    date, time,
    duration: service.duration,
    source: "phone",
    addonIds: aidStr,
    cancelToken,
    recurringId,
  });

  // Send SMS confirmation for phone booking (async, non-blocking)
  if (client_phone) {
    const phoneBooking = db.getBookingByToken(cancelToken);
    if (phoneBooking) {
      const baseUrl = req.protocol + "://" + req.get("host");
      sms.sendBookingConfirmationSMS(phoneBooking, baseUrl).catch(() => {});
    }
  }

  // Create recurring bookings if specified
  if (recurringId && weeksCount > 0) {
    for (let w = 1; w <= weeksCount; w++) {
      // Anchor at local noon and read back local parts. new Date("YYYY-MM-DD")
      // parses as UTC midnight, and mixing that with toISOString() drops or
      // adds a day across the spring-forward boundary.
      const [ry, rm, rd] = String(date).split("-").map(Number);
      const d = new Date(ry, rm - 1, rd, 12, 0, 0);
      d.setDate(d.getDate() + 7 * w);
      const futureDate = d.getFullYear() + "-" +
        String(d.getMonth() + 1).padStart(2, "0") + "-" +
        String(d.getDate()).padStart(2, "0");
      const futureToken = crypto.randomBytes(16).toString("hex");
      db.createBooking({
        clientName: client_name,
        clientPhone: client_phone,
        clientEmail: client_email || "",
        serviceId: parseInt(service_id, 10),
        therapistId: therapist_id ? parseInt(therapist_id, 10) : null,
        therapist2Id: therapist2_id ? parseInt(therapist2_id, 10) : null,
        genderPref: gender_pref || "",
        notes: notes || "",
        areas: areas || "",
        date: futureDate, time,
        duration: service.duration,
        source: "phone",
        addonIds: aidStr,
        cancelToken: futureToken,
        recurringId,
      });
    }
  }

  // Desk-only staff can't view /admin — send them back to the front desk.
  res.redirect(req.session.admin ? "/admin?booked=1" : "/desk?booked=1");
});

app.post("/admin/bookings/:id/cancel", requireStaff, (req, res) => {
  const booking = db.getBookingById(parseInt(req.params.id, 10));
  db.cancelBooking(parseInt(req.params.id, 10));
  if (booking) sms.sendCancellationSMS(booking).catch(() => {});
  const back = safeBack(req, "/admin");
  res.redirect(back);
});

app.post("/admin/bookings/:id/complete", requireStaff, (req, res) => {
  const { payment_method, tip_amount, completed_by, gift_cert_code, discount_code, tip_method } = req.body;
  const bookingId = parseInt(req.params.id, 10);

  // What the customer actually owes: service + add-ons, less a VALIDATED
  // discount. Discounts used to only bump a usage counter — the customer was
  // charged full price — and an expired or used-up code was accepted.
  const quote = db.quoteBooking(bookingId, discount_code);
  const charged = quote ? quote.total : 0;
  const discountAmt = quote ? quote.discount : 0;
  let paid = charged;

  if (payment_method === "Gift Certificate" && gift_cert_code) {
    const cert = db.getGiftCertificateByCode(String(gift_cert_code).trim().toUpperCase());
    if (!cert || cert.status !== "active" || cert.balance <= 0) {
      return res.redirect(safeBack(req, "/admin") + "?gc_error=1");
    }
    // A card that only partly covers the bill used to be marked PAID IN FULL —
    // a $20 card silently settled a $95 massage. Stop and tell the desk what is
    // still owed instead of quietly losing the difference.
    if (cert.balance + 0.001 < charged) {
      const remaining = Math.round((charged - cert.balance) * 100) / 100;
      return res.redirect(
        safeBack(req, "/admin") +
        "?gc_short=1&gc_covers=" + encodeURIComponent(cert.balance.toFixed(2)) +
        "&gc_owed=" + encodeURIComponent(remaining.toFixed(2))
      );
    }
    db.redeemGiftCertificate(
      cert.id, charged,
      (db.getBookingById(bookingId) || {}).client_name || "",
      "Booking #" + bookingId
    );
  }

  // Count the discount once, only if it was genuinely applied.
  if (quote && quote.discountRow) db.incrementDiscountUse(quote.discountRow.id);

  // If nobody picked, infer from how they paid: a cash sale's tip is cash,
  // anything else is on the card and therefore owed to the therapist.
  const tipHow = String(tip_method || "").toLowerCase() === "cash" ? "cash"
    : String(tip_method || "").toLowerCase() === "card" ? "card"
    : (String(payment_method || "").toLowerCase().includes("cash") ? "cash" : "card");

  db.completeBooking(bookingId, payment_method, parseFloat(tip_amount) || 0, completed_by || "", {
    charged, paid, discount: discountAmt, tipMethod: tipHow, quoted: charged,
  });
  const back = safeBack(req, "/admin");
  res.redirect(back);
});

app.post("/admin/bookings/:id/noshow", requireStaff, (req, res) => {
  db.noShowBooking(parseInt(req.params.id, 10));
  const back = safeBack(req, "/admin");
  res.redirect(back);
});

// ---- Manual Text Message ----
app.post("/admin/send-text", requireStaff, (req, res) => {
  const { phone, message } = req.body;
  if (phone && message) {
    sms.sendSMS(phone, message).catch(() => {});
  }
  res.redirect(safeBack(req, "/admin"));
});

// ---- Square Terminal Checkout ----
app.post("/admin/bookings/:id/charge", requireStaff, async (req, res) => {
  const booking = db.getBookingById(parseInt(req.params.id, 10));
  if (!booking) return res.redirect("/admin");

  const service = db.getServiceById(booking.service_id);
  const servicePrice = service ? service.price : 0;

  // Calculate add-on totals
  let addonTotal = 0;
  if (booking.addon_ids) {
    const addons = db.getAddonsByIds(booking.addon_ids.split(",").map(Number));
    addonTotal = addons.reduce((sum, a) => sum + a.price, 0);
  }

  // Check membership discount
  let discount = 0;
  const member = booking.client_phone ? db.getMemberByPhone(booking.client_phone) : null;
  if (member && member.discount_percent > 0) {
    discount = (servicePrice * member.discount_percent) / 100;
  }

  const totalDollars = servicePrice + addonTotal - discount;
  const amountCents = Math.round(totalDollars * 100);
  const note = `${booking.service_name || "Service"} - ${booking.client_name}`;

  const checkout = await square.createTerminalCheckout(amountCents, note, {
    allowTip: true,
    bookingId: booking.id,
  });

  if (checkout) {
    const back = safeBack(req, "/admin");
    const sep = back.includes("?") ? "&" : "?";
    res.redirect(back + sep + "terminal_sent=1&checkout_id=" + checkout.id);
  } else {
    const back = safeBack(req, "/admin");
    const sep = back.includes("?") ? "&" : "?";
    res.redirect(back + sep + "terminal_error=1");
  }
});

// Check terminal checkout status (AJAX endpoint)
app.get("/api/admin/checkout-status/:checkoutId", requireStaff, async (req, res) => {
  const checkout = await square.getTerminalCheckout(req.params.checkoutId);
  if (!checkout) return res.json({ status: "unknown" });
  res.json({
    status: checkout.status,
    paymentId: checkout.paymentIds ? checkout.paymentIds[0] : null,
    tipMoney: checkout.tipMoney || null,
  });
});

// ---- Memberships (admin) ----
app.get("/admin/memberships", requireAdmin, (req, res) => {
  const editPlanId = req.query.editPlan ? parseInt(req.query.editPlan, 10) : null;
  const editMemberId = req.query.editMember ? parseInt(req.query.editMember, 10) : null;
  res.render("admin/memberships", {
    activePage: "admin-memberships",
    plans: db.getAllMembershipPlans(),
    members: db.getAllMembers(),
    services: db.getActiveServices(),
    editPlan: editPlanId ? db.getMembershipPlanById(editPlanId) : null,
    editMember: editMemberId ? db.getMemberById(editMemberId) : null,
  });
});

app.post("/admin/memberships/plans", requireAdmin, (req, res) => {
  const { name, description, monthly_price, visits_per_month, discount_percent, included_service_ids, addon_credits, guest_passes } = req.body;
  const sids = Array.isArray(included_service_ids) ? included_service_ids.join(",") : included_service_ids || "";
  db.addMembershipPlan(name, description, parseFloat(monthly_price), parseInt(visits_per_month, 10) || 1, parseInt(discount_percent, 10) || 0, sids, parseInt(addon_credits, 10) || 0, parseInt(guest_passes, 10) || 0);
  res.redirect("/admin/memberships");
});

app.post("/admin/memberships/plans/:id/edit", requireAdmin, (req, res) => {
  const { name, description, monthly_price, visits_per_month, discount_percent, included_service_ids, addon_credits, guest_passes } = req.body;
  const sids = Array.isArray(included_service_ids) ? included_service_ids.join(",") : included_service_ids || "";
  db.updateMembershipPlan(parseInt(req.params.id, 10), name, description, parseFloat(monthly_price), parseInt(visits_per_month, 10) || 1, parseInt(discount_percent, 10) || 0, sids, parseInt(addon_credits, 10) || 0, parseInt(guest_passes, 10) || 0);
  res.redirect("/admin/memberships");
});

app.post("/admin/memberships/plans/:id/toggle", requireAdmin, (req, res) => {
  db.toggleMembershipPlan(parseInt(req.params.id, 10));
  res.redirect("/admin/memberships");
});

app.post("/admin/memberships/members", requireAdmin, (req, res) => {
  const { client_name, client_phone, client_email, plan_id, start_date, square_subscription_id, notes } = req.body;
  db.addMember(client_name, client_phone, client_email, parseInt(plan_id, 10), start_date || localDate(0), square_subscription_id, notes);
  res.redirect("/admin/memberships#members");
});

app.post("/admin/memberships/members/:id/edit", requireAdmin, (req, res) => {
  const { client_name, client_phone, client_email, plan_id, status, notes } = req.body;
  db.updateMember(parseInt(req.params.id, 10), client_name, client_phone, client_email, parseInt(plan_id, 10), status, notes);
  res.redirect("/admin/memberships#members");
});

app.post("/admin/memberships/members/:id/pause", requireAdmin, (req, res) => {
  db.pauseMember(parseInt(req.params.id, 10));
  res.redirect("/admin/memberships#members");
});

app.post("/admin/memberships/members/:id/cancel", requireAdmin, (req, res) => {
  db.cancelMember(parseInt(req.params.id, 10));
  res.redirect("/admin/memberships#members");
});

app.post("/admin/memberships/members/:id/reactivate", requireAdmin, (req, res) => {
  db.reactivateMember(parseInt(req.params.id, 10));
  res.redirect("/admin/memberships#members");
});

app.post("/admin/memberships/members/:id/renew", requireAdmin, (req, res) => {
  db.renewMemberVisits(parseInt(req.params.id, 10));
  res.redirect("/admin/memberships#members");
});

app.post("/admin/memberships/members/:id/use-visit", requireStaff, (req, res) => {
  db.useMemberVisit(parseInt(req.params.id, 10), req.body.booking_id ? parseInt(req.body.booking_id, 10) : null);
  const back = safeBack(req, "/admin/memberships#members");
  res.redirect(back);
});

// Public memberships page
app.get("/memberships", (req, res) => {
  res.render("memberships", {
    activePage: "memberships",
    plans: db.getActiveMembershipPlans(),
  });
});

// API: Look up gift certificate by code (used in complete form)
app.get("/api/admin/gift-cert-check", requireStaff, (req, res) => {
  const code = (req.query.code || "").trim().toUpperCase();
  if (!code) return res.json({ cert: null });
  const cert = db.getGiftCertificateByCode(code);
  if (cert && cert.status === "active" && cert.balance > 0) {
    res.json({ cert: { code: cert.code, balance: cert.balance, recipient: cert.recipient_name, purchaser: cert.purchaser_name } });
  } else {
    res.json({ cert: null, error: cert ? "Certificate has no remaining balance" : "Certificate not found" });
  }
});

// API: Validate discount code
app.get("/api/admin/discount-check", requireStaff, (req, res) => {
  const code = (req.query.code || "").trim().toUpperCase();
  if (!code) return res.json({ discount: null });
  const disc = db.getDiscountCodeByCode(code);
  if (disc) {
    res.json({ discount: { code: disc.code, name: disc.name, type: disc.type, value: disc.value, description: disc.description } });
  } else {
    res.json({ discount: null });
  }
});

// API: Verify employee PIN (returns employee name or error)
app.get("/api/admin/pin-check", requireStaff, (req, res) => {
  const pin = (req.query.pin || "").trim();
  if (!pin) return res.json({ employee: null });
  const therapist = db.getTherapistByPin(pin);
  if (therapist) {
    res.json({ employee: { id: therapist.id, name: therapist.name } });
  } else {
    res.json({ employee: null });
  }
});

// REMOVED: GET /api/member-check — the comment claimed it was "used in booking
// form" but nothing ever called it. It disclosed a member's name, plan, visits
// remaining and discount to any anonymous caller who supplied a phone number.
// Membership status is shown at the front desk (/desk/members), which is authed.

// API: Get quarterly tax summary
app.get("/api/admin/quarterly-tax", requireAdmin, (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const quarter = parseInt(req.query.quarter, 10) || 1;
  if (quarter < 1 || quarter > 4) return res.json({ quarterly: null });
  const quarterly = db.getQuarterlyTaxSummary(year, quarter);
  res.json({ quarterly });
});

// ---- Discount Codes / Partnerships ----
app.get("/admin/discounts", requireAdmin, (req, res) => {
  const editId = req.query.edit ? parseInt(req.query.edit, 10) : null;
  res.render("admin/discounts", {
    activePage: "admin-discounts",
    codes: db.getAllDiscountCodes(),
    editCode: editId ? db.getDiscountCodeById(editId) : null,
  });
});

app.post("/admin/discounts", requireAdmin, (req, res) => {
  const { code, name, type, value, description } = req.body;
  db.addDiscountCode(code, name, type, parseFloat(value), description);
  res.redirect("/admin/discounts");
});

app.post("/admin/discounts/:id/edit", requireAdmin, (req, res) => {
  const { code, name, type, value, description } = req.body;
  db.updateDiscountCode(parseInt(req.params.id, 10), code, name, type, parseFloat(value), description);
  res.redirect("/admin/discounts");
});

app.post("/admin/discounts/:id/toggle", requireAdmin, (req, res) => {
  db.toggleDiscountCode(parseInt(req.params.id, 10));
  res.redirect("/admin/discounts");
});

app.post("/admin/discounts/:id/delete", requireAdmin, (req, res) => {
  db.deleteDiscountCode(parseInt(req.params.id, 10));
  res.redirect("/admin/discounts");
});

// ---- Blocked Times ----
app.get("/admin/blocked-times", requireAdmin, (req, res) => {
  res.render("admin/blocked-times", {
    activePage: "admin-blocked",
    blockedTimes: db.getBlockedTimes(),
    therapists: db.getActiveTherapists(),
  });
});

app.post("/admin/blocked-times", requireAdmin, (req, res) => {
  const { therapist_id, date, start_time, end_time, all_day, reason } = req.body;
  db.addBlockedTime(parseInt(therapist_id, 10), date, start_time || "", end_time || "", all_day === "on" || all_day === "1", reason || "");
  res.redirect("/admin/blocked-times");
});

app.post("/admin/blocked-times/:id/delete", requireAdmin, (req, res) => {
  db.deleteBlockedTime(parseInt(req.params.id, 10));
  res.redirect("/admin/blocked-times");
});

// ---- Waitlist ----
app.get("/admin/waitlist", requireAdmin, (req, res) => {
  res.render("admin/waitlist", {
    activePage: "admin-waitlist",
    waitlist: db.getWaitlist(),
  });
});

app.post("/admin/waitlist/:id/contacted", requireAdmin, (req, res) => {
  db.removeFromWaitlist(parseInt(req.params.id, 10));
  res.redirect("/admin/waitlist");
});

app.post("/admin/waitlist/:id/delete", requireAdmin, (req, res) => {
  db.deleteWaitlistEntry(parseInt(req.params.id, 10));
  res.redirect("/admin/waitlist");
});

// ---- Client Lookup ----
app.get("/admin/clients", requireAdmin, (req, res) => {
  const query = req.query.q || "";
  const clients = query ? db.searchClients(query) : [];
  const phone = req.query.phone || "";
  const history = phone ? db.getClientHistory(phone) : [];
  res.render("admin/clients", {
    activePage: "admin-clients",
    query, clients, phone, history,
  });
});

// ---- Reports ----
app.get("/admin/reports", requireAdmin, (req, res) => {
  const today = new Date();
  const endDate = req.query.end || today.toISOString().slice(0, 10);
  const startDefault = new Date(today);
  startDefault.setDate(startDefault.getDate() - 30);
  const startDate = req.query.start || startDefault.toISOString().slice(0, 10);

  res.render("admin/reports", {
    activePage: "admin-reports",
    startDate, endDate,
    revenue: db.getRevenueReport(startDate, endDate),
    popularServices: db.getPopularServices(startDate, endDate),
    therapistPerformance: db.getTherapistPerformance(startDate, endDate),
    busiestTimes: db.getBusiestTimes(startDate, endDate),
    busiestDays: db.getBusiestDays(startDate, endDate),
  });
});

// ---- Gift Certificates (admin) ----
app.get("/admin/gift-certificates", requireAdmin, (req, res) => {
  res.render("admin/gift-certificates", {
    activePage: "admin-gifts",
    certificates: db.getAllGiftCertificates(),
    redemptions: db.getAllRedemptions(),
    not_paid: req.query.not_paid || false,
    pin_error: req.query.pin_error || false,
  });
});

app.post("/admin/gift-certificates", requireStaff, async (req, res) => {
  const { purchaser_name, purchaser_email, recipient_name, amount, message, payment_method, employee_pin } = req.body;
  const code = "JMS-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  const parsedAmount = parseFloat(amount);

  // Require a valid employee PIN so every gift-cert issuance is attributable.
  const emp = db.getTherapistByPin((employee_pin || "").trim());
  if (!emp) {
    const back = safeBack(req, "/admin/gift-certificates");
    return res.redirect(back + "?pin_error=1");
  }
  const createdBy = emp.name;

  if (payment_method === "Square Terminal") {
    db.createGiftCertificate(code, purchaser_name, purchaser_email || "", recipient_name || "", parsedAmount, message || "", "", createdBy);
    const cert = db.getGiftCertificateByCode(code);
    if (cert) {
      const checkout = await square.createTerminalCheckout(Math.round(parsedAmount * 100), "Gift Certificate " + code + " - " + purchaser_name, { allowTip: false });
      if (checkout) {
        db.markGiftCertificatePaid(cert.id, "Square Terminal");
        return res.redirect(giftBase(req) + "/gift-certificates?terminal_sent=1");
      }
    }
    return res.redirect(giftBase(req) + "/gift-certificates?terminal_error=1");
  }

  // All other payment methods — mark as paid immediately
  db.createGiftCertificate(code, purchaser_name, purchaser_email || "", recipient_name || "", parsedAmount, message || "", payment_method || "", createdBy);
  res.redirect(giftBase(req) + "/gift-certificates");
});

// Mark a gift certificate as paid (if created without payment initially)
app.post("/admin/gift-certificates/:id/mark-paid", requireStaff, (req, res) => {
  const { payment_method, employee_pin } = req.body;
  // Require a valid employee PIN.
  const emp = db.getTherapistByPin((employee_pin || "").trim());
  if (!emp) {
    const back = safeBack(req, "/admin/gift-certificates");
    return res.redirect(back + "?pin_error=1");
  }
  db.markGiftCertificatePaid(parseInt(req.params.id, 10), payment_method || "Cash");
  res.redirect(giftBase(req) + "/gift-certificates");
});

// Send gift cert charge to Square Terminal
app.post("/admin/gift-certificates/:id/charge", requireStaff, async (req, res) => {
  const cert = db.getGiftCertificateById(parseInt(req.params.id, 10));
  if (!cert) return res.redirect(giftBase(req) + "/gift-certificates");

  const amountCents = Math.round(cert.amount * 100);
  const note = "Gift Certificate " + cert.code + " - " + cert.purchaser_name;

  const checkout = await square.createTerminalCheckout(amountCents, note, { allowTip: false });
  if (checkout) {
    // Mark as paid immediately (terminal will handle the actual charge)
    db.markGiftCertificatePaid(cert.id, "Square Terminal");
    res.redirect(giftBase(req) + "/gift-certificates?terminal_sent=1");
  } else {
    res.redirect(giftBase(req) + "/gift-certificates?terminal_error=1");
  }
});

// Barcode label for the back of a pre-printed gift card (browser-print fallback)
app.get("/admin/gift-certificates/:id/label", requireStaff, (req, res) => {
  const cert = db.getGiftCertificateById(parseInt(req.params.id, 10));
  if (!cert) return res.redirect(giftBase(req) + "/gift-certificates");
  if (!cert.paid) return res.redirect(giftBase(req) + "/gift-certificates?not_paid=1");
  res.render("admin/gift-cert-label", { cert });
});

// Silent one-click label print — sends ZPL straight to the networked Zebra.
app.post("/admin/gift-certificates/:id/print-zpl", requireStaff, async (req, res) => {
  const cert = db.getGiftCertificateById(parseInt(req.params.id, 10));
  if (!cert) return res.json({ ok: false, error: "Gift certificate not found" });
  if (!cert.paid) return res.json({ ok: false, error: "This gift certificate isn't marked paid yet" });
  const ip = (db.getSetting("label_printer_ip") || "").trim();
  if (!ip) return res.json({ ok: false, configured: false });
  const port = parseInt(db.getSetting("label_printer_port") || "9100", 10);
  try {
    const label = require("./lib/label");
    await label.sendToPrinter(ip, port, label.buildGiftCertZpl(cert.code, cert.amount));
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: "Couldn't reach the label printer at " + ip + ":" + port + " (" + e.message + ")" });
  }
});

app.get("/admin/gift-certificates/:id/print", requireStaff, (req, res) => {
  const cert = db.getGiftCertificateById(parseInt(req.params.id, 10));
  if (!cert) return res.redirect(giftBase(req) + "/gift-certificates");
  // Block printing if not paid
  if (!cert.paid) return res.redirect(giftBase(req) + "/gift-certificates?not_paid=1");
  res.render("admin/gift-certificate-print", { cert, settings: db.getAllSettings() });
});

app.post("/admin/gift-certificates/:id/redeem", requireStaff, (req, res) => {
  const { amount, redeemed_by, notes, employee_pin } = req.body;
  // Require a valid employee PIN so every redemption is attributable.
  const emp = db.getTherapistByPin((employee_pin || "").trim());
  if (!emp) {
    const back = safeBack(req, "/admin/gift-certificates");
    return res.redirect(back + "?pin_error=1");
  }
  const staffName = emp.name;
  db.redeemGiftCertificate(parseInt(req.params.id, 10), parseFloat(amount) || 0, redeemed_by || "", (notes ? notes + " " : "") + "[Staff: " + staffName + "]");
  res.redirect(giftBase(req) + "/gift-certificates");
});

// ---- Reviews (admin) ----
app.get("/admin/reviews", requireAdmin, (req, res) => {
  res.render("admin/reviews", {
    activePage: "admin-reviews",
    reviews: db.getAllReviews(),
  });
});

app.post("/admin/reviews/:id/approve", requireAdmin, (req, res) => {
  db.approveReview(parseInt(req.params.id, 10));
  res.redirect("/admin/reviews");
});

app.post("/admin/reviews/:id/feature", requireAdmin, (req, res) => {
  db.toggleReviewFeatured(parseInt(req.params.id, 10));
  res.redirect("/admin/reviews");
});

app.post("/admin/reviews/:id/delete", requireAdmin, (req, res) => {
  db.deleteReview(parseInt(req.params.id, 10));
  res.redirect("/admin/reviews");
});

// ---- Gallery (admin) ----
app.get("/admin/gallery", requireAdmin, (req, res) => {
  res.render("admin/gallery", {
    activePage: "admin-gallery",
    images: db.getAllGalleryImages(),
  });
});

app.post("/admin/gallery", requireAdmin, galleryUpload.single("image"), (req, res) => {
  if (req.file) {
    db.addGalleryImage("/images/gallery/" + req.file.filename, req.body.caption || "", parseInt(req.body.sort_order, 10) || 0);
  }
  res.redirect("/admin/gallery");
});

app.post("/admin/gallery/:id/delete", requireAdmin, (req, res) => {
  db.deleteGalleryImage(parseInt(req.params.id, 10));
  res.redirect("/admin/gallery");
});

// Expenses
/* =========================================================================
   Scanned receipt inbox
   -------------------------------------------------------------------------
   The printer scans into scans/incoming; lib/scan-watch.js ingests them as
   "unfiled". Here they are given a category and a total and turned into an
   expense. No OCR — a person reads the paper and types two fields, which is
   faster and cheaper than any model and works with the internet down.
   ========================================================================= */
app.get("/admin/receipt-inbox", requireAdmin, (req, res) => {
  res.render("admin/receipt-inbox", {
    activePage: "admin-receipt-inbox",
    unfiled: db.getScannedReceipts("unfiled"),
    recent: db.getScannedReceipts("filed").slice(0, 25),
    today: localDate(0),
    saved: req.query.saved === "1",
  });
});

// File one scan: create the expense, attach the file, mark it done.
app.post("/admin/receipt-inbox/:id/file", requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const receipt = db.getScannedReceiptById(id);
  if (!receipt || receipt.status !== "unfiled") return res.redirect("/admin/receipt-inbox");

  const amount = parseFloat(req.body.amount);
  const description = String(req.body.description || "").trim();
  if (!description || isNaN(amount)) {
    return res.redirect("/admin/receipt-inbox?error=1");
  }

  const info = db.addExpense({
    description,
    amount,
    category: req.body.category || "General",
    date: req.body.date || localDate(0),
    frequency: "one-time",
    is_startup: 0,
    vendor: req.body.vendor || "",
    notes: req.body.notes || "",
    payment_status: "paid",
    paid_by: req.body.paid_by || "",
    due_to: "",
    due_date: "",
    receipt_file: "",          // set by fileScannedReceipt below
    tax_deductible: req.body.tax_deductible ? 1 : 0,
    auto_pay: 0,
  });
  if (info && info.lastInsertRowid) db.fileScannedReceipt(id, info.lastInsertRowid);
  res.redirect("/admin/receipt-inbox?saved=1");
});

app.post("/admin/receipt-inbox/:id/ignore", requireAdmin, (req, res) => {
  db.ignoreScannedReceipt(parseInt(req.params.id, 10));
  res.redirect("/admin/receipt-inbox");
});

app.post("/admin/receipt-inbox/:id/unfile", requireAdmin, (req, res) => {
  db.unfileScannedReceipt(parseInt(req.params.id, 10));
  res.redirect("/admin/receipt-inbox");
});

// Serve expense receipts (financial documents) only to authenticated admins.
// Files live outside the public web root; basename-only lookup blocks traversal.
app.get("/admin/receipts/:file", requireAdmin, (req, res) => {
  const name = path.basename(req.params.file);
  const full = path.join(receiptDir, name);
  if (!full.startsWith(receiptDir + path.sep) || !fs.existsSync(full)) {
    return res.status(404).send("Not found");
  }
  res.sendFile(full);
});

/* =========================================================================
   DOCUMENTS (COI, welcome packet, licenses — admin only)
   ========================================================================= */

/* =========================================================================
   Therapist payouts
   -------------------------------------------------------------------------
   Therapists are 1099 contractors. They keep 100% of tips and split service
   revenue with the house (default 50/50 — the house half covers the room and
   supplies, in the manner of a booth rental).

   The distinction that decides what is actually handed over: a CASH tip is
   already in the therapist's pocket and is shown for the record only. A CARD
   tip was collected by the business and is genuinely owed.
   ========================================================================= */
app.get("/admin/payouts", requireAdmin, (req, res) => {
  const therapists = db.getActiveTherapists();
  const therapistId = req.query.therapist_id ? parseInt(req.query.therapist_id, 10) : null;

  // Default to the week just gone: Monday through Sunday.
  const now = new Date();
  const dow = (now.getDay() + 6) % 7;               // 0 = Monday
  const lastMon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow - 7);
  const lastSun = new Date(lastMon.getFullYear(), lastMon.getMonth(), lastMon.getDate() + 6);
  const ymd = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
    "-" + String(d.getDate()).padStart(2, "0");

  const startDate = req.query.start || ymd(lastMon);
  const endDate = req.query.end || ymd(lastSun);
  const summary = therapistId ? db.getPayoutSummary(therapistId, startDate, endDate) : null;

  res.render("admin/payouts", {
    activePage: "admin-payouts",
    therapists, therapistId, startDate, endDate, summary,
    history: db.getPayoutHistory(therapistId),
    saved: req.query.saved === "1",
  });
});

app.post("/admin/payouts", requireAdmin, (req, res) => {
  const therapistId = parseInt(req.body.therapist_id, 10);
  const { start, end } = req.body;
  const summary = therapistId ? db.getPayoutSummary(therapistId, start, end) : null;
  if (!summary) return res.redirect("/admin/payouts");
  db.recordPayout({
    therapistId, startDate: start, endDate: end,
    sessions: summary.sessions, serviceTotal: summary.serviceTotal,
    serviceShare: summary.serviceShare, cardTips: summary.cardTips,
    cashTips: summary.cashTips, rentDeduction: summary.rentDeduction, totalOwed: summary.totalOwed,
    notes: req.body.notes || "", paidBy: "admin",
  });
  res.redirect("/admin/payouts?saved=1&therapist_id=" + therapistId +
    "&start=" + encodeURIComponent(start) + "&end=" + encodeURIComponent(end));
});

app.get("/admin/documents", requireAdmin, (req, res) => {
  res.render("admin/documents", { activePage: "admin-documents", documents: db.getDocuments() });
});

app.post("/admin/documents", requireAdmin, documentUpload.single("document"), (req, res) => {
  if (req.file) {
    db.addDocument({
      title: (req.body.title && req.body.title.trim()) || req.file.originalname,
      category: req.body.category || "General",
      filename: req.file.filename,
      original_name: req.file.originalname,
      mime: req.file.mimetype,
      size: req.file.size,
      notes: req.body.notes || "",
    });
  }
  res.redirect("/admin/documents");
});

// Download a document — forces attachment (never renders inline) behind admin auth.
app.get("/admin/documents/:id/download", requireAdmin, (req, res) => {
  const doc = db.getDocumentById(parseInt(req.params.id, 10));
  if (!doc) return res.status(404).send("Not found");
  const full = path.join(documentsDir, path.basename(doc.filename));
  if (!full.startsWith(documentsDir + path.sep) || !fs.existsSync(full)) return res.status(404).send("Not found");
  res.download(full, doc.original_name || doc.filename);
});

app.post("/admin/documents/:id/delete", requireAdmin, (req, res) => {
  const doc = db.getDocumentById(parseInt(req.params.id, 10));
  if (doc) {
    const full = path.join(documentsDir, path.basename(doc.filename));
    if (full.startsWith(documentsDir + path.sep) && fs.existsSync(full)) {
      try { fs.unlinkSync(full); } catch (e) { /* file already gone */ }
    }
    db.deleteDocument(doc.id);
  }
  res.redirect("/admin/documents");
});

/* =========================================================================
   VENDORS & ACCOUNTS (utility accounts, suppliers, portals — admin only)

   requireAdmin on every route on purpose, never requireStaff: this page lists
   account numbers and portal logins, which the front desk has no reason to see.
   Nothing here stores a password — password_location is only a note about which
   password manager holds it. See lib/db.js before adding fields.
   ========================================================================= */

// Pull the vendor fields out of a submitted form. Shared by add and update so
// the two stay in step when a field is added.
function vendorFromBody(b) {
  return {
    name: (b.name || "").trim(),
    category: b.category || "Other",
    what_for: b.what_for || "",
    account_number: b.account_number || "",
    website: b.website || "",
    login_username: b.login_username || "",
    password_location: b.password_location || "", // pointer only, never a password
    support_phone: b.support_phone || "",
    support_email: b.support_email || "",
    cost: b.cost || "",
    billing_cycle: b.billing_cycle || "",
    renewal_date: b.renewal_date || "",
    notes: b.notes || "",
  };
}

app.get("/admin/vendors", requireAdmin, (req, res) => {
  res.render("admin/vendors", { activePage: "admin-vendors", vendors: db.getVendors() });
});

app.post("/admin/vendors", requireAdmin, (req, res) => {
  const vendor = vendorFromBody(req.body);
  if (vendor.name) db.addVendor(vendor);
  res.redirect("/admin/vendors");
});

app.post("/admin/vendors/:id/update", requireAdmin, (req, res) => {
  const vendor = vendorFromBody(req.body);
  if (vendor.name) db.updateVendor(parseInt(req.params.id, 10), vendor);
  res.redirect("/admin/vendors");
});

app.post("/admin/vendors/:id/toggle", requireAdmin, (req, res) => {
  db.toggleVendor(parseInt(req.params.id, 10));
  res.redirect("/admin/vendors");
});

app.post("/admin/vendors/:id/delete", requireAdmin, (req, res) => {
  db.deleteVendor(parseInt(req.params.id, 10));
  res.redirect("/admin/vendors");
});

app.get("/admin/expenses", requireAdmin, (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const filter = req.query.filter || "";
  const expenses = db.getExpenses(month, filter);
  const totals = db.getExpenseTotals(month);
  const summary = db.getRecurringExpenseSummary();
  const taxSummary = db.getTaxDeductibleSummary(month);
  const outstanding = db.getOutstandingExpenses();
  res.render("admin/expenses", {
    activePage: "admin-expenses",
    expenses, totals, summary, filter,
    grandTotal: totals.reduce((sum, t) => sum + t.total, 0),
    taxSummary,
    outstanding,
    today: localDate(0),
    recorded: req.query.recorded || null,
    month,
  });
});

app.post("/admin/expenses", requireAdmin, receiptUpload.single("receipt"), (req, res) => {
  const b = req.body;
  // Merge due_to from either the reimbursement or due-bill field
  const dueTo = b.due_to || b.due_to_bill || "";
  const receiptFile = req.file ? "/admin/receipts/" + req.file.filename : "";

  db.addExpense({
    description: b.description,
    amount: parseFloat(b.amount),
    category: b.category,
    date: b.date,
    frequency: b.frequency,
    is_startup: b.is_startup === "1",
    vendor: b.vendor,
    notes: b.notes,
    payment_status: b.payment_status,
    paid_by: b.paid_by || "",
    due_to: dueTo,
    due_date: b.due_date || "",
    receipt_file: receiptFile,
    tax_deductible: b.tax_deductible === "1" ? 1 : 0,
    auto_pay: b.auto_pay === "1",
  });
  res.redirect("/admin/expenses?month=" + (b.date ? b.date.slice(0, 7) : new Date().toISOString().slice(0, 7)));
});

app.post("/admin/expenses/:id/edit", requireAdmin, receiptUpload.single("receipt"), (req, res) => {
  const b = req.body;
  const id = parseInt(req.params.id, 10);
  const expense = db.getExpenseById(id);
  const dueTo = b.due_to || b.due_to_bill || "";
  
  // Keep existing receipt unless a new one is uploaded
  const receiptFile = req.file ? "/admin/receipts/" + req.file.filename : (expense ? expense.receipt_file : "");
  
  db.updateExpense(id, {
    description: b.description,
    amount: parseFloat(b.amount),
    category: b.category,
    date: b.date,
    frequency: b.frequency,
    is_startup: b.is_startup === "1",
    vendor: b.vendor,
    notes: b.notes,
    payment_status: b.payment_status,
    paid_by: b.paid_by || "",
    due_to: dueTo,
    due_date: b.due_date || "",
    receipt_file: receiptFile,
    tax_deductible: b.tax_deductible === "1" ? 1 : 0,
    auto_pay: b.auto_pay === "1",
  });
  res.redirect("/admin/expenses?month=" + (b.date ? b.date.slice(0, 7) : new Date().toISOString().slice(0, 7)));
});

app.post("/admin/expenses/:id/mark-paid", requireAdmin, (req, res) => {
  db.markExpensePaid(parseInt(req.params.id, 10));
  res.redirect(safeBack(req, "/admin/expenses"));
});

// Record a partial payment (installment) toward an expense
app.post("/admin/expenses/:id/payment", requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b = req.body;
  const amt = parseFloat(b.amount) || 0;
  db.addExpensePayment(id, {
    amount: amt,
    date: b.date || localDate(0),
    method: b.method || "",
    paid_by: b.paid_by || "",
    note: b.note || "",
  });
  const back = safeBack(req, "/admin/expenses");
  const sep = back.includes("?") ? "&" : "?";
  res.redirect(back + sep + "recorded=" + amt.toFixed(2));
});

app.post("/admin/expenses/:id/delete", requireAdmin, (req, res) => {
  db.deleteExpense(parseInt(req.params.id, 10));
  res.redirect("/admin/expenses");
});

// Email signups list
app.get("/admin/signups", requireAdmin, (req, res) => {
  const signups = db.getEmailSignups();
  res.render("admin/signups", { activePage: "admin-settings", signups });
});

// AI: draft an update email from a short topic (OpenRouter)
app.post("/admin/ai-draft", requireAdmin, async (req, res) => {
  const topic = (req.body.topic || "").trim();
  if (!topic) return res.json({ ok: false, error: "Add a topic or a few details first." });
  try {
    const ai = require("./lib/ai");
    const { subject, body } = await ai.draftUpdateEmail(topic);
    res.json({ ok: true, subject, body });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

function sendUpdateViewData(req) {
  const settings = db.getAllSettings();
  const subscribers = db.getSubscribedSignups();
  const ai = require("./lib/ai");
  return {
    activePage: "admin-settings",
    signupCount: subscribers.length,
    emails: subscribers.map(s => s.email),
    smtpConfigured: !!(settings.smtp_host && settings.smtp_user && settings.smtp_pass),
    aiConfigured: ai.isConfigured(),
    pastUpdates: db.getSentUpdates(),
  };
}

// Send update to subscribers
app.get("/admin/send-update", requireAdmin, (req, res) => {
  res.render("admin/send-update", sendUpdateViewData(req));
});

app.post("/admin/send-update", requireAdmin, updateImageUpload.single("image"), async (req, res) => {
  const { subject, message, action, existing_image } = req.body;
  const base = sendUpdateViewData(req);
  // Image URL (newly uploaded, or one carried through from a preview)
  const imageUrl = req.file
    ? publicBaseUrl(req) + "/images/updates/" + req.file.filename
    : (existing_image || null);

  // Preview mode
  if (action === "preview") {
    const messageHtml = escapeHtml(message || "").replace(/\n/g, "<br />");
    return res.render("admin/send-update", Object.assign({}, base, {
      preview: { subject, messageHtml, imageUrl },
      lastSubject: subject,
      lastMessage: message,
      existingImage: imageUrl,
    }));
  }

  // Send mode
  if (action === "send" && base.smtpConfigured) {
    try {
      const emailLib = require("./lib/email");
      const subscribers = db.getSubscribedSignups();
      const urlBase = publicBaseUrl(req);
      let sentCount = 0;
      for (const sub of subscribers) {
        try {
          await emailLib.sendEmail(sub.email, subject, message, {
            unsubscribeUrl: urlBase + "/unsubscribe/" + sub.unsubscribe_token,
            imageUrl,
          });
          sentCount++;
        } catch (e) {
          console.error("Failed to send to", sub.email, e.message);
        }
      }
      db.saveSentUpdate(subject, message, sentCount);
      return res.render("admin/send-update", Object.assign({}, sendUpdateViewData(req), { sent: sentCount }));
    } catch (e) {
      return res.render("admin/send-update", Object.assign({}, base, {
        error: "Failed to send: " + e.message,
        lastSubject: subject,
        lastMessage: message,
        existingImage: imageUrl,
      }));
    }
  }

  res.redirect("/admin/send-update");
});

// Settings
app.get("/admin/settings", requireAdmin, (req, res) => {
  res.render("admin/settings", { activePage: "admin-settings", saved: req.query.saved === "1" });
});

app.post("/admin/settings", requireAdmin, (req, res) => {
  const fields = ["spa_name","phone","email","address","site_url","open_time","close_time","open_days","slot_interval","full_body_rooms","chair_stations","foot_chairs","couples_rooms","water_head_tables","smtp_host","smtp_port","smtp_user","smtp_pass","smtp_from","google_maps_embed","openphone_api_key","openphone_phone_id","sms_reminder_hours","sms_reminders_enabled","square_access_token","square_location_id","square_device_id","square_environment","desk_password","coming_soon","openrouter_api_key","openrouter_model","label_printer_ip","label_printer_port",
    // Receipt mailbox (scan-to-email)
    "scan_email_enabled","scan_email_host","scan_email_port","scan_email_user",
    "scan_email_pass","scan_email_folder","scan_email_allowed"];
  // Credentials are never echoed back to the browser, so the form posts them
  // blank unless the admin is actually setting a new one. Blank = keep the
  // stored value; the matching "clear_<field>" checkbox is how you erase one.
  const secretFields = new Set([
    "smtp_pass", "openphone_api_key", "square_access_token", "openrouter_api_key",
    "scan_email_pass",
  ]);
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      // Checkboxes with hidden fallback can send arrays — take the last value
      const val = Array.isArray(req.body[f]) ? req.body[f][req.body[f].length - 1] : req.body[f];
      if (secretFields.has(f)) {
        if (req.body["clear_" + f]) db.setSetting(f, "");
        else if (String(val).trim() !== "") db.setSetting(f, String(val).trim());
        // blank with no clear request — leave the stored credential untouched
      } else {
        db.setSetting(f, val);
      }
    }
  }
  if (req.body.new_password && req.body.new_password.trim()) {
    db.setSetting("admin_password", req.body.new_password.trim());
  }
  res.redirect("/admin/settings?saved=1");
});

// Database Reset (clear test data)
app.get("/admin/reset", requireAdmin, (req, res) => {
  res.render("admin/reset", { activePage: "admin-settings" });
});

app.post("/admin/reset", requireAdmin, (req, res) => {
  if (req.body.confirm && req.body.confirm.trim().toUpperCase() === "RESET") {
    db.resetTestData();
    res.render("admin/reset", { activePage: "admin-settings", success: true });
  } else {
    res.redirect("/admin/reset");
  }
});

/* =========================================================================
   FRONT DESK (separate login, limited access)
   ========================================================================= */

app.get("/desk/login", (req, res) => {
  res.render("admin/fd-login", { error: null });
});

app.post("/desk/login", authRateLimit, (req, res) => {
  const password = db.getSetting("desk_password") || "1234";
  if (req.body.password === password) {
    return req.session.regenerate((err) => {
      if (err) return res.render("admin/fd-login", { error: "Login error, please try again." });
      req.session.desk = true;
      authLimitMap.delete("/desk/login|" + (req.ip || ""));  // success clears the streak
      res.redirect("/desk");
    });
  }
  res.render("admin/fd-login", { error: "Wrong PIN. Try again." });
});

app.get("/desk/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/desk/login"));
});

// Verify PIN for lock screen unlock (accepts desk password OR employee PIN)
app.post("/desk/verify-pin", requireDesk, authRateLimit, (req, res) => {
  const pin = (req.body.pin || "").trim();
  const deskPw = db.getSetting("desk_password") || "1234";
  if (pin === deskPw) return res.json({ ok: true });
  const emp = db.getTherapistByPin(pin);
  if (emp) return res.json({ ok: true });
  res.json({ ok: false });
});

// Front desk main view (reuses front-desk.ejs with deskMode flag)
app.get("/desk", requireDesk, (req, res) => {
  const today = localDate(0);
  const todayBookings = db.getBookingsForDate(today).map((b) => {
    b.is_member = b.client_phone ? !!db.getMemberByPhone(b.client_phone) : false;
    return b;
  });
  res.render("admin/front-desk", {
    query: req.query,
    activePage: "admin-dashboard",
    deskMode: true,
    todayBookings,
    upcoming: db.getUpcomingBookings(10),
    therapists: db.getActiveTherapists(),
    services: db.getActiveServices(),
    allAddons: db.getAllAddons(),
    waiting: db.getWaitlist().filter((w) => w.preferred_date === today),
    booked: req.query.booked === "1",
    seated: req.query.seated || false,
  });
});

// Remove a walk-in / waiting entry (they left or were a no-show)
app.post("/desk/waitlist/:id/done", requireStaff, (req, res) => {
  db.deleteWaitlistEntry(parseInt(req.params.id, 10));
  res.redirect(safeBack(req, "/desk"));
});

// Accept a walk-in / waiting person: assign a therapist + service and seat them
// as a real appointment for NOW, then remove them from the waiting list.
app.post("/desk/waitlist/:id/accept", requireStaff, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const entry = db.getWaitlist().find((w) => w.id === id);
  const service = db.getServiceById(parseInt(req.body.service_id, 10));
  const home = req.session.admin ? "/admin/front-desk" : "/desk";
  if (!entry || !service) return res.redirect(home + "?error=1");

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const cancelToken = crypto.randomBytes(16).toString("hex");
  db.createBooking({
    clientName: entry.client_name || entry.client_phone,
    clientPhone: entry.client_phone || "",
    clientEmail: entry.client_email || "",
    serviceId: service.id,
    therapistId: req.body.therapist_id ? parseInt(req.body.therapist_id, 10) : null,
    therapist2Id: null,
    genderPref: "",
    notes: entry.notes || "",
    areas: "",
    date: localDate(0),
    time: hh + ":" + mm,
    duration: service.duration,
    source: "walk-in",
    addonIds: "",
    cancelToken,
    recurringId: "",
  });
  // Mark them present (they're standing right here) so it shows checked-in
  const seated = db.getBookingByToken(cancelToken);
  if (seated) db.markBookingArrived(seated.id);

  db.deleteWaitlistEntry(id);
  const who = encodeURIComponent(entry.client_name || "Walk-in");
  res.redirect(home + "?seated=" + who);
});

// Employee-room prep board — today's appointments with what each customer wants,
// bilingual (Mandarin-forward). For an always-on monitor in the back room.
app.get("/desk/prep", requireDesk, (req, res) => {
  const today = localDate(0);
  const bookings = db.getBookingsForDate(today).map((b) => {
    b.is_member = b.client_phone ? !!db.getMemberByPhone(b.client_phone) : false;
    b.addonNames = b.addon_ids ? db.getAddonsByIds(b.addon_ids.split(",").map(Number)).map((a) => a.name) : [];
    // What the therapist must know before they start. The intake was being
    // collected at the kiosk and never shown to the person doing the massage —
    // and the usual backstop, the therapist asking at the table, is not
    // available when they do not share a language with the client.
    b.health = db.getClientHealthFlags(b.client_phone);
    return b;
  });
  res.render("prep-board", { bookings, today });
});

// Front desk phone booking (reuses existing phone-booking view)
app.get("/desk/booking", requireDesk, (req, res) => {
  res.render("admin/phone-booking", {
    activePage: "admin-phone",
    services: db.getActiveServices(),
    addons: db.getActiveAddons(),
    therapists: db.getActiveTherapists(),
    deskMode: true,
  });
});

// Front desk WALK-IN — quick add to today's waiting list (NOT a scheduled booking).
// They appear in the "Waiting / Walk-Ins" panel on the Today page.
app.get("/desk/walkin", requireDesk, (req, res) => {
  res.render("admin/desk-walkin", {
    activePage: "admin-dashboard",
    services: db.getActiveServices(),
    therapists: db.getActiveTherapists(),
    deskMode: !req.session.admin,
    error: req.query.error === "1",
  });
});

app.post("/desk/walkin", requireDesk, (req, res) => {
  const name = (req.body.client_name || "").trim();
  const phone = (req.body.client_phone || "").trim();
  if (!name || !phone) return res.redirect("/desk/walkin?error=1");
  const serviceId = req.body.service_id ? parseInt(req.body.service_id, 10) : null;
  const therapistId = req.body.therapist_id ? parseInt(req.body.therapist_id, 10) : null;
  const now = new Date();
  const hh = now.getHours(), mm = String(now.getMinutes()).padStart(2, "0");
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  let notes = "Walk-in — added at " + h12 + ":" + mm + " " + ampm;
  const extra = (req.body.notes || "").trim();
  if (extra) notes += " · " + extra;
  db.addToWaitlist({
    clientName: name,
    clientPhone: phone,
    clientEmail: "",
    serviceId: serviceId,
    therapistId: therapistId,
    preferredDate: localDate(0),
    preferredTime: "Walk-in",
    notes: notes,
  });
  res.redirect(req.session.admin ? "/admin/front-desk" : "/desk");
});

// Front desk gift certificates (read-only view with create + charge)
app.get("/desk/gift-certificates", requireDesk, (req, res) => {
  res.render("admin/gift-certificates", {
    activePage: "admin-gifts",
    certificates: db.getAllGiftCertificates(),
    redemptions: db.getAllRedemptions(),
    deskMode: true,
    not_paid: req.query.not_paid || false,
    pin_error: req.query.pin_error || false,
  });
});

// Front desk member lookup + sign up new members
app.get("/desk/members", requireDesk, (req, res) => {
  res.render("admin/desk-members", {
    activePage: "admin-memberships",
    members: db.getActiveMembers(),
    plans: db.getActiveMembershipPlans(),
    deskMode: true,
    saved: req.query.saved === "1",
  });
});

// Front desk: sign up a new member (limited — plan management stays in admin)
app.post("/desk/members", requireDesk, (req, res) => {
  const { client_name, client_phone, client_email, plan_id, start_date } = req.body;
  if (client_name && client_phone && plan_id) {
    db.addMember(client_name, client_phone, client_email || "", parseInt(plan_id, 10),
      start_date || localDate(0), "", "Signed up at front desk");
  }
  res.redirect("/desk/members?saved=1");
});

// Member card print (accessible to both admin and desk)
app.get("/admin/memberships/members/:id/card", requireStaff, (req, res) => {
  const member = db.getMemberById(parseInt(req.params.id, 10));
  if (!member) return res.redirect("/admin/memberships");
  res.render("admin/member-card-print", { member, settings: db.getAllSettings() });
});

/* =========================================================================
   TV MENU DISPLAY (public, no auth)
   ========================================================================= */

app.get("/menu", (req, res) => {
  const services = db.getActiveServices();
  const settings = db.getAllSettings();
  const addons = db.getActiveAddons();
  res.render("menu", { services, settings, addons });
});

app.get("/tv/therapists", (req, res) => {
  const statuses = db.getTherapistStatuses();
  const settings = db.getAllSettings();
  res.render("tv-therapists", { statuses, settings });
});

/* =========================================================================
   NOT FOUND + ERRORS  (must stay below every route)
   -------------------------------------------------------------------------
   With nothing here, Express falls back to its built-in handler: a mistyped URL
   returned a bare "Cannot GET /x", and any thrown error returned a full stack
   trace — server file paths, module versions and internals — to whoever sent the
   malformed request. Both are replaced with a plain page that says one useful
   thing: call the spa.

   These pages are built as strings rather than rendered as views on purpose. If
   the view layer is what failed, res.render() here would fail too and Express
   would hand the visitor its stack-trace page anyway.
   ========================================================================= */

function plainPage(heading, message) {
  let spaName = "J&M Serenity Spa";
  let phone = "";
  try {
    spaName = db.getSetting("spa_name") || spaName;
    phone = db.getSetting("phone") || "";
  } catch (e) { /* database unavailable — the page still works without it */ }

  const tel = fmt.telHref(phone);
  const callLine = phone
    ? "<p>Call us at " + (tel
      ? "<a href=\"tel:" + escapeHtml(tel) + "\">" + escapeHtml(phone) + "</a>"
      : escapeHtml(phone)) + " and we'll take care of it.</p>"
    : "";

  return "<!doctype html>\n" +
    "<html lang=\"en\"><head><meta charset=\"utf-8\" />" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />" +
    "<title>" + escapeHtml(heading) + " · " + escapeHtml(spaName) + "</title>" +
    "<style>" +
    "body{margin:0;padding:3rem 1.25rem;font-family:Georgia,'Times New Roman',serif;" +
    "background:#f7f4ef;color:#33322e;line-height:1.6;}" +
    "main{max-width:32rem;margin:0 auto;text-align:center;}" +
    "h1{font-size:1.6rem;margin:0 0 .75rem;color:#1f6f78;}" +
    "a{color:#1f6f78;}" +
    ".links{margin-top:2rem;}" +
    ".links a{display:inline-block;margin:.35rem .5rem;padding:.7rem 1.2rem;" +
    "border:1px solid #1f6f78;border-radius:999px;text-decoration:none;}" +
    "</style></head><body><main>" +
    "<h1>" + escapeHtml(heading) + "</h1>" +
    "<p>" + escapeHtml(message) + "</p>" +
    callLine +
    "<div class=\"links\"><a href=\"/\">Home</a><a href=\"/book\">Book an appointment</a></div>" +
    "</main></body></html>";
}

app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
  res.status(404).type("html").send(
    plainPage("Page not found", "That page isn't here. It may have moved, or the link may be out of date.")
  );
});

// Four arguments — this is Express's error handler signature, and `next` has to
// stay in it even though it is only used for the headers-already-sent case.
app.use((err, req, res, next) => {
  console.error("Unhandled error on " + req.method + " " + req.originalUrl + ":", err);
  if (res.headersSent) return next(err);
  // Never echo err.message to the browser: it routinely carries file paths,
  // SQL and other internals.
  if (req.path.startsWith("/api/")) return res.status(500).json({ error: "Something went wrong." });
  res.status(500).type("html").send(
    plainPage("Something went wrong", "Sorry — this page didn't load. Please try again in a moment.")
  );
});

/* =========================================================================
   Start server
   ========================================================================= */

// Watch the scan folder for receipts the printer drops in.
scanWatch.start(__dirname);
// Pull scans emailed in from the printer or a staff phone.
scanMail.start(__dirname);

app.listen(PORT, () => {
  console.log("J&M Serenity Spa running on http://localhost:" + PORT);
  console.log("Admin panel: http://localhost:" + PORT + "/admin");
});

/* =========================================================================
   SMS Appointment Reminder Scheduler
   Checks every 30 minutes for tomorrow's appointments and sends reminders.
   ========================================================================= */

setInterval(() => {
  const settings = db.getAllSettings();
  if (settings.sms_reminders_enabled === "1" && settings.openphone_api_key) {
    sms.sendDailyReminders().catch((err) => {
      console.error("Reminder scheduler error:", err.message);
    });
  }
}, 30 * 60 * 1000); // every 30 minutes

// Also run once on startup after a short delay
setTimeout(() => {
  const settings = db.getAllSettings();
  if (settings.sms_reminders_enabled === "1" && settings.openphone_api_key) {
    sms.sendDailyReminders().catch((err) => {
      console.error("Reminder scheduler error:", err.message);
    });
  }
}, 10 * 1000); // 10 seconds after startup

/* =========================================================================
   Membership Renewal Scheduler
   Nobody bills memberships automatically — it happens at the front desk. So
   without this, visits_remaining only ever counts down and a member who joined
   in March still shows March's leftover visits in August. Once a day, every
   member whose billing date has passed gets their monthly visits back and their
   billing date moved forward.
   ========================================================================= */

function runMembershipRenewals() {
  try {
    const renewed = db.renewDueMemberships();
    console.log("Membership renewal: " + renewed + " renewed");
  } catch (err) {
    console.error("Membership renewal error:", err.message);
  }
}

setInterval(runMembershipRenewals, 24 * 60 * 60 * 1000); // once a day
setTimeout(runMembershipRenewals, 20 * 1000); // and shortly after startup
