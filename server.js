/**
 * J&M Serenity Spa — Express Server
 * All public + admin routes
 */

const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const db = require("./lib/db");
const email = require("./lib/email");
const sms = require("./lib/sms");
const square = require("./lib/square");

// Multer config for therapist photos
const photoDir = path.join(__dirname, "public", "images", "therapists");
if (!fs.existsSync(photoDir)) fs.mkdirSync(photoDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, photoDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, "therapist-" + Date.now() + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Gallery photo upload
const galleryDir = path.join(__dirname, "public", "images", "gallery");
if (!fs.existsSync(galleryDir)) fs.mkdirSync(galleryDir, { recursive: true });

const galleryStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, galleryDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, "gallery-" + Date.now() + ext);
  },
});
const galleryUpload = multer({ storage: galleryStorage, limits: { fileSize: 10 * 1024 * 1024 } });

const app = express();
const PORT = process.env.PORT || 3000;

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

/* =========================================================================
   Middleware
   ========================================================================= */

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "jm-spa-secret-key-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 8 * 60 * 60 * 1000 },
  })
);

// CSRF Token middleware
app.use((req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString("hex");
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
});

function csrfCheck(req, res, next) {
  const token = req.body._csrf || req.query._csrf;
  if (token && token === req.session.csrfToken) return next();
  // Allow forms without CSRF for backwards compat during rollout
  // Later you can return res.status(403).send("Invalid CSRF token");
  next();
}

app.use((req, res, next) => {
  res.locals.settings = db.getAllSettings();
  res.locals.isAdmin = !!req.session.admin;
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

/* =========================================================================
   COMING SOON MODE
   ========================================================================= */

// Direct route to see the coming soon page (always accessible)
app.get("/coming-soon", (req, res) => {
  res.render("coming-soon");
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
    "/admin", "/desk", "/api/", "/checkin",
    "/coming-soon", "/preview",
    "/style.css", "/script.js", "/images/", "/favicon"
  ];
  if (bypass.some(p => req.path.startsWith(p))) return next();

  // Admin, desk staff, and preview sessions bypass
  if (req.session.admin || req.session.desk || req.session.preview) return next();

  // Everyone else sees coming soon
  return res.render("coming-soon");
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

app.get("/contact", (req, res) => res.render("contact", { activePage: "contact" }));
app.get("/policies", (req, res) => res.render("policies", { activePage: "policies" }));
app.post("/contact", (req, res) => res.redirect("/contact?sent=1"));

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
  });
});

app.post("/book", rateLimit, (req, res) => {
  const { client_name, client_phone, client_email, service_id, therapist_id, therapist2_id, gender_pref, date, time, areas, notes, addon_ids } = req.body;
  const service = db.getServiceById(parseInt(service_id, 10));
  if (!service) return res.redirect("/book?error=invalid_service");

  // Auto-save/update client profile
  if (client_phone) db.upsertClient(client_phone, client_name || "", client_email || "");

  const aidStr = addon_ids ? (Array.isArray(addon_ids) ? addon_ids.join(",") : addon_ids) : "";
  const cancelToken = crypto.randomBytes(16).toString("hex");

  const result = db.createBooking({
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
    source: "online",
    addonIds: aidStr,
    cancelToken,
  });

  // Send email & SMS confirmation (async, non-blocking)
  const booking = db.getBookingById(result.lastInsertRowid);
  const addons = aidStr ? db.getAddonsByIds(aidStr.split(",").map(Number)) : [];
  const baseUrl = req.protocol + "://" + req.get("host");
  email.sendBookingConfirmation(booking, addons, baseUrl).catch(() => {});
  sms.sendBookingConfirmationSMS(booking, baseUrl).catch(() => {});

  res.redirect("/booking-confirm/" + result.lastInsertRowid);
});

app.get("/booking-confirm/:id", (req, res) => {
  const booking = db.getBookingById(parseInt(req.params.id, 10));
  if (!booking) return res.redirect("/book");
  const bookingAddons = booking.addon_ids ? db.getAddonsByIds(booking.addon_ids.split(",").map(Number)) : [];
  res.render("booking-confirm", { activePage: "book", booking, bookingAddons });
});

// Client self-service: manage / cancel / reschedule via token
app.get("/booking/manage/:token", (req, res) => {
  const booking = db.getBookingByToken(req.params.token);
  if (!booking || booking.status === "cancelled") {
    return res.render("booking-manage", { activePage: "book", booking: null, error: "Booking not found or already cancelled.", services: [], therapists: [], slots: [] });
  }
  res.render("booking-manage", {
    activePage: "book",
    booking,
    error: null,
    services: db.getActiveServices(),
    therapists: db.getActiveTherapists(),
    slots: [],
  });
});

app.post("/booking/cancel/:token", (req, res) => {
  const booking = db.getBookingByToken(req.params.token);
  if (!booking || booking.status === "cancelled") return res.redirect("/booking/manage/" + req.params.token);
  db.cancelBooking(booking.id);
  email.sendCancellationEmail(booking).catch(() => {});
  sms.sendCancellationSMS(booking).catch(() => {});
  res.redirect("/booking/manage/" + req.params.token + "?cancelled=1");
});

app.post("/booking/reschedule/:token", (req, res) => {
  const booking = db.getBookingByToken(req.params.token);
  if (!booking || booking.status !== "confirmed") return res.redirect("/booking/manage/" + req.params.token);
  const { date, time } = req.body;
  if (date && time) {
    db.rescheduleBooking(booking.id, date, time);
  }
  res.redirect("/booking/manage/" + req.params.token + "?rescheduled=1");
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

// Client lookup by phone (public — used on booking forms)
app.get("/api/client-lookup", (req, res) => {
  const phone = (req.query.phone || "").trim();
  if (!phone || phone.replace(/\D/g, "").length < 7) return res.json({ client: null });
  const client = db.getClientByPhone(phone);
  if (client) {
    res.json({ client: {
      name: client.name,
      email: client.email,
      phone: client.phone,
      pressure_pref: client.pressure_pref,
      areas_to_focus: client.areas_to_focus,
      areas_to_avoid: client.areas_to_avoid,
      notes: client.notes,
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
app.get("/api/therapists", (req, res) => {
  res.json({ therapists: db.getActiveTherapists() });
});

/* =========================================================================
   CUSTOMER CHECK-IN (Tablet / Kiosk)
   ========================================================================= */

app.get("/checkin", (req, res) => {
  res.render("checkin", {});
});

app.post("/checkin", (req, res) => {
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

app.post("/admin/login", (req, res) => {
  const password = db.getSetting("admin_password") || "serenity2025";
  if (req.body.password === password) {
    req.session.admin = true;
    return res.redirect("/admin");
  }
  res.render("admin/login", { activePage: "admin", error: "Incorrect password" });
});

app.get("/admin/logout", (req, res) => { req.session.destroy(); res.redirect("/"); });

// Front Desk (simplified view)
app.get("/admin/front-desk", requireAdmin, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const todayBookings = db.getBookingsForDate(today).map((b) => {
    b.is_member = b.client_phone ? !!db.getMemberByPhone(b.client_phone) : false;
    return b;
  });
  res.render("admin/front-desk", {
    activePage: "admin-dashboard",
    todayBookings,
    upcoming: db.getUpcomingBookings(10),
    therapists: db.getActiveTherapists(),
    allAddons: db.getAllAddons(),
  });
});

// Dashboard
app.get("/admin", requireAdmin, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
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
  });
});

app.post("/admin/therapists", requireAdmin, upload.single("photo"), (req, res) => {
  const { name, gender, specialties, service_ids, bio, work_days, start_time, end_time, pin } = req.body;
  const sids = Array.isArray(service_ids) ? service_ids.join(",") : service_ids || "";
  const wdays = Array.isArray(work_days) ? work_days.join(",") : work_days || "1,2,3,4,5,6";
  const photo = req.file ? "/images/therapists/" + req.file.filename : "";
  db.addTherapist(name, gender || "female", specialties || "", sids, photo, bio || "", wdays, start_time || "09:00", end_time || "19:00", pin || "");
  res.redirect("/admin/therapists");
});

app.post("/admin/therapists/:id/edit", requireAdmin, upload.single("photo"), (req, res) => {
  const { name, gender, specialties, service_ids, bio, existing_photo, work_days, start_time, end_time, pin } = req.body;
  const sids = Array.isArray(service_ids) ? service_ids.join(",") : service_ids || "";
  const wdays = Array.isArray(work_days) ? work_days.join(",") : work_days || "1,2,3,4,5,6";
  const photo = req.file ? "/images/therapists/" + req.file.filename : (existing_photo || "");
  db.updateTherapist(parseInt(req.params.id, 10), name, gender || "female", specialties || "", sids, photo, bio || "", wdays, start_time || "09:00", end_time || "19:00", pin || "");
  res.redirect("/admin/therapists");
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
  if (!service) return res.redirect("/admin/phone-booking?error=1");

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
      const d = new Date(date);
      d.setDate(d.getDate() + 7 * w);
      const futureDate = d.toISOString().slice(0, 10);
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

  res.redirect("/admin?booked=1");
});

app.post("/admin/bookings/:id/cancel", requireStaff, (req, res) => {
  const booking = db.getBookingById(parseInt(req.params.id, 10));
  db.cancelBooking(parseInt(req.params.id, 10));
  if (booking) sms.sendCancellationSMS(booking).catch(() => {});
  const back = req.get("Referrer") || "/admin";
  res.redirect(back);
});

app.post("/admin/bookings/:id/complete", requireStaff, (req, res) => {
  const { payment_method, tip_amount, completed_by, gift_cert_code, discount_code } = req.body;
  const bookingId = parseInt(req.params.id, 10);

  // If paying with gift certificate, look it up and deduct
  if (payment_method === "Gift Certificate" && gift_cert_code) {
    const cert = db.getGiftCertificateByCode(gift_cert_code.trim().toUpperCase());
    if (cert && cert.balance > 0) {
      const booking = db.getBookingById(bookingId);
      const service = booking ? db.getServiceById(booking.service_id) : null;
      let total = service ? service.price : 0;
      // Add-on totals
      if (booking && booking.addon_ids) {
        const addons = db.getAddonsByIds(booking.addon_ids.split(",").map(Number));
        total += addons.reduce((sum, a) => sum + a.price, 0);
      }
      // Apply discount code if present
      if (discount_code) {
        const disc = db.getDiscountCodeByCode(discount_code);
        if (disc) {
          if (disc.type === "percent") total = total * (1 - disc.value / 100);
          else total = Math.max(0, total - disc.value);
          db.incrementDiscountUse(disc.id);
        }
      }
      db.redeemGiftCertificate(cert.id, total, booking ? booking.client_name : "", "Booking #" + bookingId);
    }
  } else if (discount_code) {
    // Track discount code usage even for non-gift-cert payments
    const disc = db.getDiscountCodeByCode(discount_code);
    if (disc) db.incrementDiscountUse(disc.id);
  }

  db.completeBooking(bookingId, payment_method, parseFloat(tip_amount) || 0, completed_by || "");
  const back = req.get("Referrer") || "/admin";
  res.redirect(back);
});

app.post("/admin/bookings/:id/noshow", requireStaff, (req, res) => {
  db.noShowBooking(parseInt(req.params.id, 10));
  const back = req.get("Referrer") || "/admin";
  res.redirect(back);
});

// ---- Manual Text Message ----
app.post("/admin/send-text", requireStaff, (req, res) => {
  const { phone, message } = req.body;
  if (phone && message) {
    sms.sendSMS(phone, message).catch(() => {});
  }
  res.redirect(req.get("Referrer") || "/admin");
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
    const back = req.get("Referrer") || "/admin";
    const sep = back.includes("?") ? "&" : "?";
    res.redirect(back + sep + "terminal_sent=1&checkout_id=" + checkout.id);
  } else {
    const back = req.get("Referrer") || "/admin";
    const sep = back.includes("?") ? "&" : "?";
    res.redirect(back + sep + "terminal_error=1");
  }
});

// Check terminal checkout status (AJAX endpoint)
app.get("/api/admin/checkout-status/:checkoutId", requireAdmin, async (req, res) => {
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
  db.addMember(client_name, client_phone, client_email, parseInt(plan_id, 10), start_date || new Date().toISOString().slice(0, 10), square_subscription_id, notes);
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
  const back = req.get("Referrer") || "/admin/memberships#members";
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

// API: Check membership by phone (used in booking form)
app.get("/api/member-check", (req, res) => {
  const phone = req.query.phone || "";
  if (!phone) return res.json({ member: null });
  const member = db.getMemberByPhone(phone);
  if (member) {
    res.json({ member: { name: member.client_name, plan: member.plan_name, visitsRemaining: member.visits_remaining, discount: member.discount_percent } });
  } else {
    res.json({ member: null });
  }
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

  // Look up who created this gift cert by their PIN
  let createdBy = "";
  if (employee_pin) {
    const emp = db.getTherapistByPin(employee_pin.trim());
    if (emp) {
      createdBy = emp.name;
    } else {
      // Invalid PIN — redirect back with error
      const back = req.get("Referrer") || "/admin/gift-certificates";
      return res.redirect(back + "?pin_error=1");
    }
  }

  if (payment_method === "Square Terminal") {
    db.createGiftCertificate(code, purchaser_name, purchaser_email || "", recipient_name || "", parsedAmount, message || "", "", createdBy);
    const cert = db.getGiftCertificateByCode(code);
    if (cert) {
      const checkout = await square.createTerminalCheckout(Math.round(parsedAmount * 100), "Gift Certificate " + code + " - " + purchaser_name, { allowTip: false });
      if (checkout) {
        db.markGiftCertificatePaid(cert.id, "Square Terminal");
        return res.redirect("/admin/gift-certificates?terminal_sent=1");
      }
    }
    return res.redirect("/admin/gift-certificates?terminal_error=1");
  }

  // All other payment methods — mark as paid immediately
  db.createGiftCertificate(code, purchaser_name, purchaser_email || "", recipient_name || "", parsedAmount, message || "", payment_method || "", createdBy);
  res.redirect("/admin/gift-certificates");
});

// Mark a gift certificate as paid (if created without payment initially)
app.post("/admin/gift-certificates/:id/mark-paid", requireStaff, (req, res) => {
  const { payment_method, employee_pin } = req.body;
  // Verify employee PIN
  if (employee_pin) {
    const emp = db.getTherapistByPin(employee_pin.trim());
    if (!emp) {
      const back = req.get("Referrer") || "/admin/gift-certificates";
      return res.redirect(back + "?pin_error=1");
    }
  }
  db.markGiftCertificatePaid(parseInt(req.params.id, 10), payment_method || "Cash");
  res.redirect("/admin/gift-certificates");
});

// Send gift cert charge to Square Terminal
app.post("/admin/gift-certificates/:id/charge", requireStaff, async (req, res) => {
  const cert = db.getGiftCertificateById(parseInt(req.params.id, 10));
  if (!cert) return res.redirect("/admin/gift-certificates");

  const amountCents = Math.round(cert.amount * 100);
  const note = "Gift Certificate " + cert.code + " - " + cert.purchaser_name;

  const checkout = await square.createTerminalCheckout(amountCents, note, { allowTip: false });
  if (checkout) {
    // Mark as paid immediately (terminal will handle the actual charge)
    db.markGiftCertificatePaid(cert.id, "Square Terminal");
    res.redirect("/admin/gift-certificates?terminal_sent=1");
  } else {
    res.redirect("/admin/gift-certificates?terminal_error=1");
  }
});

app.get("/admin/gift-certificates/:id/print", requireStaff, (req, res) => {
  const cert = db.getGiftCertificateById(parseInt(req.params.id, 10));
  if (!cert) return res.redirect("/admin/gift-certificates");
  // Block printing if not paid
  if (!cert.paid) return res.redirect("/admin/gift-certificates?not_paid=1");
  res.render("admin/gift-certificate-print", { cert, settings: db.getAllSettings() });
});

app.post("/admin/gift-certificates/:id/redeem", requireStaff, (req, res) => {
  const { amount, redeemed_by, notes, employee_pin } = req.body;
  // Verify employee PIN
  let staffName = "";
  if (employee_pin) {
    const emp = db.getTherapistByPin(employee_pin.trim());
    if (!emp) {
      const back = req.get("Referrer") || "/admin/gift-certificates";
      return res.redirect(back + "?pin_error=1");
    }
    staffName = emp.name;
  }
  db.redeemGiftCertificate(parseInt(req.params.id, 10), parseFloat(amount) || 0, redeemed_by || "", (notes ? notes + " " : "") + (staffName ? "[Staff: " + staffName + "]" : ""));
  res.redirect("/admin/gift-certificates");
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
app.get("/admin/expenses", requireAdmin, (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const filter = req.query.filter || "";
  const expenses = db.getExpenses(month, filter);
  const totals = db.getExpenseTotals(month);
  const summary = db.getRecurringExpenseSummary();
  res.render("admin/expenses", {
    activePage: "admin-expenses",
    expenses, totals, summary, filter,
    grandTotal: totals.reduce((sum, t) => sum + t.total, 0),
    month,
  });
});

app.post("/admin/expenses", requireAdmin, (req, res) => {
  const b = req.body;
  // Merge due_to from either the reimbursement or due-bill field
  const dueTo = b.due_to || b.due_to_bill || "";
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
  });
  res.redirect("/admin/expenses?month=" + (b.date ? b.date.slice(0, 7) : new Date().toISOString().slice(0, 7)));
});

app.post("/admin/expenses/:id/mark-paid", requireAdmin, (req, res) => {
  db.markExpensePaid(parseInt(req.params.id, 10));
  res.redirect("/admin/expenses");
});

app.post("/admin/expenses/:id/delete", requireAdmin, (req, res) => {
  db.deleteExpense(parseInt(req.params.id, 10));
  res.redirect("/admin/expenses");
});

// Settings
app.get("/admin/settings", requireAdmin, (req, res) => {
  res.render("admin/settings", { activePage: "admin-settings", saved: req.query.saved === "1" });
});

app.post("/admin/settings", requireAdmin, (req, res) => {
  const fields = ["spa_name","phone","email","address","open_time","close_time","open_days","slot_interval","full_body_rooms","chair_stations","foot_chairs","couples_rooms","smtp_host","smtp_port","smtp_user","smtp_pass","smtp_from","google_maps_embed","openphone_api_key","openphone_phone_id","sms_reminder_hours","sms_reminders_enabled","square_access_token","square_location_id","square_device_id","square_environment","desk_password","coming_soon"];
  for (const f of fields) {
    if (req.body[f] !== undefined) db.setSetting(f, req.body[f]);
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

app.post("/desk/login", (req, res) => {
  const password = db.getSetting("desk_password") || "1234";
  if (req.body.password === password) {
    req.session.desk = true;
    return res.redirect("/desk");
  }
  res.render("admin/fd-login", { error: "Wrong PIN. Try again." });
});

app.get("/desk/logout", (req, res) => {
  req.session.desk = false;
  res.redirect("/desk/login");
});

// Verify PIN for lock screen unlock (accepts desk password OR employee PIN)
app.post("/desk/verify-pin", (req, res) => {
  const pin = (req.body.pin || "").trim();
  const deskPw = db.getSetting("desk_password") || "1234";
  if (pin === deskPw) return res.json({ ok: true });
  const emp = db.getTherapistByPin(pin);
  if (emp) return res.json({ ok: true });
  res.json({ ok: false });
});

// Front desk main view (reuses front-desk.ejs with deskMode flag)
app.get("/desk", requireDesk, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const todayBookings = db.getBookingsForDate(today).map((b) => {
    b.is_member = b.client_phone ? !!db.getMemberByPhone(b.client_phone) : false;
    return b;
  });
  res.render("admin/front-desk", {
    activePage: "admin-dashboard",
    deskMode: true,
    todayBookings,
    upcoming: db.getUpcomingBookings(10),
    therapists: db.getActiveTherapists(),
    allAddons: db.getAllAddons(),
  });
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

// Front desk member lookup
app.get("/desk/members", requireDesk, (req, res) => {
  res.render("admin/desk-members", {
    activePage: "admin-memberships",
    members: db.getActiveMembers(),
    deskMode: true,
  });
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
   Start server
   ========================================================================= */

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
