/**
 * J&M Serenity Spa — Label printing (Zebra GX420d, ZPL over TCP 9100)
 * Builds a 2"x1" gift-card back label (Code128 barcode + code + amount) and
 * sends raw ZPL straight to the networked printer for silent, one-click printing.
 */

const net = require("net");

// Strip ZPL control characters so a code/amount can't break the format.
function clean(s) {
  return String(s == null ? "" : s).replace(/[\^~]/g, "");
}

// 2" x 1" label at 203 dpi (GX420d) = 406 x 203 dots.
function buildGiftCertZpl(code, amount) {
  const c = clean(code);
  const amt = "$" + (Number(amount) || 0).toFixed(2);
  return [
    "^XA",
    "^PW406",           // print width 2" (406 dots)
    "^LL203",           // label length 1" (203 dots)
    "^LH0,0",
    "^CI28",            // UTF-8
    "^FO28,16^BY2^BCN,72,N,N,N^FD" + c + "^FS",   // Code128 barcode (no text line)
    "^FO28,98^A0N,26,26^FD" + c + "^FS",          // the code, as text
    "^FO28,134^A0N,42,42^FD" + amt + "^FS",       // the amount
    "^XZ",
  ].join("\n");
}

// Send raw data to a networked label printer (JetDirect/RAW on :9100).
function sendToPrinter(ip, port, data, timeoutMs) {
  timeoutMs = timeoutMs || 6000;
  return new Promise(function (resolve, reject) {
    const socket = new net.Socket();
    let settled = false;
    function done(err) {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch (e) {}
      err ? reject(err) : resolve();
    }
    socket.setTimeout(timeoutMs);
    socket.on("timeout", function () { done(new Error("timed out reaching printer")); });
    socket.on("error", function (e) { done(e); });
    socket.on("close", function () { done(); });
    socket.connect(port, ip, function () {
      socket.write(data, function () { socket.end(); });
    });
  });
}

module.exports = { buildGiftCertZpl, sendToPrinter, clean };
