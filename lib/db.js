/**
 * J&M Serenity Spa — Database Layer (SQLite via better-sqlite3)
 * All tables, seed data, and query helpers.
 */

const path = require("path");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "..", "db", "spa.db");
const db = new Database(dbPath);

// Enable WAL for better concurrent reads
db.pragma("journal_mode = WAL");

/* =========================================================================
   Schema
   ========================================================================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS therapists (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    gender      TEXT DEFAULT 'female',
    specialties TEXT DEFAULT '',
    service_ids TEXT DEFAULT '',
    active      INTEGER DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS services (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT DEFAULT '',
    duration    INTEGER NOT NULL,
    price       REAL NOT NULL,
    category    TEXT NOT NULL DEFAULT 'full_body',
    active      INTEGER DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name     TEXT NOT NULL,
    client_phone    TEXT NOT NULL,
    service_id      INTEGER,
    therapist_id    INTEGER,
    therapist2_id   INTEGER,
    gender_pref     TEXT DEFAULT '',
    notes           TEXT DEFAULT '',
    areas           TEXT DEFAULT '',
    date            TEXT NOT NULL,
    time            TEXT NOT NULL,
    duration        INTEGER NOT NULL,
    source          TEXT DEFAULT 'online',
    status          TEXT DEFAULT 'confirmed',
    gcal_event_id   TEXT DEFAULT '',
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (service_id)    REFERENCES services(id),
    FOREIGN KEY (therapist_id)  REFERENCES therapists(id),
    FOREIGN KEY (therapist2_id) REFERENCES therapists(id)
  );

  CREATE TABLE IF NOT EXISTS addons (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT DEFAULT '',
    price       REAL NOT NULL,
    active      INTEGER DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    amount      REAL NOT NULL,
    category    TEXT DEFAULT 'General',
    date        TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS waitlist (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name  TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    client_email TEXT DEFAULT '',
    service_id   INTEGER,
    therapist_id INTEGER,
    preferred_date TEXT NOT NULL,
    preferred_time TEXT DEFAULT '',
    notes        TEXT DEFAULT '',
    status       TEXT DEFAULT 'waiting',
    created_at   TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (service_id) REFERENCES services(id),
    FOREIGN KEY (therapist_id) REFERENCES therapists(id)
  );

  CREATE TABLE IF NOT EXISTS blocked_times (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    therapist_id  INTEGER NOT NULL,
    date          TEXT NOT NULL,
    start_time    TEXT DEFAULT '',
    end_time      TEXT DEFAULT '',
    all_day       INTEGER DEFAULT 0,
    reason        TEXT DEFAULT '',
    created_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (therapist_id) REFERENCES therapists(id)
  );

  CREATE TABLE IF NOT EXISTS gift_certificates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT UNIQUE NOT NULL,
    purchaser_name  TEXT NOT NULL,
    purchaser_email TEXT DEFAULT '',
    recipient_name  TEXT DEFAULT '',
    amount      REAL NOT NULL,
    balance     REAL NOT NULL,
    message     TEXT DEFAULT '',
    status      TEXT DEFAULT 'active',
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS gift_certificate_redemptions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    certificate_id  INTEGER NOT NULL,
    amount          REAL NOT NULL,
    redeemed_by     TEXT DEFAULT '',
    notes           TEXT DEFAULT '',
    redeemed_at     TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (certificate_id) REFERENCES gift_certificates(id)
  );

  CREATE TABLE IF NOT EXISTS membership_plans (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT DEFAULT '',
    monthly_price REAL NOT NULL,
    visits_per_month INTEGER DEFAULT 1,
    discount_percent INTEGER DEFAULT 0,
    included_service_ids TEXT DEFAULT '',
    addon_credits INTEGER DEFAULT 0,
    guest_passes INTEGER DEFAULT 0,
    active      INTEGER DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS members (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name     TEXT NOT NULL,
    client_phone    TEXT NOT NULL,
    client_email    TEXT DEFAULT '',
    plan_id         INTEGER NOT NULL,
    status          TEXT DEFAULT 'active',
    start_date      TEXT NOT NULL,
    next_billing    TEXT DEFAULT '',
    visits_remaining INTEGER DEFAULT 0,
    addon_credits_remaining INTEGER DEFAULT 0,
    guest_passes_remaining INTEGER DEFAULT 0,
    square_subscription_id TEXT DEFAULT '',
    notes           TEXT DEFAULT '',
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (plan_id) REFERENCES membership_plans(id)
  );

  CREATE TABLE IF NOT EXISTS member_visits (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id   INTEGER NOT NULL,
    booking_id  INTEGER,
    visit_date  TEXT DEFAULT (date('now')),
    notes       TEXT DEFAULT '',
    FOREIGN KEY (member_id) REFERENCES members(id)
  );

  CREATE TABLE IF NOT EXISTS discount_codes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    type        TEXT DEFAULT 'percent',
    value       REAL NOT NULL,
    description TEXT DEFAULT '',
    active      INTEGER DEFAULT 1,
    uses        INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT NOT NULL,
    rating      INTEGER DEFAULT 5,
    text        TEXT DEFAULT '',
    therapist_id INTEGER,
    approved    INTEGER DEFAULT 0,
    featured    INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (therapist_id) REFERENCES therapists(id)
  );

  CREATE TABLE IF NOT EXISTS gallery_images (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    filename    TEXT NOT NULL,
    caption     TEXT DEFAULT '',
    sort_order  INTEGER DEFAULT 0,
    active      INTEGER DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS clients (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    phone           TEXT UNIQUE NOT NULL,
    name            TEXT DEFAULT '',
    email           TEXT DEFAULT '',
    birthday        TEXT DEFAULT '',
    address         TEXT DEFAULT '',
    emergency_name  TEXT DEFAULT '',
    emergency_phone TEXT DEFAULT '',
    health_conditions TEXT DEFAULT '',
    allergies       TEXT DEFAULT '',
    medications     TEXT DEFAULT '',
    pressure_pref   TEXT DEFAULT '',
    areas_to_avoid  TEXT DEFAULT '',
    areas_to_focus  TEXT DEFAULT '',
    pregnancy       INTEGER DEFAULT 0,
    consent_signed  INTEGER DEFAULT 0,
    consent_date    TEXT DEFAULT '',
    notes           TEXT DEFAULT '',
    intake_complete INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS email_signups (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT UNIQUE NOT NULL,
    source     TEXT DEFAULT 'coming-soon',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sent_updates (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    subject         TEXT NOT NULL,
    message         TEXT NOT NULL,
    recipient_count INTEGER DEFAULT 0,
    sent_at         TEXT DEFAULT (datetime('now'))
  );
`);

/* =========================================================================
   Schema migrations (add columns if upgrading from older DB)
   ========================================================================= */

function safeAddColumn(table, column, def) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  } catch (e) { /* column already exists */ }
}

safeAddColumn("therapists", "gender", "TEXT DEFAULT 'female'");
safeAddColumn("therapists", "service_ids", "TEXT DEFAULT ''");
safeAddColumn("bookings", "therapist2_id", "INTEGER");
safeAddColumn("bookings", "gender_pref", "TEXT DEFAULT ''");
safeAddColumn("therapists", "photo", "TEXT DEFAULT ''");
safeAddColumn("therapists", "bio", "TEXT DEFAULT ''");
safeAddColumn("bookings", "payment_method", "TEXT DEFAULT ''");
safeAddColumn("bookings", "tip_amount", "REAL DEFAULT 0");
safeAddColumn("bookings", "completed_by", "TEXT DEFAULT ''");
safeAddColumn("bookings", "addon_ids", "TEXT DEFAULT ''");
safeAddColumn("bookings", "cancel_token", "TEXT DEFAULT ''");
safeAddColumn("bookings", "client_email", "TEXT DEFAULT ''");
safeAddColumn("bookings", "recurring_id", "TEXT DEFAULT ''");
safeAddColumn("bookings", "reminder_sent", "INTEGER DEFAULT 0");
safeAddColumn("services", "good_for", "TEXT DEFAULT ''");
// Therapist work schedule
safeAddColumn("bookings", "discount_code", "TEXT DEFAULT ''");
safeAddColumn("bookings", "gift_cert_code", "TEXT DEFAULT ''");
// Gift certificate payment tracking
safeAddColumn("gift_certificates", "paid", "INTEGER DEFAULT 0");
safeAddColumn("gift_certificates", "payment_method", "TEXT DEFAULT ''");
safeAddColumn("therapists", "work_days", "TEXT DEFAULT '1,2,3,4,5,6'");   // 1=Mon..7=Sun
safeAddColumn("therapists", "start_time", "TEXT DEFAULT '09:00'");
safeAddColumn("therapists", "end_time", "TEXT DEFAULT '19:00'");
// Employee PIN for accountability
safeAddColumn("therapists", "pin", "TEXT DEFAULT ''");
// Employment status: 'active', 'left', 'fired'
safeAddColumn("therapists", "employment_status", "TEXT DEFAULT 'active'");
safeAddColumn("therapists", "departure_date", "TEXT DEFAULT ''");
// Gift certificate accountability
safeAddColumn("gift_certificates", "created_by", "TEXT DEFAULT ''");
safeAddColumn("gift_certificates", "created_by_pin", "TEXT DEFAULT ''");
// Gift certificate redemption accountability
safeAddColumn("gift_certificate_redemptions", "staff_name", "TEXT DEFAULT ''");

// Expense enhancements — recurring frequency and startup tracking
safeAddColumn("expenses", "frequency", "TEXT DEFAULT 'one-time'"); // one-time, monthly, yearly
safeAddColumn("expenses", "is_startup", "INTEGER DEFAULT 0");      // 1 = startup cost
safeAddColumn("expenses", "vendor", "TEXT DEFAULT ''");
safeAddColumn("expenses", "notes", "TEXT DEFAULT ''");
safeAddColumn("expenses", "payment_status", "TEXT DEFAULT 'paid'"); // paid, due, reimburse
safeAddColumn("expenses", "paid_by", "TEXT DEFAULT ''");            // who paid out of pocket
safeAddColumn("expenses", "paid_date", "TEXT DEFAULT ''");          // when it was actually paid/reimbursed
safeAddColumn("expenses", "due_to", "TEXT DEFAULT ''");             // who is owed (person or company)
safeAddColumn("expenses", "due_date", "TEXT DEFAULT ''");           // when the bill is due
safeAddColumn("expenses", "receipt_file", "TEXT DEFAULT ''");       // path to receipt file (photo or PDF)
safeAddColumn("expenses", "tax_deductible", "INTEGER DEFAULT 1");   // 1 = tax writeoff eligible, 0 = not deductible

/* =========================================================================
   Seed default settings (only if table is empty)
   ========================================================================= */

function seedSettings() {
  const count = db.prepare("SELECT COUNT(*) AS c FROM settings").get().c;
  if (count > 0) return;

  const defaults = {
    admin_password: "serenity2025",
    spa_name: "J&M Serenity Spa",
    phone: "",
    email: "",
    address: "Highlands Ranch, CO",
    open_time: "09:00",
    close_time: "19:00",
    open_days: "1,2,3,4,5,6",
    slot_interval: "30",
    full_body_rooms: "6",
    chair_stations: "4",
    foot_chairs: "4",
    couples_rooms: "5,6",
    smtp_host: "",
    smtp_port: "587",
    smtp_user: "",
    smtp_pass: "",
    smtp_from: "",
    google_maps_embed: "",
  };

  const ins = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(defaults)) ins.run(k, v);
  });
  tx();
}

function seedTherapists() {
  const count = db.prepare("SELECT COUNT(*) AS c FROM therapists").get().c;
  if (count > 0) return;

  const data = [
    { name: "Maria S.", gender: "female", specialties: "Swedish, Deep Tissue, Hot Stone" },
    { name: "James T.", gender: "male", specialties: "Deep Tissue, Sports" },
    { name: "Lisa K.", gender: "female", specialties: "Swedish, Prenatal, Hot Stone" },
    { name: "David R.", gender: "male", specialties: "Deep Tissue, Sports, Chair" },
    { name: "Sarah M.", gender: "female", specialties: "Swedish, Foot Reflexology" },
    { name: "Mike L.", gender: "male", specialties: "Chair, Foot Massage" },
  ];

  const ins = db.prepare(
    "INSERT INTO therapists (name, gender, specialties, service_ids) VALUES (?, ?, ?, ?)"
  );
  const tx = db.transaction(() => {
    for (const t of data) ins.run(t.name, t.gender, t.specialties, "");
  });
  tx();
}

function seedServices() {
  const count = db.prepare("SELECT COUNT(*) AS c FROM services").get().c;
  if (count > 0) return;

  const data = [
    { name: "Swedish Massage", description: "A gentle, relaxing full-body massage.", duration: 60, price: 80, category: "full_body" },
    { name: "Deep Tissue Massage", description: "Focused pressure targeting deep muscle layers.", duration: 60, price: 95, category: "full_body" },
    { name: "Hot Stone Massage", description: "Warm stones melt tension and promote deep relaxation.", duration: 90, price: 120, category: "full_body" },
    { name: "Couples Massage", description: "Side-by-side massage for two in a private room.", duration: 60, price: 160, category: "couples" },
    { name: "Prenatal Massage", description: "Safe, gentle massage designed for expecting mothers.", duration: 60, price: 85, category: "full_body" },
    { name: "Sports Massage", description: "Targeted work for athletes and active lifestyles.", duration: 60, price: 95, category: "full_body" },
    { name: "Chair Massage", description: "Quick upper-body massage — no disrobing required.", duration: 30, price: 40, category: "chair" },
    { name: "Foot Reflexology", description: "Pressure-point therapy on the feet for whole-body balance.", duration: 30, price: 45, category: "foot" },
    { name: "Foot Massage", description: "Relaxing massage focused on the feet and lower legs.", duration: 45, price: 55, category: "foot" },
    { name: "Combo Massage", description: "Full-body session followed by a foot treatment.", duration: 90, price: 120, category: "combo" },
    { name: "Four Hands Massage", description: "Two therapists work in sync for a deeply immersive full-body experience.", duration: 60, price: 170, category: "four_hands" },
  ];

  const ins = db.prepare(
    "INSERT INTO services (name, description, duration, price, category) VALUES (?, ?, ?, ?, ?)"
  );
  const tx = db.transaction(() => {
    for (const s of data) ins.run(s.name, s.description, s.duration, s.price, s.category);
  });
  tx();
}

function seedAddons() {
  const count = db.prepare("SELECT COUNT(*) AS c FROM addons").get().c;
  if (count > 0) return;

  const data = [
    { name: "Aromatherapy", description: "Essential oils added to your session for enhanced relaxation.", price: 15 },
    { name: "Cupping", description: "Silicone cups to release deep muscle tension and improve circulation.", price: 20 },
    { name: "Hot Stone", description: "Warm basalt stones placed on key points to melt away stress.", price: 25 },
  ];

  const ins = db.prepare("INSERT INTO addons (name, description, price) VALUES (?, ?, ?)");
  const tx = db.transaction(() => {
    for (const a of data) ins.run(a.name, a.description, a.price);
  });
  tx();
}

// Run seeds
seedSettings();
seedTherapists();
seedServices();
seedAddons();

/* =========================================================================
   Settings helpers
   ========================================================================= */

function getSetting(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

function getAllSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const obj = {};
  for (const r of rows) obj[r.key] = r.value;
  return obj;
}

/* =========================================================================
   Therapists
   ========================================================================= */

function getActiveTherapists() {
  return db.prepare("SELECT * FROM therapists WHERE active = 1 ORDER BY name").all();
}

function getAllTherapists() {
  return db.prepare("SELECT * FROM therapists ORDER BY name").all();
}

function getTherapistById(id) {
  return db.prepare("SELECT * FROM therapists WHERE id = ?").get(id);
}

function addTherapist(name, gender, specialties, serviceIds, photo, bio, workDays, startTime, endTime, pin) {
  return db.prepare(
    "INSERT INTO therapists (name, gender, specialties, service_ids, photo, bio, work_days, start_time, end_time, pin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(name, gender || "female", specialties || "", serviceIds || "", photo || "", bio || "", workDays || "1,2,3,4,5,6", startTime || "09:00", endTime || "19:00", pin || "");
}

function updateTherapist(id, name, gender, specialties, serviceIds, photo, bio, workDays, startTime, endTime, pin) {
  db.prepare(
    "UPDATE therapists SET name = ?, gender = ?, specialties = ?, service_ids = ?, photo = ?, bio = ?, work_days = ?, start_time = ?, end_time = ?, pin = ? WHERE id = ?"
  ).run(name, gender || "female", specialties || "", serviceIds || "", photo || "", bio || "", workDays || "1,2,3,4,5,6", startTime || "09:00", endTime || "19:00", pin || "", id);
}

function getTherapistByPin(pin) {
  if (!pin) return null;
  return db.prepare("SELECT * FROM therapists WHERE pin = ? AND active = 1").get(pin);
}

function toggleTherapist(id) {
  db.prepare("UPDATE therapists SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ?").run(id);
}

function deleteTherapist(id) {
  db.prepare("DELETE FROM therapists WHERE id = ?").run(id);
}

function markTherapistDeparted(id, status) {
  // status should be 'left' or 'fired'
  const now = new Date().toISOString().slice(0, 10);
  db.prepare("UPDATE therapists SET employment_status = ?, departure_date = ?, active = 0, pin = '' WHERE id = ?").run(status || "left", now, id);
}

function reactivateTherapist(id) {
  db.prepare("UPDATE therapists SET employment_status = 'active', departure_date = '', active = 1 WHERE id = ?").run(id);
}

/* =========================================================================
   Services
   ========================================================================= */

function getActiveServices() {
  return db.prepare("SELECT * FROM services WHERE active = 1 ORDER BY category, name").all();
}

function getAllServices() {
  return db.prepare("SELECT * FROM services ORDER BY category, name").all();
}

function getServiceById(id) {
  return db.prepare("SELECT * FROM services WHERE id = ?").get(id);
}

function addService(name, description, duration, price, category, goodFor) {
  return db.prepare(
    "INSERT INTO services (name, description, duration, price, category, good_for) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(name, description, duration, price, category, goodFor || "");
}

function toggleService(id) {
  db.prepare("UPDATE services SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ?").run(id);
}

function updateService(id, name, description, duration, price, category, goodFor) {
  db.prepare(
    "UPDATE services SET name = ?, description = ?, duration = ?, price = ?, category = ?, good_for = ? WHERE id = ?"
  ).run(name, description || "", duration, price, category, goodFor || "", id);
}

function deleteService(id) {
  db.prepare("DELETE FROM services WHERE id = ?").run(id);
}

/* =========================================================================
   Add-Ons
   ========================================================================= */

function getActiveAddons() {
  return db.prepare("SELECT * FROM addons WHERE active = 1 ORDER BY name").all();
}

function getAllAddons() {
  return db.prepare("SELECT * FROM addons ORDER BY name").all();
}

function getAddonById(id) {
  return db.prepare("SELECT * FROM addons WHERE id = ?").get(id);
}

function addAddon(name, description, price) {
  return db.prepare("INSERT INTO addons (name, description, price) VALUES (?, ?, ?)").run(name, description || "", price);
}

function updateAddon(id, name, description, price) {
  db.prepare("UPDATE addons SET name = ?, description = ?, price = ? WHERE id = ?").run(name, description || "", price, id);
}

function toggleAddon(id) {
  db.prepare("UPDATE addons SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ?").run(id);
}

function deleteAddon(id) {
  db.prepare("DELETE FROM addons WHERE id = ?").run(id);
}

function getAddonsByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  return db.prepare("SELECT * FROM addons WHERE id IN (" + placeholders + ")").all(...ids);
}

/* =========================================================================
   Bookings
   ========================================================================= */

function createBooking({ clientName, clientPhone, clientEmail, serviceId, therapistId, therapist2Id, genderPref, notes, areas, date, time, duration, source, addonIds, cancelToken, recurringId }) {
  return db.prepare(`
    INSERT INTO bookings (client_name, client_phone, client_email, service_id, therapist_id, therapist2_id, gender_pref, notes, areas, date, time, duration, source, addon_ids, cancel_token, recurring_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    clientName, clientPhone, clientEmail || "", serviceId,
    therapistId || null, therapist2Id || null, genderPref || "",
    notes || "", areas || "", date, time, duration, source || "online",
    addonIds || "", cancelToken || "", recurringId || ""
  );
}

function getBookingsForDate(date) {
  return db.prepare(`
    SELECT b.*, s.name AS service_name, s.category AS service_category,
           t.name AS therapist_name, t.gender AS therapist_gender,
           t2.name AS therapist2_name
    FROM bookings b
    LEFT JOIN services s ON b.service_id = s.id
    LEFT JOIN therapists t ON b.therapist_id = t.id
    LEFT JOIN therapists t2 ON b.therapist2_id = t2.id
    WHERE b.date = ? AND b.status IN ('confirmed', 'completed')
    ORDER BY b.time
  `).all(date);
}

function getUpcomingBookings(limit = 20) {
  const today = new Date().toISOString().slice(0, 10);
  return db.prepare(`
    SELECT b.*, s.name AS service_name,
           t.name AS therapist_name, t2.name AS therapist2_name
    FROM bookings b
    LEFT JOIN services s ON b.service_id = s.id
    LEFT JOIN therapists t ON b.therapist_id = t.id
    LEFT JOIN therapists t2 ON b.therapist2_id = t2.id
    WHERE b.date >= ? AND b.status = 'confirmed'
    ORDER BY b.date, b.time
    LIMIT ?
  `).all(today, limit);
}

function cancelBooking(id) {
  db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(id);
}

function completeBooking(id, paymentMethod, tipAmount, completedBy) {
  db.prepare(
    "UPDATE bookings SET status = 'completed', payment_method = ?, tip_amount = ?, completed_by = ? WHERE id = ?"
  ).run(paymentMethod || "", tipAmount || 0, completedBy || "", id);
}

function noShowBooking(id) {
  db.prepare("UPDATE bookings SET status = 'no_show' WHERE id = ?").run(id);
}

function getBookingById(id) {
  return db.prepare(`
    SELECT b.*, s.name AS service_name, s.category AS service_category,
           t.name AS therapist_name, t.gender AS therapist_gender,
           t2.name AS therapist2_name
    FROM bookings b
    LEFT JOIN services s ON b.service_id = s.id
    LEFT JOIN therapists t ON b.therapist_id = t.id
    LEFT JOIN therapists t2 ON b.therapist2_id = t2.id
    WHERE b.id = ?
  `).get(id);
}

/* =========================================================================
   Availability / Scheduling Logic
   ========================================================================= */

function getAvailableSlots(serviceId, date, therapistId, therapist2Id, genderPref) {
  const settings = getAllSettings();
  const service = getServiceById(serviceId);
  if (!service) return [];

  const openTime = settings.open_time || "09:00";
  const closeTime = settings.close_time || "19:00";
  const interval = parseInt(settings.slot_interval || "30", 10);

  // Resource capacity by category
  const capacity = {
    full_body: parseInt(settings.full_body_rooms || "6", 10),
    chair: parseInt(settings.chair_stations || "4", 10),
    foot: parseInt(settings.foot_chairs || "4", 10),
    couples: (settings.couples_rooms || "5,6").split(",").length,
  };
  capacity.combo = Math.min(capacity.full_body, capacity.foot);
  capacity.four_hands = capacity.full_body; // uses 1 full-body room

  const serviceDuration = service.duration;
  const serviceCategory = service.category;
  const isFourHands = serviceCategory === "four_hands";

  // Get all confirmed bookings for this date
  const dayBookings = getBookingsForDate(date);

  // Get blocked times for this date
  const dayBlocks = getBlockedTimes(null, date);

  // For gender preference filtering (when no specific therapist chosen)
  let eligibleTherapists = null;
  if (genderPref && !therapistId) {
    const allActive = getActiveTherapists();
    eligibleTherapists = allActive.filter(function(t) { return t.gender === genderPref; });
    if (eligibleTherapists.length === 0) return [];
  }

  const slots = [];
  const [openH, openM] = openTime.split(":").map(Number);
  const [closeH, closeM] = closeTime.split(":").map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  for (let m = openMinutes; m + serviceDuration <= closeMinutes; m += interval) {
    const slotStart = m;
    const slotEnd = m + serviceDuration;

    let roomConflicts = 0;
    let therapistBusy = false;
    let therapist2Busy = false;

    for (const bk of dayBookings) {
      const [bh, bm] = bk.time.split(":").map(Number);
      const bkStart = bh * 60 + bm;
      const bkEnd = bkStart + bk.duration;

      if (slotStart < bkEnd && slotEnd > bkStart) {
        // Check specific therapist conflicts
        if (therapistId) {
          const tid = parseInt(therapistId, 10);
          if (bk.therapist_id === tid || bk.therapist2_id === tid) therapistBusy = true;
        }
        if (therapist2Id) {
          const t2id = parseInt(therapist2Id, 10);
          if (bk.therapist_id === t2id || bk.therapist2_id === t2id) therapist2Busy = true;
        }

        // Count room conflicts
        const bkCat = bk.service_category || "full_body";
        const effCat = isFourHands ? "full_body" : serviceCategory;
        const bkEff = bkCat === "four_hands" ? "full_body" : bkCat;

        if (effCat === "combo") {
          if (bkEff === "full_body" || bkEff === "couples" || bkCat === "combo") roomConflicts++;
        } else if (effCat === bkEff) {
          roomConflicts++;
        } else if (effCat === "full_body" && bkEff === "couples") {
          roomConflicts++;
        }
      }
    }

    // Check blocked times for specific therapists
    if (therapistId) {
      const tid = parseInt(therapistId, 10);
      for (const blk of dayBlocks) {
        if (blk.therapist_id !== tid) continue;
        if (blk.all_day) { therapistBusy = true; break; }
        if (blk.start_time && blk.end_time) {
          const [bsh, bsm] = blk.start_time.split(":").map(Number);
          const [beh, bem] = blk.end_time.split(":").map(Number);
          const bs = bsh * 60 + bsm;
          const be = beh * 60 + bem;
          if (slotStart < be && slotEnd > bs) { therapistBusy = true; break; }
        }
      }
    }
    if (therapist2Id) {
      const t2id = parseInt(therapist2Id, 10);
      for (const blk of dayBlocks) {
        if (blk.therapist_id !== t2id) continue;
        if (blk.all_day) { therapist2Busy = true; break; }
        if (blk.start_time && blk.end_time) {
          const [bsh, bsm] = blk.start_time.split(":").map(Number);
          const [beh, bem] = blk.end_time.split(":").map(Number);
          const bs = bsh * 60 + bsm;
          const be = beh * 60 + bem;
          if (slotStart < be && slotEnd > bs) { therapist2Busy = true; break; }
        }
      }
    }

    if (therapistBusy && therapistId) continue;
    if (therapist2Busy && therapist2Id) continue;

    // Room capacity check
    const effCat = isFourHands ? "full_body" : serviceCategory;
    const maxCap = capacity[effCat] || capacity.full_body;
    if (!therapistId && roomConflicts >= maxCap) continue;

    // Gender preference: ensure at least 1 (or 2 for four hands) eligible therapist free
    if (eligibleTherapists && !therapistId) {
      const busyIds = new Set();
      for (const bk of dayBookings) {
        const [bh2, bm2] = bk.time.split(":").map(Number);
        const bkS = bh2 * 60 + bm2;
        const bkE = bkS + bk.duration;
        if (slotStart < bkE && slotEnd > bkS) {
          if (bk.therapist_id) busyIds.add(bk.therapist_id);
          if (bk.therapist2_id) busyIds.add(bk.therapist2_id);
        }
      }
      // Also mark therapists blocked during this slot
      for (const blk of dayBlocks) {
        if (blk.all_day) { busyIds.add(blk.therapist_id); continue; }
        if (blk.start_time && blk.end_time) {
          const [bsh, bsm] = blk.start_time.split(":").map(Number);
          const [beh, bem] = blk.end_time.split(":").map(Number);
          const bs = bsh * 60 + bsm;
          const be = beh * 60 + bem;
          if (slotStart < be && slotEnd > bs) busyIds.add(blk.therapist_id);
        }
      }
      const freeCount = eligibleTherapists.filter(function(t) { return !busyIds.has(t.id); }).length;
      if (freeCount < (isFourHands ? 2 : 1)) continue;
    }

    // Format
    const h = Math.floor(m / 60);
    const min = m % 60;
    const time = String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const label = h12 + ":" + String(min).padStart(2, "0") + " " + ampm;

    slots.push({ time: time, label: label });
  }

  return slots;
}

/* =========================================================================
   Therapist Status (for TV display)
   ========================================================================= */

function getTherapistStatuses() {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const therapists = getActiveTherapists();
  const dayBookings = getBookingsForDate(today);

  return therapists.map(function(t) {
    let status = "available";
    let currentService = null;
    let availableAt = null;
    let nextBooking = null;

    for (const bk of dayBookings) {
      if (bk.status !== "confirmed") continue;
      const isMine = bk.therapist_id === t.id || bk.therapist2_id === t.id;
      if (!isMine) continue;

      const [bh, bm] = bk.time.split(":").map(Number);
      const bkStart = bh * 60 + bm;
      const bkEnd = bkStart + bk.duration;

      if (nowMinutes >= bkStart && nowMinutes < bkEnd) {
        status = "busy";
        currentService = bk.service_name;
        const endH = Math.floor(bkEnd / 60);
        const endM = bkEnd % 60;
        const ampm = endH >= 12 ? "PM" : "AM";
        const h12 = endH === 0 ? 12 : endH > 12 ? endH - 12 : endH;
        availableAt = h12 + ":" + String(endM).padStart(2, "0") + " " + ampm;
      } else if (bkStart > nowMinutes && !nextBooking) {
        const nbH = Math.floor(bkStart / 60);
        const nbM = bkStart % 60;
        const ampm2 = nbH >= 12 ? "PM" : "AM";
        const h12b = nbH === 0 ? 12 : nbH > 12 ? nbH - 12 : nbH;
        nextBooking = {
          service: bk.service_name,
          time: h12b + ":" + String(nbM).padStart(2, "0") + " " + ampm2,
        };
      }
    }

    return {
      id: t.id,
      name: t.name,
      gender: t.gender,
      photo: t.photo || "",
      specialties: t.specialties,
      bio: t.bio || "",
      status: status,
      currentService: currentService,
      availableAt: availableAt,
      nextBooking: nextBooking,
    };
  });
}

/* =========================================================================
   Expenses
   ========================================================================= */

function getExpenses(month, filter) {
  let sql = "SELECT * FROM expenses WHERE 1=1";
  const params = [];
  
  // Only apply month filter to "one-time" expenses (not recurring or startup)
  // For "monthly", "yearly", "recurring", and "startup" filters, show ALL matching records, not just one month
  const recurringFilters = ["monthly", "yearly", "recurring", "startup"];
  if (month && !recurringFilters.includes(filter)) { 
    sql += " AND date LIKE ?"; 
    params.push(month + "%"); 
  }
  
  if (filter === "monthly") { sql += " AND frequency = 'monthly'"; }
  else if (filter === "yearly") { sql += " AND frequency = 'yearly'"; }
  else if (filter === "recurring") { sql += " AND frequency IN ('monthly', 'yearly')"; }
  else if (filter === "startup") { sql += " AND is_startup = 1"; }
  else if (filter === "due") { sql += " AND payment_status = 'due'"; }
  else if (filter === "reimburse") { sql += " AND payment_status = 'reimburse'"; }
  else if (filter === "unpaid") { sql += " AND payment_status IN ('due', 'reimburse')"; }
  sql += " ORDER BY date DESC";
  return db.prepare(sql).all(...params);
}

function addExpense(opts) {
  return db.prepare(
    "INSERT INTO expenses (description, amount, category, date, frequency, is_startup, vendor, notes, payment_status, paid_by, due_to, due_date, receipt_file, tax_deductible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    opts.description, opts.amount, opts.category, opts.date,
    opts.frequency || "one-time", opts.is_startup ? 1 : 0,
    opts.vendor || "", opts.notes || "",
    opts.payment_status || "paid", opts.paid_by || "",
    opts.due_to || "", opts.due_date || "",
    opts.receipt_file || "",
    opts.tax_deductible !== 0 ? 1 : 0
  );
}

function updateExpense(id, data) {
  db.prepare(`
    UPDATE expenses SET description=?, amount=?, category=?, date=?, frequency=?, is_startup=?, vendor=?, notes=?, payment_status=?, paid_by=?, due_to=?, due_date=?, receipt_file=?, tax_deductible=?
    WHERE id=?
  `).run(
    data.description, data.amount, data.category, data.date,
    data.frequency || "one-time", data.is_startup ? 1 : 0,
    data.vendor || "", data.notes || "",
    data.payment_status || "paid", data.paid_by || "",
    data.due_to || "", data.due_date || "",
    data.receipt_file || "",
    data.tax_deductible !== 0 ? 1 : 0, id
  );
}

function markExpensePaid(id) {
  db.prepare("UPDATE expenses SET payment_status = 'paid', paid_date = ? WHERE id = ?").run(new Date().toISOString().split("T")[0], id);
}

function getExpenseById(id) {
  return db.prepare("SELECT * FROM expenses WHERE id = ?").get(id);
}

function deleteExpense(id) {
  db.prepare("DELETE FROM expenses WHERE id = ?").run(id);
}

function getExpenseTotals(month) {
  return db.prepare(
    "SELECT category, SUM(amount) AS total FROM expenses WHERE date LIKE ? GROUP BY category ORDER BY total DESC"
  ).all(month + "%");
}

function getRecurringExpenseSummary() {
  const monthly = db.prepare("SELECT SUM(amount) AS total FROM expenses WHERE frequency = 'monthly'").get();
  const yearly = db.prepare("SELECT SUM(amount) AS total FROM expenses WHERE frequency = 'yearly'").get();
  const startup = db.prepare("SELECT SUM(amount) AS total FROM expenses WHERE is_startup = 1").get();
  const due = db.prepare("SELECT SUM(amount) AS total FROM expenses WHERE payment_status = 'due'").get();
  const reimburse = db.prepare("SELECT SUM(amount) AS total FROM expenses WHERE payment_status = 'reimburse'").get();
  // Break down who is owed money
  const owedByPerson = db.prepare(
    "SELECT due_to AS person, SUM(amount) AS total FROM expenses WHERE payment_status IN ('due', 'reimburse') AND due_to != '' GROUP BY due_to ORDER BY total DESC"
  ).all();
  return {
    monthlyTotal: (monthly && monthly.total) || 0,
    yearlyTotal: (yearly && yearly.total) || 0,
    startupTotal: (startup && startup.total) || 0,
    estimatedMonthly: ((monthly && monthly.total) || 0) + (((yearly && yearly.total) || 0) / 12),
    dueTotal: (due && due.total) || 0,
    reimburseTotal: (reimburse && reimburse.total) || 0,
    owedByPerson: owedByPerson,
  };
}

function getTaxDeductibleSummary(month) {
  const deductible = db.prepare(
    "SELECT category, SUM(amount) AS total FROM expenses WHERE tax_deductible = 1 AND date LIKE ? GROUP BY category ORDER BY total DESC"
  ).all(month + "%");
  const deductibleTotal = db.prepare(
    "SELECT SUM(amount) AS total FROM expenses WHERE tax_deductible = 1 AND date LIKE ?"
  ).get(month + "%");
  const nonDeductible = db.prepare(
    "SELECT SUM(amount) AS total FROM expenses WHERE tax_deductible = 0 AND date LIKE ?"
  ).get(month + "%");
  return {
    byCategory: deductible,
    totalDeductible: (deductibleTotal && deductibleTotal.total) || 0,
    totalNonDeductible: (nonDeductible && nonDeductible.total) || 0,
  };
}

function getQuarterlyTaxSummary(year, quarter) {
  // Quarter: 1 = Jan-Mar, 2 = Apr-Jun, 3 = Jul-Sep, 4 = Oct-Dec
  const monthMap = {
    1: ["01", "02", "03"],
    2: ["04", "05", "06"],
    3: ["07", "08", "09"],
    4: ["10", "11", "12"]
  };
  const months = monthMap[quarter] || [];
  
  let sql = "SELECT category, SUM(amount) AS total FROM expenses WHERE tax_deductible = 1 AND (";
  const params = [year];
  sql += months.map(() => "date LIKE ? || '-' || ?").join(" OR ");
  sql += ") GROUP BY category ORDER BY total DESC";
  
  // Build params: year, month1, month2, month3, etc.
  const expandedParams = [];
  months.forEach(m => {
    expandedParams.push(year + "-" + m + "%");
  });
  
  const deductible = db.prepare(
    "SELECT category, SUM(amount) AS total FROM expenses WHERE tax_deductible = 1 AND (" +
    months.map(() => "date LIKE ?").join(" OR ") +
    ") GROUP BY category ORDER BY total DESC"
  ).all(...months.map(m => year + "-" + m + "%"));
  
  const deductibleTotal = db.prepare(
    "SELECT SUM(amount) AS total FROM expenses WHERE tax_deductible = 1 AND (" +
    months.map(() => "date LIKE ?").join(" OR ") +
    ")"
  ).get(...months.map(m => year + "-" + m + "%"));
  
  const nonDeductible = db.prepare(
    "SELECT SUM(amount) AS total FROM expenses WHERE tax_deductible = 0 AND (" +
    months.map(() => "date LIKE ?").join(" OR ") +
    ")"
  ).get(...months.map(m => year + "-" + m + "%"));
  
  const estimatedTaxOwed = ((deductibleTotal && deductibleTotal.total) || 0) * 0.25; // rough 25% federal + FICA est
  
  return {
    quarter: quarter,
    year: year,
    months: months,
    byCategory: deductible,
    totalDeductible: (deductibleTotal && deductibleTotal.total) || 0,
    totalNonDeductible: (nonDeductible && nonDeductible.total) || 0,
    estimatedTaxOwed: estimatedTaxOwed,
  };
}

/* =========================================================================
   Email Signups (coming soon page)
   ========================================================================= */

function addEmailSignup(email) {
  try {
    db.prepare("INSERT INTO email_signups (email) VALUES (?)").run(email.trim().toLowerCase());
    return { ok: true };
  } catch (e) {
    if (e.message.includes("UNIQUE")) return { ok: true }; // already signed up, no error
    throw e;
  }
}

function getEmailSignups() {
  return db.prepare("SELECT * FROM email_signups ORDER BY created_at DESC").all();
}

function getEmailSignupCount() {
  return db.prepare("SELECT COUNT(*) AS count FROM email_signups").get().count;
}

function saveSentUpdate(subject, message, recipientCount) {
  db.prepare("INSERT INTO sent_updates (subject, message, recipient_count) VALUES (?, ?, ?)").run(subject, message, recipientCount);
}

function getSentUpdates() {
  return db.prepare("SELECT * FROM sent_updates ORDER BY sent_at DESC LIMIT 20").all();
}

/* =========================================================================
   Database Reset (clear test data, keep expenses & settings)
   ========================================================================= */

function resetTestData() {
  const tables = [
    "bookings",
    "clients",
    "gift_certificates",
    "gift_certificate_redemptions",
    "waitlist",
    "blocked_times",
    "members",
    "member_visits",
    "reviews",
    "gallery_images",
    "discount_codes",
  ];
  for (const table of tables) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
  // Reset auto-increment counters for cleared tables
  for (const table of tables) {
    db.prepare("DELETE FROM sqlite_sequence WHERE name = ?").run(table);
  }
  return tables;
}

/* =========================================================================
   Stats
   ========================================================================= */

function getBookingStats() {
  const today = new Date().toISOString().slice(0, 10);
  const weekFromNow = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + "-01";

  const todayCount = db.prepare("SELECT COUNT(*) AS c FROM bookings WHERE date = ? AND status IN ('confirmed','completed')").get(today).c;
  const weekCount = db.prepare("SELECT COUNT(*) AS c FROM bookings WHERE date BETWEEN ? AND ? AND status IN ('confirmed','completed')").get(today, weekFromNow).c;
  const monthCount = db.prepare("SELECT COUNT(*) AS c FROM bookings WHERE date >= ? AND status IN ('confirmed','completed')").get(monthStart).c;

  return { todayCount, weekCount, monthCount };
}

function getDailySummary(date) {
  // All bookings for the date (confirmed + completed)
  const bookings = db.prepare(`
    SELECT b.*, s.name AS service_name, s.price AS service_price,
           t.name AS therapist_name, t.id AS tid,
           t2.name AS therapist2_name, t2.id AS t2id
    FROM bookings b
    LEFT JOIN services s ON b.service_id = s.id
    LEFT JOIN therapists t ON b.therapist_id = t.id
    LEFT JOIN therapists t2 ON b.therapist2_id = t2.id
    WHERE b.date = ? AND b.status IN ('confirmed', 'completed')
    ORDER BY b.time
  `).all(date);

  // Build per-therapist breakdown
  var byTherapist = {};

  bookings.forEach(function(bk) {
    // Primary therapist
    if (bk.therapist_name) {
      if (!byTherapist[bk.tid]) {
        byTherapist[bk.tid] = { name: bk.therapist_name, total: 0, completed: 0, tips: 0, services: [] };
      }
      byTherapist[bk.tid].total++;
      if (bk.status === "completed") {
        byTherapist[bk.tid].completed++;
        byTherapist[bk.tid].tips += (bk.tip_amount || 0);
      }
      byTherapist[bk.tid].services.push({
        time: bk.time,
        service: bk.service_name,
        client: bk.client_name,
        status: bk.status,
        payment: bk.payment_method || "",
        tip: bk.tip_amount || 0,
      });
    }

    // Second therapist (four hands)
    if (bk.therapist2_name) {
      if (!byTherapist[bk.t2id]) {
        byTherapist[bk.t2id] = { name: bk.therapist2_name, total: 0, completed: 0, tips: 0, services: [] };
      }
      byTherapist[bk.t2id].total++;
      if (bk.status === "completed") {
        byTherapist[bk.t2id].completed++;
        // Tip only counted once for the primary therapist
      }
      byTherapist[bk.t2id].services.push({
        time: bk.time,
        service: bk.service_name + " (4-hands)",
        client: bk.client_name,
        status: bk.status,
        payment: bk.payment_method || "",
        tip: 0,
      });
    }
  });

  // Sort by name and convert to array
  var therapistList = Object.values(byTherapist).sort(function(a, b) {
    return a.name.localeCompare(b.name);
  });

  var totalBookings = bookings.length;
  var totalCompleted = bookings.filter(function(b) { return b.status === "completed"; }).length;
  var totalTips = bookings.reduce(function(sum, b) { return sum + (b.tip_amount || 0); }, 0);
  var totalRevenue = bookings.filter(function(b) { return b.status === "completed"; }).reduce(function(sum, b) { return sum + (b.service_price || 0); }, 0);

  return {
    totalBookings: totalBookings,
    totalCompleted: totalCompleted,
    totalTips: totalTips,
    totalRevenue: totalRevenue,
    byTherapist: therapistList,
  };
}

/* =========================================================================
   Waitlist
   ========================================================================= */

function addToWaitlist({ clientName, clientPhone, clientEmail, serviceId, therapistId, preferredDate, preferredTime, notes }) {
  return db.prepare(
    "INSERT INTO waitlist (client_name, client_phone, client_email, service_id, therapist_id, preferred_date, preferred_time, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(clientName, clientPhone, clientEmail || "", serviceId || null, therapistId || null, preferredDate, preferredTime || "", notes || "");
}

function getWaitlist() {
  return db.prepare(`
    SELECT w.*, s.name AS service_name, t.name AS therapist_name
    FROM waitlist w
    LEFT JOIN services s ON w.service_id = s.id
    LEFT JOIN therapists t ON w.therapist_id = t.id
    WHERE w.status = 'waiting'
    ORDER BY w.preferred_date, w.created_at
  `).all();
}

function removeFromWaitlist(id) {
  db.prepare("UPDATE waitlist SET status = 'contacted' WHERE id = ?").run(id);
}

function deleteWaitlistEntry(id) {
  db.prepare("DELETE FROM waitlist WHERE id = ?").run(id);
}

/* =========================================================================
   Blocked Times
   ========================================================================= */

function addBlockedTime(therapistId, date, startTime, endTime, allDay, reason) {
  return db.prepare(
    "INSERT INTO blocked_times (therapist_id, date, start_time, end_time, all_day, reason) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(therapistId, date, startTime || "", endTime || "", allDay ? 1 : 0, reason || "");
}

function getBlockedTimes(therapistId, date) {
  if (therapistId && date) {
    return db.prepare("SELECT * FROM blocked_times WHERE therapist_id = ? AND date = ?").all(therapistId, date);
  }
  if (date) {
    return db.prepare("SELECT bt.*, t.name AS therapist_name FROM blocked_times bt LEFT JOIN therapists t ON bt.therapist_id = t.id WHERE bt.date = ? ORDER BY bt.start_time").all(date);
  }
  return db.prepare("SELECT bt.*, t.name AS therapist_name FROM blocked_times bt LEFT JOIN therapists t ON bt.therapist_id = t.id WHERE bt.date >= date('now') ORDER BY bt.date, bt.start_time LIMIT 100").all();
}

function deleteBlockedTime(id) {
  db.prepare("DELETE FROM blocked_times WHERE id = ?").run(id);
}

/* =========================================================================
   Gift Certificates
   ========================================================================= */

function createGiftCertificate(code, purchaserName, purchaserEmail, recipientName, amount, message, paymentMethod, createdBy) {
  const paid = paymentMethod ? 1 : 0;
  return db.prepare(
    "INSERT INTO gift_certificates (code, purchaser_name, purchaser_email, recipient_name, amount, balance, message, paid, payment_method, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(code, purchaserName, purchaserEmail || "", recipientName || "", amount, amount, message || "", paid, paymentMethod || "", createdBy || "");
}

function markGiftCertificatePaid(id, paymentMethod) {
  db.prepare("UPDATE gift_certificates SET paid = 1, payment_method = ? WHERE id = ?").run(paymentMethod || "Cash", id);
}

function getGiftCertificateByCode(code) {
  return db.prepare("SELECT * FROM gift_certificates WHERE code = ?").get(code);
}

function getGiftCertificateById(id) {
  return db.prepare("SELECT * FROM gift_certificates WHERE id = ?").get(id);
}

function getAllGiftCertificates() {
  return db.prepare("SELECT * FROM gift_certificates ORDER BY created_at DESC").all();
}

function redeemGiftCertificate(id, amount, redeemedBy, notes) {
  const cert = db.prepare("SELECT * FROM gift_certificates WHERE id = ?").get(id);
  if (!cert) return null;
  const actualAmount = Math.min(amount, cert.balance); // can't redeem more than balance
  const newBalance = Math.max(0, cert.balance - actualAmount);
  const newStatus = newBalance <= 0 ? "redeemed" : "active";
  db.prepare("UPDATE gift_certificates SET balance = ?, status = ? WHERE id = ?").run(newBalance, newStatus, id);
  // Log the redemption
  db.prepare(
    "INSERT INTO gift_certificate_redemptions (certificate_id, amount, redeemed_by, notes) VALUES (?, ?, ?, ?)"
  ).run(id, actualAmount, redeemedBy || "", notes || "");
  return { ...cert, balance: newBalance, status: newStatus };
}

function getRedemptionHistory(certificateId) {
  return db.prepare(
    "SELECT * FROM gift_certificate_redemptions WHERE certificate_id = ? ORDER BY redeemed_at DESC"
  ).all(certificateId);
}

function getAllRedemptions() {
  return db.prepare(`
    SELECT r.*, gc.code, gc.purchaser_name, gc.recipient_name
    FROM gift_certificate_redemptions r
    JOIN gift_certificates gc ON gc.id = r.certificate_id
    ORDER BY r.redeemed_at DESC
  `).all();
}

/* =========================================================================
   Discount Codes (Partnerships, Promos)
   ========================================================================= */

function getAllDiscountCodes() {
  return db.prepare("SELECT * FROM discount_codes ORDER BY created_at DESC").all();
}

function getActiveDiscountCodes() {
  return db.prepare("SELECT * FROM discount_codes WHERE active = 1 ORDER BY name").all();
}

function getDiscountCodeByCode(code) {
  return db.prepare("SELECT * FROM discount_codes WHERE code = ? AND active = 1").get(code.trim().toUpperCase());
}

function getDiscountCodeById(id) {
  return db.prepare("SELECT * FROM discount_codes WHERE id = ?").get(id);
}

function addDiscountCode(code, name, type, value, description) {
  return db.prepare(
    "INSERT INTO discount_codes (code, name, type, value, description) VALUES (?, ?, ?, ?, ?)"
  ).run(code.trim().toUpperCase(), name, type || "percent", value, description || "");
}

function updateDiscountCode(id, code, name, type, value, description) {
  db.prepare(
    "UPDATE discount_codes SET code = ?, name = ?, type = ?, value = ?, description = ? WHERE id = ?"
  ).run(code.trim().toUpperCase(), name, type || "percent", value, description || "", id);
}

function toggleDiscountCode(id) {
  db.prepare("UPDATE discount_codes SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ?").run(id);
}

function deleteDiscountCode(id) {
  db.prepare("DELETE FROM discount_codes WHERE id = ?").run(id);
}

function incrementDiscountUse(id) {
  db.prepare("UPDATE discount_codes SET uses = uses + 1 WHERE id = ?").run(id);
}

/* =========================================================================
   Reviews / Testimonials
   ========================================================================= */

function addReview(clientName, rating, text, therapistId) {
  return db.prepare(
    "INSERT INTO reviews (client_name, rating, text, therapist_id) VALUES (?, ?, ?, ?)"
  ).run(clientName, rating || 5, text || "", therapistId || null);
}

function getApprovedReviews() {
  return db.prepare(`
    SELECT r.*, t.name AS therapist_name
    FROM reviews r LEFT JOIN therapists t ON r.therapist_id = t.id
    WHERE r.approved = 1 ORDER BY r.featured DESC, r.created_at DESC
  `).all();
}

function getAllReviews() {
  return db.prepare(`
    SELECT r.*, t.name AS therapist_name
    FROM reviews r LEFT JOIN therapists t ON r.therapist_id = t.id
    ORDER BY r.created_at DESC
  `).all();
}

function approveReview(id) {
  db.prepare("UPDATE reviews SET approved = 1 WHERE id = ?").run(id);
}

function toggleReviewFeatured(id) {
  db.prepare("UPDATE reviews SET featured = CASE WHEN featured = 1 THEN 0 ELSE 1 END WHERE id = ?").run(id);
}

function deleteReview(id) {
  db.prepare("DELETE FROM reviews WHERE id = ?").run(id);
}

/* =========================================================================
   Gallery
   ========================================================================= */

function addGalleryImage(filename, caption, sortOrder) {
  return db.prepare("INSERT INTO gallery_images (filename, caption, sort_order) VALUES (?, ?, ?)").run(filename, caption || "", sortOrder || 0);
}

function getActiveGalleryImages() {
  return db.prepare("SELECT * FROM gallery_images WHERE active = 1 ORDER BY sort_order, id").all();
}

function getAllGalleryImages() {
  return db.prepare("SELECT * FROM gallery_images ORDER BY sort_order, id").all();
}

function deleteGalleryImage(id) {
  db.prepare("DELETE FROM gallery_images WHERE id = ?").run(id);
}

/* =========================================================================
   Client Profiles (phone-based)
   ========================================================================= */

function cleanPhone(phone) {
  return (phone || "").replace(/[\s\-\(\)\.]/g, "");
}

function getClientByPhone(phone) {
  if (!phone) return null;
  const cleaned = cleanPhone(phone);
  return db.prepare(`
    SELECT * FROM clients
    WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '.', '') = ?
  `).get(cleaned);
}

function getClientById(id) {
  return db.prepare("SELECT * FROM clients WHERE id = ?").get(id);
}

function upsertClient(phone, name, email) {
  if (!phone) return null;
  const existing = getClientByPhone(phone);
  if (existing) {
    // Update name/email only if they're actually provided and current ones are empty
    const updates = [];
    const params = [];
    if (name && !existing.name) { updates.push("name = ?"); params.push(name); }
    if (email && !existing.email) { updates.push("email = ?"); params.push(email); }
    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      params.push(existing.id);
      db.prepare("UPDATE clients SET " + updates.join(", ") + " WHERE id = ?").run(...params);
    }
    return existing;
  }
  // Create new client
  return db.prepare(
    "INSERT INTO clients (phone, name, email) VALUES (?, ?, ?)"
  ).run(phone, name || "", email || "");
}

function updateClientIntake(phone, data) {
  if (!phone) return;
  const client = getClientByPhone(phone);
  if (!client) {
    // Create client first
    db.prepare("INSERT INTO clients (phone, name) VALUES (?, '')").run(phone);
  }
  db.prepare(`
    UPDATE clients SET
      name = ?, email = ?, birthday = ?, address = ?,
      emergency_name = ?, emergency_phone = ?,
      health_conditions = ?, allergies = ?, medications = ?,
      pressure_pref = ?, areas_to_avoid = ?, areas_to_focus = ?,
      pregnancy = ?, consent_signed = ?, consent_date = ?,
      notes = ?, intake_complete = 1, updated_at = datetime('now')
    WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '.', '') = ?
  `).run(
    data.name || "", data.email || "", data.birthday || "", data.address || "",
    data.emergency_name || "", data.emergency_phone || "",
    data.health_conditions || "", data.allergies || "", data.medications || "",
    data.pressure_pref || "", data.areas_to_avoid || "", data.areas_to_focus || "",
    data.pregnancy ? 1 : 0, 1, new Date().toISOString().slice(0, 10),
    data.notes || "", cleanPhone(phone)
  );
}

function getAllClients() {
  return db.prepare("SELECT * FROM clients ORDER BY updated_at DESC").all();
}

/* =========================================================================
   Client Lookup (from bookings — legacy)
   ========================================================================= */

function searchClients(query) {
  const like = "%" + query + "%";
  return db.prepare(`
    SELECT client_name, client_phone, client_email, COUNT(*) AS visit_count,
           MAX(date) AS last_visit, SUM(CASE WHEN status='completed' THEN tip_amount ELSE 0 END) AS total_tips
    FROM bookings
    WHERE client_name LIKE ? OR client_phone LIKE ? OR client_email LIKE ?
    GROUP BY client_phone
    ORDER BY last_visit DESC
    LIMIT 50
  `).all(like, like, like);
}

function getClientHistory(phone) {
  return db.prepare(`
    SELECT b.*, s.name AS service_name, t.name AS therapist_name
    FROM bookings b
    LEFT JOIN services s ON b.service_id = s.id
    LEFT JOIN therapists t ON b.therapist_id = t.id
    WHERE b.client_phone = ?
    ORDER BY b.date DESC, b.time DESC
    LIMIT 100
  `).all(phone);
}

/* =========================================================================
   Reports / Analytics
   ========================================================================= */

function getRevenueReport(startDate, endDate) {
  return db.prepare(`
    SELECT date, COUNT(*) AS bookings, SUM(s.price) AS revenue, SUM(b.tip_amount) AS tips
    FROM bookings b LEFT JOIN services s ON b.service_id = s.id
    WHERE b.status = 'completed' AND b.date BETWEEN ? AND ?
    GROUP BY b.date ORDER BY b.date
  `).all(startDate, endDate);
}

function getPopularServices(startDate, endDate) {
  return db.prepare(`
    SELECT s.name, COUNT(*) AS count, SUM(s.price) AS revenue
    FROM bookings b LEFT JOIN services s ON b.service_id = s.id
    WHERE b.status IN ('confirmed','completed') AND b.date BETWEEN ? AND ?
    GROUP BY b.service_id ORDER BY count DESC
  `).all(startDate, endDate);
}

function getTherapistPerformance(startDate, endDate) {
  return db.prepare(`
    SELECT t.name, COUNT(*) AS count, SUM(CASE WHEN b.status='completed' THEN s.price ELSE 0 END) AS revenue,
           SUM(CASE WHEN b.status='completed' THEN b.tip_amount ELSE 0 END) AS tips
    FROM bookings b
    LEFT JOIN services s ON b.service_id = s.id
    LEFT JOIN therapists t ON b.therapist_id = t.id
    WHERE b.date BETWEEN ? AND ? AND b.status IN ('confirmed','completed')
    GROUP BY b.therapist_id ORDER BY count DESC
  `).all(startDate, endDate);
}

function getBusiestTimes(startDate, endDate) {
  return db.prepare(`
    SELECT substr(time, 1, 2) AS hour, COUNT(*) AS count
    FROM bookings WHERE status IN ('confirmed','completed') AND date BETWEEN ? AND ?
    GROUP BY hour ORDER BY count DESC
  `).all(startDate, endDate);
}

function getBusiestDays(startDate, endDate) {
  return db.prepare(`
    SELECT CASE cast(strftime('%w', date) AS integer)
      WHEN 0 THEN 'Sunday' WHEN 1 THEN 'Monday' WHEN 2 THEN 'Tuesday'
      WHEN 3 THEN 'Wednesday' WHEN 4 THEN 'Thursday' WHEN 5 THEN 'Friday'
      WHEN 6 THEN 'Saturday' END AS day_name,
      COUNT(*) AS count
    FROM bookings WHERE status IN ('confirmed','completed') AND date BETWEEN ? AND ?
    GROUP BY strftime('%w', date) ORDER BY count DESC
  `).all(startDate, endDate);
}

function getBookingByToken(token) {
  if (!token) return null;
  return db.prepare(`
    SELECT b.*, s.name AS service_name, t.name AS therapist_name, t2.name AS therapist2_name
    FROM bookings b
    LEFT JOIN services s ON b.service_id = s.id
    LEFT JOIN therapists t ON b.therapist_id = t.id
    LEFT JOIN therapists t2 ON b.therapist2_id = t2.id
    WHERE b.cancel_token = ?
  `).get(token);
}

function rescheduleBooking(id, newDate, newTime) {
  db.prepare("UPDATE bookings SET date = ?, time = ? WHERE id = ?").run(newDate, newTime, id);
}

function markReminderSent(id) {
  db.prepare("UPDATE bookings SET reminder_sent = 1 WHERE id = ?").run(id);
}

/* =========================================================================
   Membership Plans & Members
   ========================================================================= */

// Plans CRUD
function getActiveMembershipPlans() {
  return db.prepare("SELECT * FROM membership_plans WHERE active = 1 ORDER BY monthly_price ASC").all();
}

function getAllMembershipPlans() {
  return db.prepare("SELECT * FROM membership_plans ORDER BY monthly_price ASC").all();
}

function getMembershipPlanById(id) {
  return db.prepare("SELECT * FROM membership_plans WHERE id = ?").get(id);
}

function addMembershipPlan(name, description, monthlyPrice, visitsPerMonth, discountPercent, includedServiceIds, addonCredits, guestPasses) {
  return db.prepare(
    "INSERT INTO membership_plans (name, description, monthly_price, visits_per_month, discount_percent, included_service_ids, addon_credits, guest_passes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(name, description || "", monthlyPrice, visitsPerMonth || 1, discountPercent || 0, includedServiceIds || "", addonCredits || 0, guestPasses || 0);
}

function updateMembershipPlan(id, name, description, monthlyPrice, visitsPerMonth, discountPercent, includedServiceIds, addonCredits, guestPasses) {
  db.prepare(
    "UPDATE membership_plans SET name = ?, description = ?, monthly_price = ?, visits_per_month = ?, discount_percent = ?, included_service_ids = ?, addon_credits = ?, guest_passes = ? WHERE id = ?"
  ).run(name, description || "", monthlyPrice, visitsPerMonth || 1, discountPercent || 0, includedServiceIds || "", addonCredits || 0, guestPasses || 0, id);
}

function toggleMembershipPlan(id) {
  db.prepare("UPDATE membership_plans SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ?").run(id);
}

function deleteMembershipPlan(id) {
  db.prepare("DELETE FROM membership_plans WHERE id = ?").run(id);
}

// Members CRUD
function getAllMembers() {
  return db.prepare(`
    SELECT m.*, mp.name AS plan_name, mp.monthly_price, mp.visits_per_month
    FROM members m
    LEFT JOIN membership_plans mp ON m.plan_id = mp.id
    ORDER BY m.status ASC, m.client_name ASC
  `).all();
}

function getActiveMembers() {
  return db.prepare(`
    SELECT m.*, mp.name AS plan_name, mp.monthly_price, mp.visits_per_month, mp.discount_percent
    FROM members m
    LEFT JOIN membership_plans mp ON m.plan_id = mp.id
    WHERE m.status = 'active'
    ORDER BY m.client_name ASC
  `).all();
}

function getMemberById(id) {
  return db.prepare(`
    SELECT m.*, mp.name AS plan_name, mp.monthly_price, mp.visits_per_month, mp.discount_percent,
           mp.addon_credits, mp.guest_passes, mp.included_service_ids
    FROM members m
    LEFT JOIN membership_plans mp ON m.plan_id = mp.id
    WHERE m.id = ?
  `).get(id);
}

function getMemberByPhone(phone) {
  if (!phone) return null;
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, "");
  return db.prepare(`
    SELECT m.*, mp.name AS plan_name, mp.monthly_price, mp.visits_per_month, mp.discount_percent,
           mp.addon_credits, mp.guest_passes
    FROM members m
    LEFT JOIN membership_plans mp ON m.plan_id = mp.id
    WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(m.client_phone, ' ', ''), '-', ''), '(', ''), ')', ''), '.', '') = ?
    AND m.status = 'active'
  `).get(cleaned);
}

function addMember(clientName, clientPhone, clientEmail, planId, startDate, squareSubscriptionId, notes) {
  const plan = getMembershipPlanById(planId);
  return db.prepare(
    `INSERT INTO members (client_name, client_phone, client_email, plan_id, start_date, next_billing,
     visits_remaining, addon_credits_remaining, guest_passes_remaining, square_subscription_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    clientName, clientPhone, clientEmail || "", planId, startDate,
    startDate, // next_billing starts same as start
    plan ? plan.visits_per_month : 1,
    plan ? plan.addon_credits : 0,
    plan ? plan.guest_passes : 0,
    squareSubscriptionId || "", notes || ""
  );
}

function updateMember(id, clientName, clientPhone, clientEmail, planId, status, notes) {
  db.prepare(
    "UPDATE members SET client_name = ?, client_phone = ?, client_email = ?, plan_id = ?, status = ?, notes = ? WHERE id = ?"
  ).run(clientName, clientPhone, clientEmail || "", planId, status || "active", notes || "", id);
}

function renewMemberVisits(id) {
  const member = getMemberById(id);
  if (!member) return;
  const plan = getMembershipPlanById(member.plan_id);
  if (!plan) return;
  db.prepare(
    "UPDATE members SET visits_remaining = ?, addon_credits_remaining = ?, guest_passes_remaining = ? WHERE id = ?"
  ).run(plan.visits_per_month, plan.addon_credits, plan.guest_passes, id);
}

function useMemberVisit(memberId, bookingId) {
  const member = getMemberById(memberId);
  if (!member || member.visits_remaining <= 0) return false;
  db.prepare("UPDATE members SET visits_remaining = visits_remaining - 1 WHERE id = ?").run(memberId);
  db.prepare("INSERT INTO member_visits (member_id, booking_id) VALUES (?, ?)").run(memberId, bookingId || null);
  return true;
}

function getMemberVisits(memberId) {
  return db.prepare("SELECT * FROM member_visits WHERE member_id = ? ORDER BY visit_date DESC").all(memberId);
}

function pauseMember(id) {
  db.prepare("UPDATE members SET status = 'paused' WHERE id = ?").run(id);
}

function cancelMember(id) {
  db.prepare("UPDATE members SET status = 'cancelled' WHERE id = ?").run(id);
}

function reactivateMember(id) {
  db.prepare("UPDATE members SET status = 'active' WHERE id = ?").run(id);
  renewMemberVisits(id);
}

/* =========================================================================
   Exports
   ========================================================================= */

module.exports = {
  db,
  getSetting, setSetting, getAllSettings,
  getActiveTherapists, getAllTherapists, getTherapistById, getTherapistByPin,
  addTherapist, updateTherapist, toggleTherapist, deleteTherapist, markTherapistDeparted, reactivateTherapist,
  getActiveServices, getAllServices, getServiceById,
  addService, updateService, toggleService, deleteService,
  getActiveAddons, getAllAddons, getAddonById, addAddon, updateAddon, toggleAddon, deleteAddon, getAddonsByIds,
  createBooking, getBookingsForDate, getUpcomingBookings,
  cancelBooking, completeBooking, noShowBooking, getBookingById, getAvailableSlots,
  getBookingByToken, rescheduleBooking, markReminderSent,
  getTherapistStatuses,
  getExpenses, addExpense, updateExpense, deleteExpense, getExpenseById, markExpensePaid, getExpenseTotals, getRecurringExpenseSummary, getTaxDeductibleSummary, getQuarterlyTaxSummary,
  resetTestData,
  getBookingStats, getDailySummary,
  // Waitlist
  addToWaitlist, getWaitlist, removeFromWaitlist, deleteWaitlistEntry,
  // Blocked times
  addBlockedTime, getBlockedTimes, deleteBlockedTime,
  // Gift certificates
  createGiftCertificate, getGiftCertificateByCode, getGiftCertificateById, getAllGiftCertificates, redeemGiftCertificate, markGiftCertificatePaid, getRedemptionHistory, getAllRedemptions,
  // Discount codes
  getAllDiscountCodes, getActiveDiscountCodes, getDiscountCodeByCode, getDiscountCodeById,
  addDiscountCode, updateDiscountCode, toggleDiscountCode, deleteDiscountCode, incrementDiscountUse,
  // Reviews
  addReview, getApprovedReviews, getAllReviews, approveReview, toggleReviewFeatured, deleteReview,
  // Gallery
  addGalleryImage, getActiveGalleryImages, getAllGalleryImages, deleteGalleryImage,
  // Clients
  searchClients, getClientHistory,
  getClientByPhone, getClientById, upsertClient, updateClientIntake, getAllClients,
  // Reports
  getRevenueReport, getPopularServices, getTherapistPerformance, getBusiestTimes, getBusiestDays,
  // Membership plans
  getActiveMembershipPlans, getAllMembershipPlans, getMembershipPlanById,
  addMembershipPlan, updateMembershipPlan, toggleMembershipPlan, deleteMembershipPlan,
  // Members
  getAllMembers, getActiveMembers, getMemberById, getMemberByPhone,
  addMember, updateMember, renewMemberVisits, useMemberVisit, getMemberVisits,
  pauseMember, cancelMember, reactivateMember,
  // Email signups & updates
  addEmailSignup, getEmailSignups, getEmailSignupCount,
  saveSentUpdate, getSentUpdates,
};
