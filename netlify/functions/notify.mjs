/**
 * Netlify Function: send transactional emails via Resend.
 * Called by /assessment and /apply after the lead is saved to Supabase.
 *
 * Env vars (set in Netlify → Site settings → Environment variables):
 *   RESEND_API_KEY  (required, secret)
 *   FROM_EMAIL      e.g. "Founder Transformation <hello@foundertransformation.co>"
 *                   (the domain must be verified in Resend)
 *   NOTIFY_EMAIL    where founder notifications go, e.g. "thibaultsagnier@gmail.com"
 */

const PROFILES = {
  perfectionist: { name: "The Perfectionist", one: "Never ships until it's flawless." },
  controller:    { name: "The Controller",    one: "Every decision runs through them." },
  performer:     { name: "The Performer",      one: "Self-worth tied to results." },
  pleaser:       { name: "The Pleaser",        one: "Says yes, then resents it." },
  overthinker:   { name: "The Overthinker",    one: "Analyzes long past the point of action." },
  drifter:       { name: "The Drifter",        one: "Busy, but without a chosen direction." },
  avoider:       { name: "The Avoider",        one: "Fills the day, dodges the hard thing." },
  prover:        { name: "The Prover",         one: "Nothing is ever quite enough." },
};

const SITE = "https://foundertransformation.co";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const profName = k => (PROFILES[k]?.name || k || "—");

/* Branded email shell */
function wrap(inner) {
  return `<!DOCTYPE html><html><body style="margin:0;background:#E7E0D0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#001C20">
  <div style="max-width:560px;margin:0 auto;padding:28px 22px">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#001C20;margin-bottom:22px">Founder <span style="color:#5D6763">Transformation</span></div>
    <div style="background:#F1ECE0;border:1px solid rgba(0,28,32,.12);border-radius:16px;padding:30px 26px">${inner}</div>
    <div style="text-align:center;color:#9CACA6;font-size:12px;margin-top:20px">Founder Transformation · <a href="${SITE}" style="color:#5D6763">foundertransformation.co</a></div>
  </div></body></html>`;
}
const h1 = t => `<div style="font-family:Georgia,serif;font-size:26px;line-height:1.15;color:#001C20;margin:0 0 14px">${t}</div>`;
const p  = t => `<p style="font-size:15px;line-height:1.6;color:#3a443f;margin:0 0 14px">${t}</p>`;
const btn = (href, label) => `<a href="${href}" style="display:inline-block;background:#001C20;color:#F1ECE0;text-decoration:none;font-size:14px;font-weight:600;padding:13px 24px;border-radius:999px;margin-top:6px">${label}</a>`;

/* ---- Assessment emails ---- */
function assessmentLeadEmail(from, d) {
  const dom = PROFILES[d.dominant_profile] || { name: profName(d.dominant_profile), one: "" };
  const secs = (d.secondary_profiles || []).map(profName).filter(Boolean);
  const secLine = secs.length ? p(`Your secondary patterns: <b>${esc(secs.join(", "))}</b>.`) : "";
  const vit = (d.vitality_score != null) ? p(`Your Founder Vitality Score: <b>${esc(d.vitality_score)}/100</b> — your baseline to move.`) : "";
  return {
    from,
    to: d.email,
    subject: `Your Invisible Limits profile: ${dom.name}`,
    html: wrap(
      h1(`Your dominant profile: ${esc(dom.name)}`) +
      p(esc(dom.one)) +
      secLine + vit +
      p(`This is the map. The program is the expedition — nine weeks working on the person behind the company, so the ceiling moves with you.`) +
      btn(`${SITE}/apply`, "Apply for the founding cohort →")
    ),
  };
}
function assessmentNotifyEmail(from, to, d) {
  const secs = (d.secondary_profiles || []).map(profName);
  return {
    from, to, reply_to: d.email,
    subject: `New assessment lead — ${d.first_name || "Someone"} (${profName(d.dominant_profile)})`,
    html: wrap(
      h1("New assessment lead") +
      p(`<b>${esc(d.first_name || "")}</b> · ${esc(d.email || "")}`) +
      p(`Dominant: <b>${esc(profName(d.dominant_profile))}</b><br>Secondary: ${esc(secs.join(", ") || "—")}<br>Vitality: <b>${esc(d.vitality_score ?? "—")}/100</b>`)
    ),
  };
}

/* ---- Application emails ---- */
function applicantEmail(from, d) {
  return {
    from,
    to: d.email,
    subject: `Your application to the founding cohort`,
    html: wrap(
      h1(`${esc(d.first_name || "Thanks")}, your application is in.`) +
      p(`Thibault reviews every application personally. If it's a fit, you'll hear back by email within a few days with the next step — usually a short 1:1 debrief.`) +
      p(`In the meantime, if you haven't yet, it's worth seeing your invisible limits.`) +
      btn(`${SITE}/assessment`, "Take the assessment →")
    ),
  };
}
function applicationNotifyEmail(from, to, d) {
  return {
    from, to, reply_to: d.email,
    subject: `New cohort application — ${d.first_name || ""} ${d.last_name || ""}, ${d.company || ""}`.trim(),
    html: wrap(
      h1("New cohort application") +
      p(`<b>${esc(d.first_name || "")} ${esc(d.last_name || "")}</b> · ${esc(d.email || "")}`) +
      p(`Company: <b>${esc(d.company || "—")}</b>${d.website ? ` · ${esc(d.website)}` : ""}<br>Revenue stage: <b>${esc(d.revenue_stage || "—")}</b>`) +
      p(`<b>Where they feel the ceiling:</b><br>${esc(d.ceiling || "—")}`) +
      (d.why_now ? p(`<b>Why now:</b><br>${esc(d.why_now)}`) : "") +
      (d.heard_from ? p(`Heard about us via: ${esc(d.heard_from)}`) : "")
    ),
  };
}

async function sendResend(key, msg) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(msg),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  return r.json();
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let d;
  try { d = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const KEY = process.env.RESEND_API_KEY;
  const FROM = process.env.FROM_EMAIL || "Founder Transformation <onboarding@resend.dev>";
  const NOTIFY = process.env.NOTIFY_EMAIL || "thibaultsagnier@gmail.com";

  // Never hard-fail the client: the lead is already saved in Supabase.
  if (!KEY) { console.warn("[notify] RESEND_API_KEY not set — skipping email"); return json({ ok: true, email: "skipped" }); }
  if (!d.email) return json({ error: "missing email" }, 400);

  let messages;
  if (d.type === "assessment") messages = [assessmentLeadEmail(FROM, d), assessmentNotifyEmail(FROM, NOTIFY, d)];
  else if (d.type === "application") messages = [applicantEmail(FROM, d), applicationNotifyEmail(FROM, NOTIFY, d)];
  else return json({ error: "unknown type" }, 400);

  const results = await Promise.allSettled(messages.map(m => sendResend(KEY, m)));
  const failed = results.filter(r => r.status === "rejected");
  failed.forEach(f => console.error("[notify] send failed:", f.reason?.message || f.reason));

  return json({ ok: failed.length === 0, sent: results.length - failed.length, failed: failed.length });
};
