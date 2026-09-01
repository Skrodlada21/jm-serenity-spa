/**
 * J&M Serenity Spa — Square Terminal live status
 *
 * Used by the front desk and the admin dashboard after "Send to Terminal".
 * Polls the checkout until the guest finishes, then updates the banner
 * (#fd-terminal-banner / #fd-terminal-head / #fd-terminal-sub) and opens the
 * booking's payment form pre-filled:
 *   - full charge   (referenceId "<bookingId>"): Credit Card + the tip the
 *     guest picked on the terminal
 *   - partial charge (same referenceId, amount below the quote): no method is
 *     auto-picked — the banner shows what's still owed and the tip is filled
 *     into every completion form so the desk finishes with the right split
 *   - tip-only charge (referenceId "tip:<bookingId>"): the whole payment IS
 *     the tip — filled into the Gift Card form as a card tip
 */
function watchTerminalCheckout(checkoutId) {
  var banner = document.getElementById("fd-terminal-banner");
  var head = document.getElementById("fd-terminal-head");
  var sub = document.getElementById("fd-terminal-sub");
  var tries = 0;

  function paint(bg, border, color) {
    if (!banner) return;
    banner.style.background = bg;
    banner.style.borderColor = border;
    banner.style.color = color;
  }

  // Keep the banner's hand-written Chinese line (visible in bilingual mode)
  // in step with the status — otherwise it would still say "ask the guest to
  // tap" after the payment already went through. No-op where there is none.
  function setZh(text) {
    var zh = banner && banner.querySelector(".zh-block");
    if (zh) zh.textContent = text;
  }

  // Open a booking's completion form pre-filled, so the desk just confirms.
  // "wanted" picks the form: a payment_method <select> for a normal card
  // sale, the gift_cert_code input for a tip-only charge.
  function fill(bookingId, wanted, tipDollars, asCreditCard) {
    var el = document.querySelector('form[action="/admin/bookings/' + bookingId + '/complete"] ' + wanted);
    if (!el) return false;
    var form = el.closest("form");
    if (asCreditCard) {
      var sel = form.querySelector('select[name="payment_method"]');
      if (sel) sel.value = "Credit Card";
    }
    var tip = form.querySelector('input[name="tip_amount"]');
    if (tip) tip.value = tipDollars.toFixed(2);
    var cardRadio = form.querySelector('input[name="tip_method"][value="card"]');
    if (cardRadio) cardRadio.checked = true;
    var details = form.closest("details");
    if (details) details.open = true;
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    return true;
  }

  // Partial payments: pre-set the tip everywhere without picking a payment
  // method — the desk chooses the split that matches how the rest was taken.
  function fillTips(bookingId, tipDollars) {
    document.querySelectorAll('form[action="/admin/bookings/' + bookingId + '/complete"]').forEach(function (form) {
      var tip = form.querySelector('input[name="tip_amount"]');
      if (tip && tip.type !== "hidden") tip.value = tipDollars.toFixed(2);
      var cardRadio = form.querySelector('input[name="tip_method"][value="card"]');
      if (cardRadio) cardRadio.checked = true;
    });
  }

  function poll() {
    tries++;
    if (tries > 120) { // ~5 minutes, then stop quietly
      if (sub) sub.textContent = "Still waiting — check the terminal, or refresh this page.";
      setZh("仍在等待 — 请检查终端或刷新页面。");
      return;
    }
    fetch("/api/admin/checkout-status/" + encodeURIComponent(checkoutId))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.status === "COMPLETED") {
          paint("#e8f5e9", "#a5d6a7", "#2e7d32");
          var ref = String(d.bookingId || "");
          if (ref.indexOf("tip:") === 0) {
            var tipAmt = d.totalDollars || 0;
            if (head) head.textContent = "✓ Tip paid on card — $" + tipAmt.toFixed(2) + ".";
            var gFilled = fill(ref.slice(4), 'input[name="gift_cert_code"]', tipAmt, false);
            if (sub) sub.textContent = gFilled
              ? "Tip recorded in the Gift Card form below — scan the card and hit Pay with Gift Card."
              : "Record it as a Card tip when completing the booking.";
            setZh("小费已刷卡支付，请扫礼品卡完成结账。");
          } else if (d.partial) {
            if (head) head.textContent = "✓ Card part paid — $" + (d.totalDollars || 0).toFixed(2) + (d.tipDollars > 0 ? " (incl $" + d.tipDollars.toFixed(2) + " tip)" : "") + ".";
            if (ref) fillTips(ref, d.tipDollars || 0);
            if (sub) sub.textContent = "Still to collect: $" + (d.stillDue || 0).toFixed(2) + " — finish with the matching split: Gift Card form (“rest as”) or Other Payment (second payment row).";
            setZh("刷卡部分已支付，还需收取 $" + (d.stillDue || 0).toFixed(2) + "，请选择对应的拆分方式完成。");
          } else {
            var tipTxt = d.tipDollars > 0 ? " — tip $" + d.tipDollars.toFixed(2) : " — no tip";
            if (head) head.textContent = "✓ Paid on the terminal" + (d.totalDollars ? " ($" + d.totalDollars.toFixed(2) + " total)" : "") + tipTxt + ".";
            var filled = ref ? fill(ref, 'select[name="payment_method"]', d.tipDollars || 0, true) : false;
            if (sub) sub.textContent = filled
              ? "Payment form is filled in below — check it and hit Save."
              : "Mark the booking complete with payment method Credit Card.";
            setZh("已在终端支付成功，请核对下方表格并保存。");
          }
        } else if (d.status === "CANCELED") {
          paint("#fdecea", "#f5c6cb", "#b02a37");
          if (head) head.textContent = "✕ Checkout canceled — nothing was charged.";
          if (sub) sub.textContent = "Send it to the terminal again, or take another payment method.";
          setZh("已取消 — 未收取任何费用。");
        } else { // PENDING / IN_PROGRESS / CANCEL_REQUESTED / unknown
          if (sub) sub.textContent = "Waiting for the guest to finish on the terminal…";
          setZh("等待客人在终端完成操作…");
          setTimeout(poll, 2500);
        }
      })
      .catch(function () { setTimeout(poll, 4000); });
  }
  poll();
}
