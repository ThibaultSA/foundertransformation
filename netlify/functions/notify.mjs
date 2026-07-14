/**
 * Netlify Function: send transactional emails via Resend.
 * Called by /assessment and /apply after the lead is saved to Supabase.
 *
 * Env vars (Netlify -> Site configuration -> Environment variables):
 *   RESEND_API_KEY  (required, secret)
 *   FROM_EMAIL      e.g. "Founder Transformation <hello@foundertransformation.co>"
 *   NOTIFY_EMAIL    where founder notifications go
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

const profName = k => (PROFILES[k]?.name || k || "");

/* ---------- Email building blocks (table-based, inline styles) ---------- */
const SERIF = "Georgia,'Times New Roman',serif";
const SANS  = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO  = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

function shell(inner) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#E7E0D0;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E7E0D0;">
  <tr><td align="center" style="padding:34px 16px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;width:100%;">
      <tr><td style="background:#001C20;border-radius:18px 18px 0 0;border-bottom:2px solid #D5F25A;padding:24px 34px;">
        <span style="font-family:${SERIF};font-size:19px;color:#F1ECE0;letter-spacing:.2px;">Founder <span style="color:#8b9a94;">Transformation</span></span>
      </td></tr>
      <tr><td style="background:#ffffff;padding:40px 34px 36px;">${inner}</td></tr>
      <tr><td style="background:#ffffff;border-radius:0 0 18px 18px;border-top:1px solid rgba(0,28,32,.08);padding:22px 34px;text-align:center;">
        <span style="font-family:${SANS};font-size:12px;color:#9aa39e;">Founder Transformation &middot; <a href="${SITE}" style="color:#6b746f;text-decoration:none;">foundertransformation.co</a></span>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

const eyebrow = t => `<div style="font-family:${MONO};font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#7c8a52;margin:0 0 15px;">${t}</div>`;
const h1 = t => `<h1 style="font-family:${SERIF};font-weight:normal;font-size:27px;line-height:1.18;color:#001C20;margin:0 0 18px;">${t}</h1>`;
const p  = t => `<p style="font-family:${SANS};font-size:15px;line-height:1.62;color:#3a443f;margin:0 0 16px;">${t}</p>`;

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 2px;"><tr>
    <td align="center" bgcolor="#D5F25A" style="border-radius:999px;">
      <a href="${href}" style="display:inline-block;font-family:${SANS};font-size:14px;font-weight:bold;color:#001C20;text-decoration:none;padding:14px 28px;border-radius:999px;">${label}</a>
    </td></tr></table>`;
}

function resultCard(dom, secsStr, vit) {
  const hasMeta = secsStr || (vit != null);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;"><tr>
    <td style="background:#001C20;border-radius:14px;padding:26px 26px;">
      <div style="font-family:${MONO};font-size:10.5px;letter-spacing:2px;text-transform:uppercase;color:#D5F25A;margin:0 0 8px;">Dominant profile</div>
      <div style="font-family:${SERIF};font-size:27px;line-height:1.1;color:#F1ECE0;margin:0 0 5px;">${esc(dom.name)}</div>
      <div style="font-family:${SANS};font-size:14px;color:#9CACA6;margin:0;">${esc(dom.one)}</div>
      ${hasMeta ? `<div style="border-top:1px solid rgba(213,242,90,.18);margin-top:18px;padding-top:15px;">
        ${secsStr ? `<div style="font-family:${SANS};font-size:13px;color:#C8D3CE;margin-bottom:7px;">Secondary patterns: <span style="color:#F1ECE0;">${esc(secsStr)}</span></div>` : ""}
        ${vit != null ? `<div style="font-family:${SANS};font-size:13px;color:#C8D3CE;">Founder Vitality Score: <span style="color:#D5F25A;font-weight:bold;">${esc(vit)}/100</span></div>` : ""}
      </div>` : ""}
    </td></tr></table>`;
}

function rows(pairs) {
  const body = pairs.filter(([, v]) => v != null && v !== "").map(([k, v]) => `<tr>
      <td style="font-family:${MONO};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#7c8a52;padding:11px 0;vertical-align:top;width:120px;border-bottom:1px solid rgba(0,28,32,.07);">${esc(k)}</td>
      <td style="font-family:${SANS};font-size:14px;line-height:1.5;color:#001C20;padding:11px 0;border-bottom:1px solid rgba(0,28,32,.07);">${esc(v)}</td>
    </tr>`).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 6px;">${body}</table>`;
}

function block(label, text) {
  return `<div style="margin:18px 0 0;">
    <div style="font-family:${MONO};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#7c8a52;margin:0 0 7px;">${esc(label)}</div>
    <div style="font-family:${SANS};font-size:15px;line-height:1.6;color:#3a443f;white-space:pre-wrap;">${esc(text)}</div>
  </div>`;
}

/* ---------- Assessment ---------- */
export function assessmentLeadEmail(from, d) {
  const dom = PROFILES[d.dominant_profile] || { name: profName(d.dominant_profile) || "Your profile", one: "" };
  const secsStr = (d.secondary_profiles || []).map(profName).filter(Boolean).join(", ");
  return {
    from, to: d.email,
    subject: `Your Invisible Limits profile: ${dom.name}`,
    html: shell(
      eyebrow("Your assessment result") +
      h1(`${esc(d.first_name || "Here")}, here's your profile.`) +
      resultCard(dom, secsStr, d.vitality_score) +
      p("This is the map. The program is the expedition: nine weeks working on the person behind the company, so the ceiling moves with you.") +
      button(`${SITE}/apply`, "Apply for the founding cohort &rarr;")
    ),
  };
}
export function assessmentNotifyEmail(from, to, d) {
  const secsStr = (d.secondary_profiles || []).map(profName).filter(Boolean).join(", ");
  return {
    from, to, reply_to: d.email,
    subject: `New assessment lead: ${d.first_name || "Someone"} (${profName(d.dominant_profile) || "?"})`,
    html: shell(
      eyebrow("New assessment lead") +
      h1(`${esc(d.first_name || "Someone")} took the assessment.`) +
      rows([
        ["Name", d.first_name],
        ["Email", d.email],
        ["Dominant", profName(d.dominant_profile)],
        ["Secondary", secsStr],
        ["Vitality", d.vitality_score != null ? `${d.vitality_score}/100` : ""],
      ])
    ),
  };
}

/* ---------- Application ---------- */
export function applicantEmail(from, d) {
  return {
    from, to: d.email,
    subject: "Your application to the founding cohort",
    html: shell(
      eyebrow("Application received") +
      h1(`${esc(d.first_name || "Thanks")}, your application is in.`) +
      p("Thibault reviews every application personally. If it's a fit, you'll hear back by email within a few days with the next step, usually a short 1:1 debrief.") +
      p("In the meantime, if you haven't yet, it's worth seeing your invisible limits.") +
      button(`${SITE}/assessment`, "Take the assessment &rarr;")
    ),
  };
}
export function applicationNotifyEmail(from, to, d) {
  const name = `${d.first_name || ""} ${d.last_name || ""}`.trim();
  return {
    from, to, reply_to: d.email,
    subject: `New cohort application: ${name || "Someone"}${d.company ? ` (${d.company})` : ""}`,
    html: shell(
      eyebrow("New cohort application") +
      h1(`${esc(name || "New applicant")}`) +
      rows([
        ["Email", d.email],
        ["Company", d.company],
        ["Website", d.website],
        ["Revenue", d.revenue_stage],
      ]) +
      block("Where they feel the ceiling", d.ceiling || "") +
      (d.why_now ? block("Why now", d.why_now) : "") +
      (d.heard_from ? block("Heard about us via", d.heard_from) : "")
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
  if (req.method === "GET") return json({ ok: true, v: "emails-v3" }); // health/version probe, no send
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let d;
  try { d = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const KEY = process.env.RESEND_API_KEY;
  const FROM = process.env.FROM_EMAIL || "Founder Transformation <onboarding@resend.dev>";
  const NOTIFY = process.env.NOTIFY_EMAIL || "thibaultsagnier@gmail.com";

  if (!KEY) { console.warn("[notify] RESEND_API_KEY not set — skipping email"); return json({ ok: true, email: "skipped", v: "emails-v3" }); }
  if (!d.email) return json({ error: "missing email" }, 400);

  let messages;
  if (d.type === "assessment") messages = [assessmentLeadEmail(FROM, d), assessmentNotifyEmail(FROM, NOTIFY, d)];
  else if (d.type === "application") messages = [applicantEmail(FROM, d), applicationNotifyEmail(FROM, NOTIFY, d)];
  else return json({ error: "unknown type" }, 400);

  const results = await Promise.allSettled(messages.map(m => sendResend(KEY, m)));
  const failed = results.filter(r => r.status === "rejected");
  failed.forEach(f => console.error("[notify] send failed:", f.reason?.message || f.reason));

  return json({ ok: failed.length === 0, sent: results.length - failed.length, failed: failed.length, v: "emails-v3" });
};
