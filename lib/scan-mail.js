/**
 * J&M Serenity Spa — pull scanned receipts out of a mailbox.
 *
 * The office printer (and any staff phone) emails a scan to a dedicated
 * address. This polls that mailbox, takes PDF/image attachments off approved
 * senders, and hands them to the same receipt queue the folder watcher feeds.
 *
 * No OCR, no AI. A person reads the paper and types a total.
 *
 * TRUST MODEL — the important part.
 * This address auto-imports attachments into the expense system, and a From
 * header is trivially forged. So:
 *   1. The sender must be on an allowlist (exact address or @domain).
 *   2. Because a From can be spoofed, we ALSO require that Google's own
 *      Authentication-Results header says SPF or DKIM passed. Google checks
 *      this before we ever see the message; we just refuse to trust anything
 *      it did not verify.
 * Anything failing either test is left unread and untouched, and logged.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const db = require("./db");

const ALLOWED_MIME = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/tiff": ".tif",
};
const MAX_ATTACHMENT = 25 * 1024 * 1024;
const MAX_PER_RUN = 20;               // don't let one run chew through a backlog forever
const POLL_MS = 5 * 60 * 1000;        // every 5 minutes; a scan is not urgent

let running = false;                  // never let two polls overlap

/** Is this sender allowed to add receipts? Exact address or "@domain". */
function senderAllowed(from, allowList) {
  const addr = String(from || "").toLowerCase().trim();
  if (!addr) return false;
  return allowList.some((entry) => {
    const e = entry.toLowerCase().trim();
    if (!e) return false;
    return e.startsWith("@") ? addr.endsWith(e) : addr === e;
  });
}

/**
 * Did Google itself vouch for this message? A From header alone proves nothing.
 *
 * There are two legitimate shapes:
 *
 *  1. Mail from OUTSIDE the domain. Google stamps Authentication-Results on
 *     delivery; we require spf=pass or dkim=pass.
 *
 *  2. Mail submitted THROUGH Google by an authenticated sender — which is what
 *     the office printer does with its App Password. This never leaves Google's
 *     system, so it carries NO Authentication-Results at all. Instead the top
 *     Received header, written by Google and not forgeable by an outsider,
 *     records "with ESMTPSA" — SMTP *Authenticated* submission. That is a
 *     stronger signal than SPF: somebody signed in with credentials to send it.
 *
 * Requiring case 1 alone rejected exactly the case we built this for.
 */
function passedAuth(headerValue, topReceived) {
  const h = String(headerValue || "").toLowerCase();
  if (h.includes("spf=pass") || h.includes("dkim=pass")) return true;
  // Only trust the ESMTPSA route when Google did NOT stamp an auth result —
  // if it did and the result was a failure, that failure stands.
  if (!h && /\bwith\s+ESMTPSA\b/i.test(String(topReceived || ""))) return true;
  return false;
}

function safeExt(mime, filename) {
  if (ALLOWED_MIME[String(mime).toLowerCase()]) return ALLOWED_MIME[String(mime).toLowerCase()];
  const ext = path.extname(String(filename || "")).toLowerCase();
  return Object.values(ALLOWED_MIME).includes(ext) ? ext : null;
}

async function pollOnce(appRoot) {
  const s = db.getAllSettings();
  if (s.scan_email_enabled !== "1") return { skipped: "disabled" };

  const host = s.scan_email_host || "imap.gmail.com";
  const user = s.scan_email_user || "";
  const pass = s.scan_email_pass || "";
  if (!user || !pass) return { skipped: "not configured" };

  const allowList = String(s.scan_email_allowed || "")
    .split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  if (allowList.length === 0) {
    console.warn("Scan mail: no approved senders configured — refusing to import anything.");
    return { skipped: "no allowlist" };
  }

  const receiptDir = path.join(appRoot, "private_uploads", "receipts");
  fs.mkdirSync(receiptDir, { recursive: true });

  const client = new ImapFlow({
    host, port: parseInt(s.scan_email_port, 10) || 993, secure: true,
    auth: { user, pass },
    logger: false,
    // A Pi on a flaky connection should give up rather than hang forever.
    socketTimeout: 60 * 1000,
    greetingTimeout: 20 * 1000,
  });

  let imported = 0, rejected = 0, examined = 0;
  await client.connect();
  try {
    const lock = await client.getMailboxLock(s.scan_email_folder || "INBOX");
    try {
      const unseen = await client.search({ seen: false });
      const batch = (unseen || []).slice(0, MAX_PER_RUN);
      for (const uid of batch) {
        examined++;
        const msg = await client.fetchOne(uid, { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const parsed = await simpleParser(msg.source);

        const from = parsed.from && parsed.from.value && parsed.from.value[0]
          ? parsed.from.value[0].address : "";
        const authResults = parsed.headers.get("authentication-results");
        const receivedRaw = parsed.headers.get("received");
        const topReceived = Array.isArray(receivedRaw) ? receivedRaw[0] : receivedRaw;
        const allowed = senderAllowed(from, allowList);
        const verified = passedAuth(
          typeof authResults === "string" ? authResults : (authResults && authResults.value),
          topReceived
        );

        if (!allowed || !verified) {
          rejected++;
          console.warn(
            "Scan mail: refusing message from " + (from || "(no from)") +
            (allowed ? "" : " — sender not on the approved list") +
            (verified ? "" : " — SPF/DKIM not verified")
          );
          continue;   // left UNREAD on purpose, so a human can look at it
        }

        let tookSomething = false;
        for (const att of parsed.attachments || []) {
          const ext = safeExt(att.contentType, att.filename);
          if (!ext) continue;
          if (!att.content || att.content.length === 0) continue;
          if (att.content.length > MAX_ATTACHMENT) {
            console.warn("Scan mail: attachment too large, skipped:", att.filename);
            continue;
          }
          // Never trust the filename from an email — generate our own.
          const stored = "receipt-" + crypto.randomBytes(12).toString("hex") + ext;
          fs.writeFileSync(path.join(receiptDir, stored), att.content);
          db.addScannedReceipt({
            filename: stored,
            originalName: String(att.filename || "emailed-scan").slice(0, 180),
            mime: String(att.contentType || "").toLowerCase(),
            size: att.content.length,
          });
          imported++;
          tookSomething = true;
        }

        // Only mark it read once its attachments are safely on disk. If we
        // crash before this, the message is retried next run rather than lost.
        if (tookSomething) {
          await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
        } else {
          console.log("Scan mail: no usable attachment from " + from + " — left unread.");
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  if (imported || rejected) {
    console.log(`Scan mail: examined ${examined}, imported ${imported}, refused ${rejected}`);
  }
  return { examined, imported, rejected };
}

function start(appRoot) {
  const tick = async () => {
    if (running) return;              // a slow run must not stack up
    running = true;
    try { await pollOnce(appRoot); }
    catch (err) { console.error("Scan mail error:", err.message); }
    finally { running = false; }
  };
  setTimeout(tick, 30 * 1000);
  setInterval(tick, POLL_MS);
  console.log("Scan mail: receipt mailbox poller started");
}

module.exports = { start, pollOnce, senderAllowed, passedAuth };
