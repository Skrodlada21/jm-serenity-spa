/**
 * J&M Serenity Spa — AI helper (OpenRouter)
 * Drafts warm marketing/update emails. Config-gated on the openrouter_api_key
 * setting; the model is configurable (openrouter_model), defaulting to a
 * cheap-but-good option. Uses native fetch (Node 18+).
 */

const db = require("./db");

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-4.1-mini";

function isConfigured() {
  return !!db.getSetting("openrouter_api_key");
}

async function draftUpdateEmail(topic) {
  const apiKey = db.getSetting("openrouter_api_key");
  if (!apiKey) throw new Error("AI is not set up yet — add an OpenRouter API key in Settings.");
  const model = db.getSetting("openrouter_model") || DEFAULT_MODEL;
  const settings = db.getAllSettings();
  const spaName = settings.spa_name || "J&M Serenity Spa";
  const address = settings.address || "Littleton, CO";

  const system =
    `You write email updates for ${spaName}, a massage therapy spa in ${address}. ` +
    `Voice: warm, welcoming, professional, and genuine — never pushy or salesy. ` +
    `Keep it short (roughly 120–200 words). ` +
    `Respond in exactly this format: the first line is "Subject: <a short compelling subject line>", ` +
    `then a blank line, then the email body as plain text. ` +
    `Do NOT include an unsubscribe line, a physical address, or [placeholders] — those are added automatically. ` +
    `End the body with a simple sign-off from "The ${spaName} Team". No markdown.`;

  const resp = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
      "HTTP-Referer": settings.site_url || "https://jmserenityspa.com",
      "X-Title": spaName,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: "Write an update email about: " + topic },
      ],
      max_tokens: 700,
      temperature: 0.7,
    }),
  });

  if (!resp.ok) {
    let detail = "";
    try { detail = (await resp.json()).error?.message || ""; } catch (e) { detail = (await resp.text().catch(() => "")).slice(0, 200); }
    throw new Error("AI request failed (" + resp.status + ")" + (detail ? ": " + detail : ""));
  }

  const data = await resp.json();
  const raw = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!raw || !raw.trim()) throw new Error("AI returned an empty response. Try again or adjust the topic.");

  // Split "Subject: ..." first line from the body.
  const text = raw.trim();
  let subject = "";
  let body = text;
  const m = text.match(/^\s*Subject:\s*(.+?)(?:\r?\n)([\s\S]*)$/i);
  if (m) { subject = m[1].trim(); body = m[2].trim(); }
  return { subject, body };
}

module.exports = { isConfigured, draftUpdateEmail, DEFAULT_MODEL };
