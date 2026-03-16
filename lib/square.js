/**
 * J&M Serenity Spa — Square Integration Helper
 *
 * Handles:
 *  - Terminal API: Send checkout requests to Square Terminal for card payments
 *  - Payment tracking: Record payment results back to booking system
 *
 * Settings required (in admin settings):
 *   square_access_token  — Your Square access token (from Square Developer Dashboard)
 *   square_location_id   — Your Square location ID
 *   square_device_id     — Your Square Terminal device ID
 *   square_environment   — "sandbox" or "production"
 *
 * The website NEVER touches card data. Square Terminal handles all card processing.
 * We only send the amount and get back a success/failure result.
 *
 * Uses "square/legacy" import for compatibility with Square SDK v40+.
 */

const crypto = require("crypto");
const db = require("./db");

let SquareClient = null;

/**
 * Lazy-load the Square SDK (so server starts even if not installed yet).
 * Uses the legacy import path for backwards-compatible API.
 */
function getSquareClient() {
  const settings = db.getAllSettings();
  const accessToken = settings.square_access_token;
  const environment = settings.square_environment || "sandbox";

  if (!accessToken) return null;

  try {
    if (!SquareClient) {
      const { Client, Environment } = require("square/legacy");
      SquareClient = new Client({
        bearerAuthCredentials: { accessToken },
        environment: environment === "production" ? Environment.Production : Environment.Sandbox,
      });
    }
    return SquareClient;
  } catch (err) {
    console.error("Square SDK not installed or error:", err.message);
    return null;
  }
}

/**
 * Reset the client (call when settings change so new token is used).
 */
function resetClient() {
  SquareClient = null;
}

/**
 * Send a checkout request to the Square Terminal.
 *
 * @param {number} amountCents - Amount in cents (e.g., $85.00 = 8500)
 * @param {string} note - Description shown on terminal (e.g., "Deep Tissue 60min - Jane")
 * @param {object} options - Optional: { allowTip: true, bookingId: 123 }
 * @returns {object|null} - The terminal checkout object, or null on failure
 */
async function createTerminalCheckout(amountCents, note, options = {}) {
  const client = getSquareClient();
  if (!client) return null;

  const settings = db.getAllSettings();
  const deviceId = settings.square_device_id;
  const locationId = settings.square_location_id;

  if (!deviceId || !locationId) {
    console.error("Square Terminal: missing device_id or location_id");
    return null;
  }

  const idempotencyKey = crypto.randomUUID();

  const checkoutRequest = {
    idempotencyKey,
    checkout: {
      amountMoney: {
        amount: BigInt(amountCents),
        currency: "USD",
      },
      deviceOptions: {
        deviceId,
        tipSettings: {
          allowTipping: options.allowTip !== false,
        },
        showItemizedCart: false,
      },
      note: note || "J&M Serenity Spa",
      referenceId: options.bookingId ? String(options.bookingId) : "",
    },
  };

  try {
    const response = await client.terminalApi.createTerminalCheckout(checkoutRequest);
    const checkout = response.result.checkout;
    console.log("Square Terminal checkout created:", checkout.id, "Status:", checkout.status);
    return checkout;
  } catch (err) {
    console.error("Square Terminal checkout error:", err.message || err);
    return null;
  }
}

/**
 * Check the status of a terminal checkout.
 *
 * @param {string} checkoutId - The Square checkout ID
 * @returns {object|null} - The checkout object with current status
 */
async function getTerminalCheckout(checkoutId) {
  const client = getSquareClient();
  if (!client) return null;

  try {
    const response = await client.terminalApi.getTerminalCheckout(checkoutId);
    return response.result.checkout;
  } catch (err) {
    console.error("Square get checkout error:", err.message || err);
    return null;
  }
}

/**
 * Cancel a pending terminal checkout.
 *
 * @param {string} checkoutId - The Square checkout ID to cancel
 * @returns {boolean}
 */
async function cancelTerminalCheckout(checkoutId) {
  const client = getSquareClient();
  if (!client) return false;

  try {
    await client.terminalApi.cancelTerminalCheckout(checkoutId);
    return true;
  } catch (err) {
    console.error("Square cancel checkout error:", err.message || err);
    return false;
  }
}

/**
 * List devices paired to this location (useful for finding device_id).
 *
 * @returns {Array} - List of device objects
 */
async function listDevices() {
  const client = getSquareClient();
  if (!client) return [];

  try {
    const settings = db.getAllSettings();
    const response = await client.devicesApi.listDevices({
      locationId: settings.square_location_id || undefined,
    });
    return response.result.devices || [];
  } catch (err) {
    console.error("Square list devices error:", err.message || err);
    return [];
  }
}

module.exports = {
  createTerminalCheckout,
  getTerminalCheckout,
  cancelTerminalCheckout,
  listDevices,
  resetClient,
};
