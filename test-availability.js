/**
 * Availability engine tests — therapist schedule enforcement.
 * Builds a FRESH throwaway database from db.js's own schema. Never touches the real one.
 */
const fs = require("fs");
const APP = "/home/nick/jm-serenity-spa";
const WORK = "/tmp/avail-test-app";

fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK + "/db", { recursive: true });
fs.mkdirSync(WORK + "/lib", { recursive: true });
fs.copyFileSync(APP + "/lib/db.js", WORK + "/lib/db.js");
fs.symlinkSync(APP + "/node_modules", WORK + "/node_modules");
process.chdir(WORK);

// Requiring db.js against an empty db/ creates and seeds the schema.
const db = require(WORK + "/lib/db.js");
const Database = require(APP + "/node_modules/better-sqlite3");
const db2 = new Database(WORK + "/db/spa.db");

db2.prepare("UPDATE settings SET value='09:00' WHERE key='open_time'").run();
db2.prepare("UPDATE settings SET value='21:00' WHERE key='close_time'").run();
db2.prepare("UPDATE settings SET value='1,2,3,4,5,6,7' WHERE key='open_days'").run();
db2.prepare("UPDATE settings SET value='6' WHERE key='full_body_rooms'").run();
db2.prepare("UPDATE settings SET value='30' WHERE key='slot_interval'").run();

const FULL60 = db2.prepare("SELECT id FROM services WHERE category='full_body' AND duration=60 AND active=1").get().id;
const FOURH  = db2.prepare("SELECT id FROM services WHERE category='four_hands' AND active=1").get().id;

function reset() {
  db2.prepare("DELETE FROM bookings").run();
  db2.prepare("DELETE FROM therapists").run();
  try { db2.prepare("DELETE FROM blocked_times").run(); } catch (e) {}
}
function T(id, name, gender, wd, st, en) {
  db2.prepare(
    "INSERT INTO therapists (id,name,gender,specialties,service_ids,photo,bio,work_days,start_time,end_time,pin,active) " +
    "VALUES (?,?,?,'','','','',?,?,?,'',1)"
  ).run(id, name, gender, wd, st, en);
}
function B(date, time, duration, serviceId, t1, t2) {
  db2.prepare(
    "INSERT INTO bookings (client_name,client_phone,client_email,service_id,therapist_id,therapist2_id," +
    "gender_pref,notes,areas,date,time,duration,source,addon_ids,cancel_token,recurring_id,status) " +
    "VALUES ('T','555','',?,?,?,'','','',?,?,?,'test','','','','confirmed')"
  ).run(serviceId, t1, t2, date, time, duration);
}
const times = (r) => r.map((x) => x.time);

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((ok ? "  PASS  " : "  FAIL  ") + name);
  if (!ok) { console.log("        expected: " + JSON.stringify(expected)); console.log("        actual:   " + JSON.stringify(actual)); fail++; }
  else pass++;
}

const MON = "2026-08-10"; // Monday
const SUN = "2026-08-16"; // Sunday

console.log("\n=== 1. Day-of-week: Mon-Sat therapist is OFF on Sunday ===");
reset(); T(1, "A", "female", "1,2,3,4,5,6", "09:00", "21:00");
check("Monday has slots", times(db.getAvailableSlots(FULL60, MON, null, null, "")).length > 0, true);
check("Sunday is empty", times(db.getAvailableSlots(FULL60, SUN, null, null, "")), []);

console.log("\n=== 2. Sunday works when therapist is rostered day 7 ===");
reset(); T(1, "A", "female", "1,2,3,4,5,6,7", "09:00", "21:00");
check("Sunday has slots", times(db.getAvailableSlots(FULL60, SUN, null, null, "")).length > 0, true);

console.log("\n=== 3. Shift hours cap the day (09:00-19:00 therapist, spa open to 21:00) ===");
reset(); T(1, "A", "female", "1,2,3,4,5,6,7", "09:00", "19:00");
{
  const t = times(db.getAvailableSlots(FULL60, MON, null, null, ""));
  check("first slot 09:00", t[0], "09:00");
  check("last 60-min slot is 18:00 (ends 19:00)", t[t.length - 1], "18:00");
}

console.log("\n=== 4. Blank schedule inherits spa hours (every day, 9-9) ===");
reset(); T(1, "A", "female", "", "", "");
{
  const t = times(db.getAvailableSlots(FULL60, SUN, null, null, ""));
  check("Sunday not blank", t.length > 0, true);
  check("last slot 20:00 (ends 21:00)", t[t.length - 1], "20:00");
}

console.log("\n=== 5. Unassigned bookings still consume a therapist ===");
reset(); T(1, "A", "female", "", "", ""); T(2, "B", "female", "", "", "");
B(MON, "10:00", 60, FULL60, null, null);   // no-preference booking
B(MON, "10:00", 60, FULL60, null, null);   // second one — both therapists now busy
check("10:00 unavailable (2 therapists, 2 unassigned bookings)",
  times(db.getAvailableSlots(FULL60, MON, null, null, "")).includes("10:00"), false);
check("11:00 still available", times(db.getAvailableSlots(FULL60, MON, null, null, "")).includes("11:00"), true);

console.log("\n=== 6. Room capacity applies even when a therapist is named ===");
reset();
for (let i = 1; i <= 8; i++) T(i, "T" + i, "female", "", "", "");
db2.prepare("UPDATE settings SET value='6' WHERE key='full_body_rooms'").run();
for (let i = 1; i <= 6; i++) B(MON, "10:00", 60, FULL60, i, null); // 6 rooms full
check("named therapist 7 cannot take a 7th room",
  times(db.getAvailableSlots(FULL60, MON, 7, null, "")).includes("10:00"), false);

console.log("\n=== 7. Four hands needs TWO working therapists ===");
reset();
T(1, "A", "female", "", "", "");            // works every day
T(2, "B", "female", "6,7", "09:00", "21:00"); // Sat/Sun only — off Monday
check("four hands on Monday with only 1 rostered = no slots",
  times(db.getAvailableSlots(FOURH, MON, null, null, "")), []);
check("four hands naming therapist 1 on Monday still blocked (no 2nd)",
  times(db.getAvailableSlots(FOURH, MON, 1, null, "")), []);
reset();
T(1, "A", "female", "", "", ""); T(2, "B", "female", "", "", "");
check("four hands with 2 rostered = slots exist",
  times(db.getAvailableSlots(FOURH, MON, null, null, "")).length > 0, true);

console.log("\n=== 8. Named therapist who is off that day gets nothing ===");
reset(); T(1, "A", "female", "1,2,3,4,5,6", "09:00", "21:00"); T(2, "B", "female", "", "", "");
check("therapist 1 on Sunday = empty", times(db.getAvailableSlots(FULL60, SUN, 1, null, "")), []);
check("therapist 2 on Sunday = has slots", times(db.getAvailableSlots(FULL60, SUN, 2, null, "")).length > 0, true);

console.log("\n=== 9. Gender preference still respected ===");
reset(); T(1, "A", "female", "", "", ""); T(2, "B", "male", "", "", "");
check("male preference has slots", times(db.getAvailableSlots(FULL60, MON, null, null, "male")).length > 0, true);
reset(); T(1, "A", "female", "", "", "");
check("male preference with no male therapist = empty",
  times(db.getAvailableSlots(FULL60, MON, null, null, "male")), []);

console.log("\n=== 10. No active therapists = no slots (not a crash) ===");
reset();
check("empty roster returns []", times(db.getAvailableSlots(FULL60, MON, null, null, "")), []);

console.log("\n" + "=".repeat(50));
console.log(`  ${pass} passed, ${fail} failed`);
console.log("=".repeat(50));
process.exit(fail ? 1 : 0);
