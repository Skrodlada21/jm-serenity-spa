/**
 * J&M Serenity Spa — scanned receipt ingest.
 *
 * The office printer scans straight into scans/incoming (over SMB, or dropped
 * there by any other means). This picks new files up, moves them into the
 * private receipt store under a random name, and records them as "unfiled" so
 * they show up in the admin queue to be given a category and a total.
 *
 * Deliberately NO OCR and no AI. A person filing a receipt can read the paper
 * faster than a model can, and this way it costs nothing per scan and works
 * with the internet down.
 *
 * Polling, not fs.watch: fs.watch is unreliable over network filesystems, and
 * a scanner writing a large PDF can fire several events while the file is
 * still being written. Polling plus a settle check avoids ingesting a
 * half-written file.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("./db");

const ALLOWED = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

const POLL_MS = 20 * 1000;         // check for new scans every 20s
const SETTLE_MS = 5 * 1000;        // file size must be unchanged this long
const MAX_BYTES = 25 * 1024 * 1024; // a scanned page is well under this

const seen = new Map();            // path -> { size, since }

function ingestOnce(incomingDir, receiptDir) {
  let entries;
  try {
    entries = fs.readdirSync(incomingDir, { withFileTypes: true });
  } catch (err) {
    return; // folder may not exist yet — nothing to do
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (name.startsWith(".")) continue;                 // .DS_Store, partials
    const ext = path.extname(name).toLowerCase();
    if (!ALLOWED[ext]) continue;

    const full = path.join(incomingDir, name);
    let st;
    try { st = fs.statSync(full); } catch (e) { continue; }

    if (st.size === 0) continue;
    if (st.size > MAX_BYTES) {
      console.warn("Scan ingest: skipping oversized file", name, st.size);
      continue;
    }

    // Wait until the size stops changing — the scanner may still be writing.
    const prev = seen.get(full);
    if (!prev || prev.size !== st.size) {
      seen.set(full, { size: st.size, since: Date.now() });
      continue;
    }
    if (Date.now() - prev.since < SETTLE_MS) continue;

    const stored = "receipt-" + crypto.randomBytes(12).toString("hex") + ext;
    const dest = path.join(receiptDir, stored);
    try {
      fs.renameSync(full, dest);                        // same filesystem
    } catch (err) {
      if (err.code === "EXDEV") {                       // across devices
        fs.copyFileSync(full, dest);
        fs.unlinkSync(full);
      } else {
        console.error("Scan ingest: could not move", name, err.message);
        continue;
      }
    }

    try {
      db.addScannedReceipt({
        filename: stored,
        originalName: name,
        mime: ALLOWED[ext],
        size: st.size,
      });
      console.log("Scan ingest: filed", name, "->", stored);
    } catch (err) {
      console.error("Scan ingest: DB insert failed for", name, err.message);
    }
    seen.delete(full);
  }

  // Forget anything that has gone away, so the map cannot grow forever.
  for (const key of seen.keys()) {
    if (!fs.existsSync(key)) seen.delete(key);
  }
}

function start(appRoot) {
  const incomingDir = path.join(appRoot, "scans", "incoming");
  const receiptDir = path.join(appRoot, "private_uploads", "receipts");
  try {
    fs.mkdirSync(incomingDir, { recursive: true });
    fs.mkdirSync(receiptDir, { recursive: true });
  } catch (err) {
    console.error("Scan ingest: cannot create folders:", err.message);
    return;
  }
  console.log("Scan ingest: watching", incomingDir);
  // Wrapped so a bad file can never take the process down.
  const tick = () => {
    try { ingestOnce(incomingDir, receiptDir); }
    catch (err) { console.error("Scan ingest error:", err.message); }
  };
  setTimeout(tick, 5000);
  setInterval(tick, POLL_MS);
}

module.exports = { start, ingestOnce };
