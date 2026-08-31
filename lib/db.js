/**
 * J&M Serenity Spa — Database Layer (SQLite via better-sqlite3)
 * All tables, seed data, and query helpers.
 */

const path = require("path");
const crypto = require("crypto");
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

  CREATE TABLE IF NOT EXISTS expense_payments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id  INTEGER NOT NULL,
    amount      REAL NOT NULL,
    date        TEXT NOT NULL,
    method      TEXT DEFAULT '',
    paid_by     TEXT DEFAULT '',
    note        TEXT DEFAULT '',
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (expense_id) REFERENCES expenses(id)
  );

  CREATE TABLE IF NOT EXISTS documents (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT NOT NULL,
    category      TEXT DEFAULT 'General',
    filename      TEXT NOT NULL,
    original_name TEXT DEFAULT '',
    mime          TEXT DEFAULT '',
    size          INTEGER DEFAULT 0,
    notes         TEXT DEFAULT '',
    uploaded_at   TEXT DEFAULT (datetime('now'))
  );

  -- Vendors & accounts: utility accounts, suppliers, portals, support numbers.
  -- There is deliberately NO password column here. This file is plaintext
  -- SQLite on the shop's Pi behind one shared admin password, so storing vendor
  -- passwords would let a single compromised admin login open the electric
  -- company, the bank portal and every supplier account at once.
  -- password_location is a POINTER to the password manager that holds the real
  -- password (e.g. "Bitwarden — J&M Shared") and must never contain a password.
  CREATE TABLE IF NOT EXISTS vendors (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT NOT NULL,
    category          TEXT DEFAULT 'Other',
    what_for          TEXT DEFAULT '',
    account_number    TEXT DEFAULT '',
    website           TEXT DEFAULT '',
    login_username    TEXT DEFAULT '',
    password_location TEXT DEFAULT '',
    support_phone     TEXT DEFAULT '',
    support_email     TEXT DEFAULT '',
    cost              TEXT DEFAULT '',
    billing_cycle     TEXT DEFAULT '',
    renewal_date      TEXT DEFAULT '',
    notes             TEXT DEFAULT '',
    active            INTEGER DEFAULT 1,
    created_at        TEXT DEFAULT (datetime('now'))
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
// Blank means "follows the spa's own days/hours" — see getAvailableSlots.
// Never hardcode a schedule here: it silently goes stale when the spa's hours
// change and quietly makes therapists unbookable.
safeAddColumn("therapists", "work_days", "TEXT DEFAULT ''");   // 1=Mon..7=Sun
safeAddColumn("therapists", "start_time", "TEXT DEFAULT ''");
safeAddColumn("therapists", "end_time", "TEXT DEFAULT ''");
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
safeAddColumn("expenses", "auto_pay", "INTEGER DEFAULT 0");         // 1 = drafts automatically from the business account

// Vendors & accounts — columns added after the first version of the table.
// No password column is added here, by design: see the CREATE TABLE above.
safeAddColumn("vendors", "what_for", "TEXT DEFAULT ''");
safeAddColumn("vendors", "account_number", "TEXT DEFAULT ''");
safeAddColumn("vendors", "website", "TEXT DEFAULT ''");
safeAddColumn("vendors", "login_username", "TEXT DEFAULT ''");
safeAddColumn("vendors", "password_location", "TEXT DEFAULT ''"); // pointer only, never a password
safeAddColumn("vendors", "support_phone", "TEXT DEFAULT ''");
safeAddColumn("vendors", "support_email", "TEXT DEFAULT ''");
safeAddColumn("vendors", "cost", "TEXT DEFAULT ''");
safeAddColumn("vendors", "billing_cycle", "TEXT DEFAULT ''");
safeAddColumn("vendors", "renewal_date", "TEXT DEFAULT ''");
safeAddColumn("vendors", "notes", "TEXT DEFAULT ''");
safeAddColumn("vendors", "active", "INTEGER DEFAULT 1");

// Email subscriber unsubscribe tracking (CAN-SPAM)
safeAddColumn("email_signups", "unsubscribe_token", "TEXT DEFAULT ''");
safeAddColumn("email_signups", "status", "TEXT DEFAULT 'subscribed'"); // subscribed | unsubscribed
safeAddColumn("email_signups", "unsubscribed_at", "TEXT DEFAULT ''");
// Self check-in kiosk: when a customer taps "I'm here" for their appointment
safeAddColumn("bookings", "arrived_at", "TEXT DEFAULT ''");
// What the customer actually owed and actually paid. Without these the system
// could not represent a discount or a gift card that only partly covers the
// bill: completeBooking recorded a payment METHOD but never an AMOUNT, so
// revenue was always re-derived from the full service price.
safeAddColumn("bookings", "amount_charged", "REAL DEFAULT 0");   // after discount
safeAddColumn("bookings", "amount_paid", "REAL DEFAULT 0");      // actually collected
safeAddColumn("bookings", "discount_amount", "REAL DEFAULT 0");

// The price the customer was QUOTED, locked at booking time. Without this,
// editing a service price silently reprices every existing unpaid booking.
safeAddColumn("bookings", "quoted_price", "REAL DEFAULT 0");

// How the tip was given. Therapists are 1099 and keep 100% of tips — but a
// CASH tip is already in their pocket, while a CARD tip was collected by the
// business and is owed to them. Payout only pays out card tips.
safeAddColumn("bookings", "tip_method", "TEXT DEFAULT ''");   // 'cash' | 'card'

// Therapist compensation. The house model is a 50/50 split of the service
// (the therapist's half; the other half covers the room and supplies, in the
// manner of a booth rental). Per-therapist so it can differ by agreement.
safeAddColumn("therapists", "commission_percent", "REAL DEFAULT 50");

// Housing. The spa rents accommodation to therapists and recovers it from the
// weekly payout. A COUPLE sharing a unit is $800/month for the pair; a single
// person is $450/month. Stored per therapist as the amount THAT PERSON is
// charged, so a couple is $400 each and the pair still totals $800. The rates
// live in settings so they can change without touching code.
safeAddColumn("therapists", "housing_status", "TEXT DEFAULT 'none'");   // none | single | couple
safeAddColumn("therapists", "housing_rent_monthly", "REAL DEFAULT 0");
safeAddColumn("payouts", "rent_deducted", "REAL DEFAULT 0");

// Scanned receipts waiting to be filed. The scanner drops a file in a watched
// folder; it is ingested here as "unfiled" and appears in a queue where a
// human gives it a category and a total. Deliberately NO OCR or AI — the
// person filing it can read the paper faster than a model can, and it costs
// nothing.
db.exec(`
  CREATE TABLE IF NOT EXISTS scanned_receipts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    filename      TEXT NOT NULL UNIQUE,   -- stored name in private_uploads/receipts
    original_name TEXT DEFAULT '',        -- what the scanner called it
    mime          TEXT DEFAULT '',
    size          INTEGER DEFAULT 0,
    status        TEXT DEFAULT 'unfiled', -- unfiled | filed | ignored
    expense_id    INTEGER,                -- set when filed against an expense
    scanned_at    TEXT DEFAULT (datetime('now')),
    filed_at      TEXT DEFAULT ''
  );
`);

// Per-therapist price overrides. Sparse: a row exists ONLY where a therapist
// charges something other than the menu price. No row = the menu price. The
// public menu is never affected.
db.exec(`
  CREATE TABLE IF NOT EXISTS therapist_service_prices (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    therapist_id  INTEGER NOT NULL,
    service_id    INTEGER NOT NULL,
    price         REAL NOT NULL,
    created_at    TEXT DEFAULT (datetime('now')),
    UNIQUE(therapist_id, service_id)
  );
  CREATE TABLE IF NOT EXISTS payouts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    therapist_id   INTEGER NOT NULL,
    period_start   TEXT NOT NULL,
    period_end     TEXT NOT NULL,
    sessions       INTEGER DEFAULT 0,
    service_total  REAL DEFAULT 0,   -- collected for their services
    service_share  REAL DEFAULT 0,   -- their half
    card_tips      REAL DEFAULT 0,   -- owed
    cash_tips      REAL DEFAULT 0,   -- already taken, recorded for the record only
    total_paid     REAL DEFAULT 0,   -- service_share + card_tips
    notes          TEXT DEFAULT '',
    paid_at        TEXT DEFAULT (datetime('now')),
    paid_by        TEXT DEFAULT ''
  );
`);

// Backfill unsubscribe tokens for any existing subscribers that lack one
(function backfillUnsubTokens() {
  try {
    const rows = db.prepare("SELECT id FROM email_signups WHERE unsubscribe_token IS NULL OR unsubscribe_token = ''").all();
    const upd = db.prepare("UPDATE email_signups SET unsubscribe_token = ? WHERE id = ?");
    for (const r of rows) upd.run(crypto.randomBytes(16).toString("hex"), r.id);
  } catch (e) { /* table may not exist yet on first run */ }
})();

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
    housing_rate_single: "450",
    housing_rate_couple: "800",
    slot_interval: "30",
    full_body_rooms: "6",
    chair_stations: "4",
    foot_chairs: "4",
    couples_rooms: "5,6",
    water_head_tables: "3",
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
  ).run(name, gender || "female", specialties || "", serviceIds || "", photo || "", bio || "", workDays || "", startTime || "", endTime || "", pin || "");
}

function updateTherapist(id, name, gender, specialties, serviceIds, photo, bio, workDays, startTime, endTime, pin) {
  db.prepare(
    "UPDATE therapists SET name = ?, gender = ?, specialties = ?, service_ids = ?, photo = ?, bio = ?, work_days = ?, start_time = ?, end_time = ?, pin = ? WHERE id = ?"
  ).run(name, gender || "female", specialties || "", serviceIds || "", photo || "", bio || "", workDays || "", startTime || "", endTime || "", pin || "", id);
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

function createBooking({ clientName, clientPhone, clientEmail, serviceId, therapistId, therapist2Id, genderPref, notes, areas, date, time, duration, source, addonIds, cancelToken, recurringId, quotedPrice }) {
  // quotedPrice locks in what the customer was actually shown — a therapist's
  // own rate if they chose one, otherwise the menu price. Falls back to the
  // current menu price so callers that don't pass it still record something.
  let quoted = Number(quotedPrice);
  if (!quoted || quoted <= 0) {
    const svc = getServiceById(serviceId);
    quoted = svc ? Number(svc.price) || 0 : 0;
  }
  return db.prepare(`
    INSERT INTO bookings (client_name, client_phone, client_email, service_id, therapist_id, therapist2_id, gender_pref, notes, areas, date, time, duration, source, addon_ids, cancel_token, recurring_id, quoted_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    clientName, clientPhone, clientEmail || "", serviceId,
    therapistId || null, therapist2Id || null, genderPref || "",
    notes || "", areas || "", date, time, duration, source || "online",
    addonIds || "", cancelToken || "", recurringId || "", quoted
  );
}

/**
 * Health flags for a booking's client, for the therapist about to work on them.
 * Deliberately returns FLAGS, not prose: the prep board is a screen in the
 * employee room, and the people reading it do not read English fluently. What a
 * therapist needs before they touch someone is "pregnant", "allergy", "avoid
 * this area" — the detail is on the client record at the desk if they need it.
 * Returns null when there is no intake on file.
 */
function getClientHealthFlags(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 7) return null;
  const c = db.prepare(
    "SELECT health_conditions, allergies, medications, pregnancy, pressure_pref, " +
    "areas_to_avoid, areas_to_focus, intake_complete FROM clients WHERE REPLACE(REPLACE(REPLACE(REPLACE(phone,'-',''),' ',''),'(',''),')','') LIKE ?"
  ).get("%" + digits.slice(-10));
  if (!c) return null;
  const has = (v) => !!(v && String(v).trim());
  return {
    pregnant: !!c.pregnancy,
    allergies: has(c.allergies) ? String(c.allergies).trim() : "",
    medications: has(c.medications) ? String(c.medications).trim() : "",
    conditions: has(c.health_conditions) ? String(c.health_conditions).trim() : "",
    avoid: has(c.areas_to_avoid) ? String(c.areas_to_avoid).trim() : "",
    focus: has(c.areas_to_focus) ? String(c.areas_to_focus).trim() : "",
    pressure: has(c.pressure_pref) ? String(c.pressure_pref).trim() : "",
    intakeComplete: !!c.intake_complete,
    // Anything the therapist must know BEFORE starting.
    get hasWarning() {
      return this.pregnant || !!this.allergies || !!this.conditions || !!this.avoid;
    },
  };
}

function getBookingsForDate(date) {
  return db.prepare(`
    SELECT b.*, s.name AS service_name, s.price AS service_price, s.category AS service_category,
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
  const _n = new Date();
  const today = _n.getFullYear() + "-" + String(_n.getMonth() + 1).padStart(2, "0") +
    "-" + String(_n.getDate()).padStart(2, "0");
  return db.prepare(`
    SELECT b.*, s.name AS service_name, s.price AS service_price,
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

function completeBooking(id, paymentMethod, tipAmount, completedBy, money) {
  const m = money || {};
  db.prepare(
    "UPDATE bookings SET status = 'completed', payment_method = ?, tip_amount = ?, completed_by = ?, " +
    "amount_charged = ?, amount_paid = ?, discount_amount = ?, tip_method = ?, " +
    "quoted_price = CASE WHEN quoted_price > 0 THEN quoted_price ELSE ? END WHERE id = ?"
  ).run(
    paymentMethod || "", tipAmount || 0, completedBy || "",
    Number(m.charged) || 0, Number(m.paid) || 0, Number(m.discount) || 0,
    m.tipMethod || "", Number(m.quoted) || 0,
    id
  );
}

/**
 * What a booking actually costs: service + add-ons, less a VALID discount.
 * Returns { service, addonTotal, subtotal, discount, total, discountRow }.
 * A discount code only counts when it is active, in date, and under its use
 * limit — previously any string that matched a row was accepted, and even then
 * it only bumped a counter without reducing what the customer paid.
 */
/* =========================================================================
   Therapist pricing + payout
   ========================================================================= */

/** Price this therapist charges for this service — their override, or the menu. */
function priceForTherapist(serviceId, therapistId) {
  const svc = getServiceById(serviceId);
  const base = svc ? Number(svc.price) || 0 : 0;
  if (!therapistId) return base;
  const row = db.prepare(
    "SELECT price FROM therapist_service_prices WHERE therapist_id = ? AND service_id = ?"
  ).get(Number(therapistId), Number(serviceId));
  return row && Number(row.price) > 0 ? Number(row.price) : base;
}

function setTherapistPay(therapistId, commissionPercent, housingStatus, rentMonthly) {
  const pct = Number(commissionPercent);
  const rent = Number(rentMonthly);
  db.prepare(
    "UPDATE therapists SET commission_percent = ?, housing_status = ?, housing_rent_monthly = ? WHERE id = ?"
  ).run(
    isNaN(pct) ? 50 : Math.max(0, Math.min(100, pct)),
    ["none", "single", "couple"].indexOf(String(housingStatus)) > -1 ? housingStatus : "none",
    isNaN(rent) || rent < 0 ? 0 : rent,
    therapistId
  );
}

/** All overrides as { therapistId: { serviceId: price } } — for the booking page. */
function getAllTherapistPrices() {
  const rows = db.prepare("SELECT therapist_id, service_id, price FROM therapist_service_prices").all();
  const map = {};
  rows.forEach((r) => {
    if (!map[r.therapist_id]) map[r.therapist_id] = {};
    map[r.therapist_id][r.service_id] = Number(r.price);
  });
  return map;
}

function getTherapistPrices(therapistId) {
  return db.prepare(
    "SELECT tsp.*, s.name AS service_name, s.price AS base_price, s.duration " +
    "FROM therapist_service_prices tsp JOIN services s ON s.id = tsp.service_id " +
    "WHERE tsp.therapist_id = ? ORDER BY s.name"
  ).all(therapistId);
}

function setTherapistPrice(therapistId, serviceId, price) {
  const p = Number(price);
  if (!therapistId || !serviceId) return;
  if (!p || p <= 0) {
    db.prepare("DELETE FROM therapist_service_prices WHERE therapist_id = ? AND service_id = ?")
      .run(therapistId, serviceId);
    return;
  }
  db.prepare(
    "INSERT INTO therapist_service_prices (therapist_id, service_id, price) VALUES (?, ?, ?) " +
    "ON CONFLICT(therapist_id, service_id) DO UPDATE SET price = excluded.price"
  ).run(therapistId, serviceId, p);
}

/**
 * What a therapist is owed for a period.
 *
 * The arrangement: 1099 contractors who keep 100% of tips and split the
 * service revenue with the house (default 50/50 — the house half covers the
 * room and supplies, like a booth rental).
 *
 * The distinction that matters at payout time: a CASH tip is already in the
 * therapist's pocket and is only reported here for the record. A CARD tip was
 * collected by the business and is genuinely OWED. Only card tips are paid.
 */
/* ---- Scanned receipts ------------------------------------------------- */

function addScannedReceipt(r) {
  try {
    return db.prepare(
      "INSERT INTO scanned_receipts (filename, original_name, mime, size) VALUES (?, ?, ?, ?)"
    ).run(r.filename, r.originalName || "", r.mime || "", r.size || 0);
  } catch (e) {
    // UNIQUE on filename — already ingested, which is normal if the watcher
    // sees the same file twice. Not an error worth surfacing.
    if (String(e.message).includes("UNIQUE")) return null;
    throw e;
  }
}

function getScannedReceipts(status) {
  const where = status ? "WHERE r.status = ?" : "";
  const sql =
    "SELECT r.*, e.description AS expense_description, e.amount AS expense_amount " +
    "FROM scanned_receipts r LEFT JOIN expenses e ON e.id = r.expense_id " +
    where + " ORDER BY r.scanned_at DESC";
  return status ? db.prepare(sql).all(status) : db.prepare(sql).all();
}

function getScannedReceiptById(id) {
  return db.prepare("SELECT * FROM scanned_receipts WHERE id = ?").get(id);
}

function countUnfiledReceipts() {
  const r = db.prepare("SELECT COUNT(*) AS n FROM scanned_receipts WHERE status = 'unfiled'").get();
  return r ? r.n : 0;
}

/** Attach a scanned receipt to an expense and mark it filed. */
function fileScannedReceipt(receiptId, expenseId) {
  const r = getScannedReceiptById(receiptId);
  if (!r) return null;
  db.prepare(
    "UPDATE scanned_receipts SET status = 'filed', expense_id = ?, filed_at = datetime('now') WHERE id = ?"
  ).run(expenseId, receiptId);
  // Point the expense at the same file so the existing "View Receipt" link works.
  db.prepare("UPDATE expenses SET receipt_file = ? WHERE id = ?")
    .run("/admin/receipts/" + r.filename, expenseId);
  return r;
}

function ignoreScannedReceipt(id) {
  db.prepare("UPDATE scanned_receipts SET status = 'ignored', filed_at = datetime('now') WHERE id = ?").run(id);
}

function unfileScannedReceipt(id) {
  const r = getScannedReceiptById(id);
  if (r && r.expense_id) {
    db.prepare("UPDATE expenses SET receipt_file = '' WHERE id = ?").run(r.expense_id);
  }
  db.prepare("UPDATE scanned_receipts SET status = 'unfiled', expense_id = NULL, filed_at = '' WHERE id = ?").run(id);
}

function getPayoutSummary(therapistId, startDate, endDate) {
  const t = db.prepare("SELECT * FROM therapists WHERE id = ?").get(therapistId);
  if (!t) return null;
  const pct = Number(t.commission_percent);
  const share = isNaN(pct) ? 50 : pct;

  // Count a booking for a therapist if they were EITHER pair of hands. On a
  // two-therapist service the service value is split between them, so nobody
  // is invisible and nobody is paid twice for the same session.
  const rows = db.prepare(`
    SELECT b.id, b.date, b.time, b.client_name, b.tip_amount, b.tip_method,
           b.payment_method, b.amount_charged, b.quoted_price,
           b.therapist_id, b.therapist2_id,
           s.name AS service_name, s.price AS service_price
    FROM bookings b
    LEFT JOIN services s ON s.id = b.service_id
    WHERE b.status = 'completed'
      AND b.date >= ? AND b.date <= ?
      AND (b.therapist_id = ? OR b.therapist2_id = ?)
    ORDER BY b.date, b.time
  `).all(startDate, endDate, therapistId, therapistId);

  let serviceTotal = 0, cardTips = 0, cashTips = 0;
  const lines = rows.map((r) => {
    const gross = Number(r.amount_charged) > 0
      ? Number(r.amount_charged)
      : (Number(r.quoted_price) > 0 ? Number(r.quoted_price) : Number(r.service_price) || 0);
    const hands = r.therapist2_id ? 2 : 1;          // split two-therapist services
    const mine = gross / hands;
    serviceTotal += mine;

    const tip = Number(r.tip_amount) || 0;
    // Tip method falls back to the payment method: a card sale's tip is a card
    // tip unless someone recorded otherwise.
    const method = (r.tip_method || "").toLowerCase() ||
      ((r.payment_method || "").toLowerCase().includes("cash") ? "cash" : "card");
    const myTip = tip / hands;
    if (method === "cash") cashTips += myTip; else cardTips += myTip;

    return {
      date: r.date, time: r.time, client: r.client_name, service: r.service_name,
      gross, hands, mine, tip: myTip, tipMethod: method,
    };
  });

  const round = (n) => Math.round(n * 100) / 100;
  const serviceShare = round(serviceTotal * (share / 100));

  // Housing rent for the days actually in this period. Monthly rent is
  // annualised then apportioned per day, so any period length works and a
  // 7-day week is not assumed to be exactly a quarter of a month.
  const rentMonthly = Number(t.housing_rent_monthly) || 0;
  const periodDays = (function () {
    const a = String(startDate).split("-").map(Number);
    const b = String(endDate).split("-").map(Number);
    if (!a[0] || !b[0]) return 7;
    const d1 = new Date(a[0], a[1] - 1, a[2], 12);
    const d2 = new Date(b[0], b[1] - 1, b[2], 12);
    return Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
  })();
  const rentDeduction = round(rentMonthly * 12 / 365 * periodDays);

  return {
    therapist: t,
    startDate, endDate,
    commissionPercent: share,
    sessions: rows.length,
    serviceTotal: round(serviceTotal),
    serviceShare,
    cardTips: round(cardTips),
    cashTips: round(cashTips),
    housingStatus: t.housing_status || "none",
    rentMonthly, periodDays, rentDeduction,
    totalOwed: round(serviceShare + cardTips - rentDeduction),
    lines,
  };
}

function recordPayout(p) {
  return db.prepare(
    "INSERT INTO payouts (therapist_id, period_start, period_end, sessions, service_total, " +
    "service_share, card_tips, cash_tips, rent_deducted, total_paid, notes, paid_by) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(p.therapistId, p.startDate, p.endDate, p.sessions || 0, p.serviceTotal || 0,
        p.serviceShare || 0, p.cardTips || 0, p.cashTips || 0, p.rentDeduction || 0,
        p.totalOwed || 0, p.notes || "", p.paidBy || "");
}

function getPayoutHistory(therapistId) {
  return therapistId
    ? db.prepare("SELECT * FROM payouts WHERE therapist_id = ? ORDER BY paid_at DESC").all(therapistId)
    : db.prepare("SELECT p.*, t.name AS therapist_name FROM payouts p LEFT JOIN therapists t ON t.id = p.therapist_id ORDER BY p.paid_at DESC LIMIT 100").all();
}

function quoteBooking(bookingId, discountCode) {
  const booking = getBookingById(bookingId);
  if (!booking) return null;
  const service = getServiceById(booking.service_id);
  // The price this customer was actually quoted wins over today's menu: it may
  // be a therapist's own rate, and the menu may have changed since they booked.
  const locked = Number(booking.quoted_price) || 0;
  const price = locked > 0
    ? locked
    : (service ? Number(service.price) || 0 : 0);

  let addonTotal = 0;
  if (booking.addon_ids) {
    const ids = String(booking.addon_ids).split(",").map(Number).filter((n) => !isNaN(n));
    if (ids.length) addonTotal = getAddonsByIds(ids).reduce((sum, a) => sum + (Number(a.price) || 0), 0);
  }

  const subtotal = price + addonTotal;
  let discount = 0;
  let discountRow = null;

  const code = String(discountCode || "").trim();
  if (code) {
    const d = getDiscountCodeByCode(code);
    const today = localToday();
    const active = d && (d.active === undefined || d.active === 1);
    const notExpired = d && (!d.expires_at || String(d.expires_at) >= today);
    const underLimit =
      d && (!d.usage_limit || Number(d.usage_limit) <= 0 || Number(d.times_used || 0) < Number(d.usage_limit));
    if (d && active && notExpired && underLimit) {
      discountRow = d;
      discount = d.type === "percent"
        ? subtotal * (Number(d.value) || 0) / 100
        : Math.min(subtotal, Number(d.value) || 0);
    }
  }

  const total = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
  return {
    service, addonTotal, subtotal,
    discount: Math.round(discount * 100) / 100,
    total, discountRow,
  };
}

/** Local YYYY-MM-DD. toISOString() is UTC and rolls over in the evening here. */
function localToday() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
    "-" + String(d.getDate()).padStart(2, "0");
}

function noShowBooking(id) {
  db.prepare("UPDATE bookings SET status = 'no_show' WHERE id = ?").run(id);
}

function getBookingById(id) {
  return db.prepare(`
    SELECT b.*, s.name AS service_name, s.price AS service_price, s.category AS service_category,
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

/**
 * Day number for a "YYYY-MM-DD" date string in this app's convention
 * (1=Mon .. 6=Sat, 7=Sun) — the same numbering used by therapists.work_days
 * and settings.open_days.
 *
 * The Y/M/D parts are pulled out by hand on purpose. new Date("2026-08-16")
 * is parsed as UTC midnight, so .getDay() reads it back in local time and
 * reports the PREVIOUS day everywhere west of Greenwich (the spa is in
 * America/Denver, UTC-6/-7). That would quietly shift every therapist's
 * schedule by one day. Building the date from parts keeps construction and
 * read-back both local, so the offset cancels out; noon is used rather than
 * midnight so no daylight-saving jump can land on the boundary.
 *
 * Returns null when the string is not a plain calendar date — callers treat
 * that as "day unknown" and skip the day check rather than blanking the day.
 */
function dayNumberForDate(date) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(date || "").trim());
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const local = new Date(y, mo - 1, d, 12, 0, 0);
  // Reject rolled-over dates like 2026-02-31
  if (local.getFullYear() !== y || local.getMonth() !== mo - 1 || local.getDate() !== d) return null;
  const js = local.getDay();          // 0=Sun .. 6=Sat
  return js === 0 ? 7 : js;           // app convention: Sunday is 7
}

/**
 * "HH:MM" -> minutes past midnight. Returns null when missing or unparseable
 * so the caller can fall back to shop hours instead of blocking the therapist.
 */
function timeToMinutes(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value == null ? "" : value).trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (isNaN(h) || isNaN(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Parse a work_days list ("1,2,3,4,5,6") into day numbers, accepting 0 as an
 * alias for Sunday. Returns null when nothing usable is stored — that means
 * "no schedule recorded", and the caller treats it as working EVERY day. A
 * blank column must never be read as "works no days" or the calendar empties.
 */
function parseWorkDays(value) {
  const nums = String(value == null ? "" : value)
    .split(",")
    .map(function(part) { return parseInt(part, 10); })
    .filter(function(n) { return !isNaN(n) && n >= 0 && n <= 7; })
    .map(function(n) { return n === 0 ? 7 : n; });
  return nums.length ? nums : null;
}

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
    water_head: parseInt(settings.water_head_tables || "3", 10),
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

  const activeTherapists = getActiveTherapists();

  // Candidate pool when the customer did NOT name a therapist. A gender
  // preference narrows it; otherwise every active therapist is a candidate.
  let eligibleTherapists = null;
  if (!therapistId) {
    eligibleTherapists = genderPref
      ? activeTherapists.filter(function(t) { return t.gender === genderPref; })
      : activeTherapists.slice();
    if (eligibleTherapists.length === 0) return [];
  }

  const slots = [];
  const [openH, openM] = openTime.split(":").map(Number);
  const [closeH, closeM] = closeTime.split(":").map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  // Don't offer times that have already passed. Without this, someone browsing
  // at 7:30pm can pick today and be shown 9:00am as available — the booking is
  // accepted and a confirmation text goes out for an appointment that was this
  // morning. Also enforces a lead time so a booking can't land on staff with no
  // warning. Date parts are compared as strings to stay timezone-safe.
  const nowLocal = new Date();
  const todayStr =
    nowLocal.getFullYear() + "-" +
    String(nowLocal.getMonth() + 1).padStart(2, "0") + "-" +
    String(nowLocal.getDate()).padStart(2, "0");
  const leadMinutes = parseInt(settings.booking_lead_minutes || "60", 10);
  const earliestToday =
    date === todayStr
      ? nowLocal.getHours() * 60 + nowLocal.getMinutes() + (isNaN(leadMinutes) ? 60 : leadMinutes)
      : -1;

  // Therapist working schedules for this date. The shop is open 9-9 every day,
  // but nobody works a 12-hour day 7 days a week — shop hours alone are not
  // proof that anyone is on shift, so each therapist's own hours are resolved
  // once here and then checked per slot.
  //   - work_days missing/garbled -> works every day (never "no days")
  //   - start_time / end_time missing -> fall back to the shop's open/close
  const dayNumber = dayNumberForDate(date);
  const schedules = {};
  for (const t of activeTherapists) {
    const days = parseWorkDays(t.work_days);
    const startMin = timeToMinutes(t.start_time);
    const endMin = timeToMinutes(t.end_time);
    schedules[t.id] = {
      worksDay: !days || !dayNumber || days.indexOf(dayNumber) !== -1,
      start: startMin === null ? openMinutes : startMin,
      end: endMin === null ? closeMinutes : endMin,
    };
  }

  // On shift for the WHOLE service, not just its start time. Unknown or
  // inactive therapists are never on shift.
  function isWorking(id, slotStart, slotEnd) {
    const sch = schedules[id];
    if (!sch || !sch.worksDay) return false;
    return sch.start <= slotStart && sch.end >= slotEnd;
  }

  for (let m = openMinutes; m + serviceDuration <= closeMinutes; m += interval) {
    if (m < earliestToday) continue;   // already past (or inside the lead time)
    const slotStart = m;
    const slotEnd = m + serviceDuration;

    // A named therapist must actually be working this slot
    if (therapistId && !isWorking(parseInt(therapistId, 10), slotStart, slotEnd)) continue;
    if (therapist2Id && !isWorking(parseInt(therapist2Id, 10), slotStart, slotEnd)) continue;

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

    // Room capacity check. Rooms are therapist-independent, so this applies on
    // every path — naming a therapist must not let a 7th client into 6 rooms.
    const effCat = isFourHands ? "full_body" : serviceCategory;
    const maxCap = capacity[effCat] || capacity.full_body;
    if (roomConflicts >= maxCap) continue;

    // Staffing check — runs for EVERY request, including when a therapist was
    // named, because four hands still needs a second pair of hands.
    // (eligibleTherapists is null on the named-therapist path, so gate on the
    // active roster instead or this whole block would be skipped there.)
    if (activeTherapists.length) {
      const busyIds = new Set();
      // Bookings made with "no preference" store therapist_id NULL but still
      // consume a therapist in real life. Count those separately or the gate
      // over-reports free staff on the app's most common booking path.
      let unstaffed = 0;
      for (const bk of dayBookings) {
        const [bh2, bm2] = bk.time.split(":").map(Number);
        const bkS = bh2 * 60 + bm2;
        const bkE = bkS + bk.duration;
        if (slotStart < bkE && slotEnd > bkS) {
          if (bk.therapist_id) busyIds.add(bk.therapist_id);
          if (bk.therapist2_id) busyIds.add(bk.therapist2_id);
          const needs = bk.service_category === "four_hands" ? 2 : 1;
          const named = (bk.therapist_id ? 1 : 0) + (bk.therapist2_id ? 1 : 0);
          if (needs > named) unstaffed += needs - named;
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

      // A couples massage is two clients on two tables in one couples room — it
      // needs TWO therapists, same as four hands. Treating it as one was
      // overselling: two couples at 2pm with only two therapists free were both
      // accepted, and the shortfall surfaced with four people in the lobby.
      const needed = (isFourHands || serviceCategory === "couples") ? 2 : 1;
      if (therapistId) {
        // A named therapist already passed isWorking() and its own busy checks
        // above, so it counts as one. Four hands needs one more body on top.
        const namedIds = new Set([parseInt(therapistId, 10)]);
        if (therapist2Id) namedIds.add(parseInt(therapist2Id, 10));
        const othersFree = activeTherapists.filter(function(t) {
          return !namedIds.has(t.id) && !busyIds.has(t.id) &&
            isWorking(t.id, slotStart, slotEnd);
        }).length;
        if (namedIds.size + othersFree - unstaffed < needed) continue;
      } else {
        const freeCount = eligibleTherapists.filter(function(t) {
          return !busyIds.has(t.id) && isWorking(t.id, slotStart, slotEnd);
        }).length;
        if (freeCount - unstaffed < needed) continue;
      }
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
  const _n = new Date();
  const today = _n.getFullYear() + "-" + String(_n.getMonth() + 1).padStart(2, "0") +
    "-" + String(_n.getDate()).padStart(2, "0");
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
  // paid_to_date = sum of recorded partial payments against each expense
  let sql = "SELECT e.*, COALESCE((SELECT SUM(p.amount) FROM expense_payments p WHERE p.expense_id = e.id), 0) AS paid_to_date FROM expenses e WHERE 1=1";
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
    "INSERT INTO expenses (description, amount, category, date, frequency, is_startup, vendor, notes, payment_status, paid_by, due_to, due_date, receipt_file, tax_deductible, auto_pay) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    opts.description, opts.amount, opts.category, opts.date,
    opts.frequency || "one-time", opts.is_startup ? 1 : 0,
    opts.vendor || "", opts.notes || "",
    opts.payment_status || "paid", opts.paid_by || "",
    opts.due_to || "", opts.due_date || "",
    opts.receipt_file || "",
    opts.tax_deductible !== 0 ? 1 : 0,
    opts.auto_pay ? 1 : 0
  );
}

function updateExpense(id, data) {
  db.prepare(`
    UPDATE expenses SET description=?, amount=?, category=?, date=?, frequency=?, is_startup=?, vendor=?, notes=?, payment_status=?, paid_by=?, due_to=?, due_date=?, receipt_file=?, tax_deductible=?, auto_pay=?
    WHERE id=?
  `).run(
    data.description, data.amount, data.category, data.date,
    data.frequency || "one-time", data.is_startup ? 1 : 0,
    data.vendor || "", data.notes || "",
    data.payment_status || "paid", data.paid_by || "",
    data.due_to || "", data.due_date || "",
    data.receipt_file || "",
    data.tax_deductible !== 0 ? 1 : 0,
    data.auto_pay ? 1 : 0, id
  );
}

/* ---- Partial payments against an expense ---- */

function getExpensePaidTotal(expenseId) {
  const r = db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM expense_payments WHERE expense_id = ?").get(expenseId);
  return (r && r.total) || 0;
}

function getExpensePayments(expenseId) {
  return db.prepare("SELECT * FROM expense_payments WHERE expense_id = ? ORDER BY date ASC, id ASC").all(expenseId);
}

// Record a payment (installment) toward an expense. When the running total
// covers the expense amount, the expense is auto-marked fully paid.
function addExpensePayment(expenseId, opts) {
  const exp = db.prepare("SELECT * FROM expenses WHERE id = ?").get(expenseId);
  if (!exp) return null;
  const amount = parseFloat(opts.amount) || 0;
  if (amount <= 0) return null;
  const date = opts.date || new Date().toISOString().split("T")[0];
  db.prepare(
    "INSERT INTO expense_payments (expense_id, amount, date, method, paid_by, note) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(expenseId, amount, date, opts.method || "", opts.paid_by || "", opts.note || "");
  // If the expense is now fully covered, flip it to paid.
  const paid = getExpensePaidTotal(expenseId);
  if (paid + 0.005 >= (exp.amount || 0)) {
    db.prepare("UPDATE expenses SET payment_status = 'paid', paid_date = ? WHERE id = ?").run(date, expenseId);
  }
  return { paid, remaining: Math.max(0, (exp.amount || 0) - paid) };
}

// Everything still owed (a bill due, or a person to reimburse), with the
// amount paid so far, sorted so the soonest / overdue due-dates come first.
function getOutstandingExpenses() {
  const rows = db.prepare(`
    SELECT e.*, COALESCE((SELECT SUM(p.amount) FROM expense_payments p WHERE p.expense_id = e.id), 0) AS paid_to_date
    FROM expenses e
    WHERE e.payment_status IN ('due', 'reimburse')
    ORDER BY (e.due_date IS NULL OR e.due_date = ''), e.due_date ASC, e.date ASC
  `).all();
  return rows.map(r => ({ ...r, remaining: Math.max(0, (r.amount || 0) - (r.paid_to_date || 0)) }))
            .filter(r => r.remaining > 0.005);
}

function markExpensePaid(id) {
  const exp = db.prepare("SELECT * FROM expenses WHERE id = ?").get(id);
  const today = new Date().toISOString().split("T")[0];
  if (exp) {
    // Record the remaining balance as a final payment so the ledger stays balanced.
    const remaining = (exp.amount || 0) - getExpensePaidTotal(id);
    if (remaining > 0.005) {
      db.prepare("INSERT INTO expense_payments (expense_id, amount, date, method, paid_by, note) VALUES (?, ?, ?, ?, ?, ?)")
        .run(id, remaining, today, "", "", "Marked paid in full");
    }
  }
  db.prepare("UPDATE expenses SET payment_status = 'paid', paid_date = ? WHERE id = ?").run(today, id);
}

function getExpenseById(id) {
  return db.prepare("SELECT *, COALESCE((SELECT SUM(p.amount) FROM expense_payments p WHERE p.expense_id = expenses.id), 0) AS paid_to_date FROM expenses WHERE id = ?").get(id);
}

function deleteExpense(id) {
  db.prepare("DELETE FROM expense_payments WHERE expense_id = ?").run(id);
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
  // Outstanding = remaining balance (amount minus payments recorded so far)
  const remainingExpr = "(e.amount - COALESCE((SELECT SUM(p.amount) FROM expense_payments p WHERE p.expense_id = e.id), 0))";
  const due = db.prepare(`SELECT COALESCE(SUM(${remainingExpr}), 0) AS total FROM expenses e WHERE e.payment_status = 'due'`).get();
  const reimburse = db.prepare(`SELECT COALESCE(SUM(${remainingExpr}), 0) AS total FROM expenses e WHERE e.payment_status = 'reimburse'`).get();
  // Break down who is owed money (by remaining balance)
  const owedByPerson = db.prepare(
    `SELECT e.due_to AS person, COALESCE(SUM(${remainingExpr}), 0) AS total FROM expenses e WHERE e.payment_status IN ('due', 'reimburse') AND e.due_to != '' GROUP BY e.due_to ORDER BY total DESC`
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

/* =========================================================================
   Documents (COI, welcome packet, licenses, etc.)
   ========================================================================= */

function addDocument(opts) {
  return db.prepare(
    "INSERT INTO documents (title, category, filename, original_name, mime, size, notes) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(opts.title, opts.category || "General", opts.filename, opts.original_name || "", opts.mime || "", opts.size || 0, opts.notes || "");
}

function getDocuments() {
  return db.prepare("SELECT * FROM documents ORDER BY category ASC, uploaded_at DESC").all();
}

function getDocumentById(id) {
  return db.prepare("SELECT * FROM documents WHERE id = ?").get(id);
}

function deleteDocument(id) {
  db.prepare("DELETE FROM documents WHERE id = ?").run(id);
}

/* =========================================================================
   Vendors & Accounts (utilities, suppliers, portals — admin only)

   Reminder: there is no password field and there must never be one. The DB is
   a plaintext file; `password_location` only says WHERE the password is kept
   (e.g. "Bitwarden — J&M Shared"). Never write a password into it.
   ========================================================================= */

function addVendor(opts) {
  return db.prepare(`
    INSERT INTO vendors
      (name, category, what_for, account_number, website, login_username, password_location,
       support_phone, support_email, cost, billing_cycle, renewal_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    opts.name, opts.category || "Other", opts.what_for || "", opts.account_number || "",
    opts.website || "", opts.login_username || "", opts.password_location || "",
    opts.support_phone || "", opts.support_email || "", opts.cost || "",
    opts.billing_cycle || "", opts.renewal_date || "", opts.notes || ""
  );
}

// Active accounts first, then grouped alphabetically by category and name.
function getVendors() {
  return db.prepare("SELECT * FROM vendors ORDER BY active DESC, category ASC, name ASC").all();
}

function getVendorById(id) {
  return db.prepare("SELECT * FROM vendors WHERE id = ?").get(id);
}

function updateVendor(id, opts) {
  db.prepare(`
    UPDATE vendors SET
      name = ?, category = ?, what_for = ?, account_number = ?, website = ?,
      login_username = ?, password_location = ?, support_phone = ?, support_email = ?,
      cost = ?, billing_cycle = ?, renewal_date = ?, notes = ?
    WHERE id = ?
  `).run(
    opts.name, opts.category || "Other", opts.what_for || "", opts.account_number || "",
    opts.website || "", opts.login_username || "", opts.password_location || "",
    opts.support_phone || "", opts.support_email || "", opts.cost || "",
    opts.billing_cycle || "", opts.renewal_date || "", opts.notes || "", id
  );
}

function toggleVendor(id) {
  db.prepare("UPDATE vendors SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ?").run(id);
}

function deleteVendor(id) {
  db.prepare("DELETE FROM vendors WHERE id = ?").run(id);
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
    db.prepare("INSERT INTO email_signups (email, unsubscribe_token, status) VALUES (?, ?, 'subscribed')")
      .run(email.trim().toLowerCase(), crypto.randomBytes(16).toString("hex"));
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

// Only people who are still subscribed — the list marketing email may go to.
function getSubscribedSignups() {
  return db.prepare("SELECT * FROM email_signups WHERE status = 'subscribed' ORDER BY created_at DESC").all();
}

function getSubscribedCount() {
  return db.prepare("SELECT COUNT(*) AS count FROM email_signups WHERE status = 'subscribed'").get().count;
}

function getSignupByUnsubToken(token) {
  if (!token) return null;
  return db.prepare("SELECT * FROM email_signups WHERE unsubscribe_token = ?").get(token);
}

function unsubscribeByToken(token) {
  const row = getSignupByUnsubToken(token);
  if (!row) return null;
  db.prepare("UPDATE email_signups SET status = 'unsubscribed', unsubscribed_at = ? WHERE id = ?")
    .run(new Date().toISOString(), row.id);
  return row;
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
  const _n = new Date();
  const today = _n.getFullYear() + "-" + String(_n.getMonth() + 1).padStart(2, "0") +
    "-" + String(_n.getDate()).padStart(2, "0");
  const _w = new Date(_n.getFullYear(), _n.getMonth(), _n.getDate() + 7);
  const weekFromNow = _w.getFullYear() + "-" + String(_w.getMonth() + 1).padStart(2, "0") +
    "-" + String(_w.getDate()).padStart(2, "0");
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
  // Prefer what was actually charged. List price is a fallback only for rows
  // completed before amount_charged existed — otherwise a discounted, member or
  // gift-card visit reports at full price, and raising a price silently rewrites
  // last month's revenue.
  var totalRevenue = bookings.filter(function(b) { return b.status === "completed"; })
    .reduce(function(sum, b) {
      var actual = Number(b.amount_charged);
      return sum + (actual > 0 ? actual : (Number(b.service_price) || 0));
    }, 0);

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

// Self check-in: today's confirmed appointments matching a phone number.
function getTodayBookingsByPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "").slice(-10);
  if (digits.length < 7) return [];
  const _n = new Date();
  const today = _n.getFullYear() + "-" + String(_n.getMonth() + 1).padStart(2, "0") +
    "-" + String(_n.getDate()).padStart(2, "0");
  return getBookingsForDate(today)
    .filter(function (b) { return b.status === "confirmed"; })
    .filter(function (b) { return String(b.client_phone || "").replace(/\D/g, "").slice(-10) === digits; });
}

function markBookingArrived(id) {
  const now = new Date().toISOString();
  db.prepare("UPDATE bookings SET arrived_at = ? WHERE id = ? AND (arrived_at IS NULL OR arrived_at = '')").run(now, id);
  const row = db.prepare("SELECT arrived_at FROM bookings WHERE id = ?").get(id);
  return row ? row.arrived_at : null;
}

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
    SELECT b.*, s.name AS service_name, s.price AS service_price, t.name AS therapist_name
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
    SELECT date, COUNT(*) AS bookings, SUM(CASE WHEN b.amount_charged > 0 THEN b.amount_charged ELSE s.price END) AS revenue, SUM(b.tip_amount) AS tips
    FROM bookings b LEFT JOIN services s ON b.service_id = s.id
    WHERE b.status = 'completed' AND b.date BETWEEN ? AND ?
    GROUP BY b.date ORDER BY b.date
  `).all(startDate, endDate);
}

function getPopularServices(startDate, endDate) {
  return db.prepare(`
    SELECT s.name, COUNT(*) AS count, SUM(CASE WHEN b.amount_charged > 0 THEN b.amount_charged ELSE s.price END) AS revenue
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
    SELECT b.*, s.name AS service_name, s.price AS service_price, t.name AS therapist_name, t2.name AS therapist2_name
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

/**
 * "2026-01-31" -> "2026-02-28". Month arithmetic on the string parts so a
 * timezone can never shift the day, and short months clamp instead of rolling
 * over into the next month.
 */
function addOneMonth(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || "").trim());
  if (!m) return null;
  let year = parseInt(m[1], 10);
  let month = parseInt(m[2], 10) + 1;
  const day = parseInt(m[3], 10);
  if (month > 12) { month = 1; year += 1; }
  // Day 0 of the following month is the last day of this one.
  const lastDay = new Date(year, month, 0).getDate();
  return year + "-" + String(month).padStart(2, "0") + "-" +
    String(Math.min(day, lastDay)).padStart(2, "0");
}

/**
 * Roll over every membership whose billing date has passed.
 *
 * Memberships are billed by hand at the front desk — there is no subscription
 * webhook to tell us a month went by. Without this, visits_remaining only ever
 * counts down: a member who joined in March still shows March's leftover visits
 * in August, and staff have to guess. Called on a daily timer from server.js.
 *
 * A member who is several months behind is credited once (they get this month's
 * visits, not six months of them) and their billing date is walked forward until
 * it is in the future, so the same member is not renewed again tomorrow.
 * Returns how many members were renewed.
 */
function renewDueMemberships() {
  const _n = new Date();
  const today = _n.getFullYear() + "-" + String(_n.getMonth() + 1).padStart(2, "0") +
    "-" + String(_n.getDate()).padStart(2, "0");
  const due = db.prepare(
    "SELECT id, next_billing FROM members WHERE status = 'active' AND next_billing != '' AND next_billing <= ?"
  ).all(today);

  const setBilling = db.prepare("UPDATE members SET next_billing = ? WHERE id = ?");
  let renewed = 0;
  const tx = db.transaction(() => {
    for (const member of due) {
      let next = addOneMonth(member.next_billing);
      if (!next) continue; // unparseable date — leave it for a human to fix
      // Catch up a member who has been dormant for several billing dates.
      let guard = 0;
      while (next <= today && guard < 120) {
        next = addOneMonth(next);
        guard++;
      }
      renewMemberVisits(member.id);
      setBilling.run(next, member.id);
      renewed++;
    }
  });
  tx();
  return renewed;
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
  createBooking, getBookingsForDate, getClientHealthFlags, getUpcomingBookings,
  cancelBooking, completeBooking, quoteBooking,
  priceForTherapist, getTherapistPrices, getAllTherapistPrices, setTherapistPrice, setTherapistPay,
  getPayoutSummary, recordPayout, getPayoutHistory,
  addScannedReceipt, getScannedReceipts, getScannedReceiptById, countUnfiledReceipts,
  fileScannedReceipt, ignoreScannedReceipt, unfileScannedReceipt, noShowBooking, getBookingById, getAvailableSlots,
  getBookingByToken, rescheduleBooking, markReminderSent,
  getTodayBookingsByPhone, markBookingArrived,
  getTherapistStatuses,
  getExpenses, addExpense, updateExpense, deleteExpense, getExpenseById, markExpensePaid, getExpenseTotals, getRecurringExpenseSummary, getTaxDeductibleSummary, getQuarterlyTaxSummary,
  addExpensePayment, getExpensePayments, getExpensePaidTotal, getOutstandingExpenses,
  addDocument, getDocuments, getDocumentById, deleteDocument,
  // Vendors & accounts (no passwords stored — password_location is a pointer)
  addVendor, getVendors, getVendorById, updateVendor, deleteVendor, toggleVendor,
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
  addMember, updateMember, renewMemberVisits, renewDueMemberships, useMemberVisit, getMemberVisits,
  pauseMember, cancelMember, reactivateMember,
  // Email signups & updates
  addEmailSignup, getEmailSignups, getEmailSignupCount,
  getSubscribedSignups, getSubscribedCount, getSignupByUnsubToken, unsubscribeByToken,
  saveSentUpdate, getSentUpdates,
};
