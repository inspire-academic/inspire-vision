// Sends the organiser notification email for a Lords Consult "Idea to
// Impact" diagnostic lead (Tenants/lords-consult/index.html).
//
// Deliberately does NOT touch Supabase — the lead row is already saved by
// the time this runs (the browser inserts directly into
// lords_consult.leads, same client-insert-then-notify pattern as
// notify-pink-powerful.js / notify-help-request.js). A failure here never
// loses the lead, it just means nobody got emailed about it.
//
// Public/unauthenticated like notify-pink-powerful.js — the visitor has no
// account or session to prove who they are. The honeypot field on the form
// plus this function's own field-length/shape validation is the only abuse
// mitigation short of CAPTCHA.
//
// Requires two env vars in Netlify's dashboard (Site settings ->
// Environment variables), neither of which exist yet:
//   RESEND_API_KEY               — reuse the existing key
//   LORDS_CONSULT_NOTIFY_EMAIL   — where the organiser alert should land
const { Resend } = require('resend');

const RESULT_FAMILY_LABEL = {
  commercial_business: 'Commercial Business Route',
  social_enterprise_cic: 'Social Enterprise / CIC Route',
  charity_cio: 'Charity / CIO Route',
  pilot_first: 'Pilot-First Route',
  specialist_review: 'Specialist Review Required',
};

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Cheap shape check, not full RFC validation — the database's own NOT NULL
// constraint is the real gate for what gets stored; this just stops
// obviously-malformed input from being used to compose an email.
function looksLikeEmail(str) {
  return typeof str === 'string' && str.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  if (!process.env.RESEND_API_KEY || !process.env.LORDS_CONSULT_NOTIFY_EMAIL) {
    // Don't fail the visitor's request — the row is already saved
    // regardless of whether this function is configured.
    console.warn('RESEND_API_KEY or LORDS_CONSULT_NOTIFY_EMAIL not set — skipping notification email.');
    return { statusCode: 200, body: JSON.stringify({ sent: false, reason: 'not configured' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const fullName = String(payload.fullName || '').trim().slice(0, 120);
  const email = String(payload.email || '').trim().toLowerCase().slice(0, 254);
  const phone = String(payload.phone || '').trim().slice(0, 40);
  const resultFamily = RESULT_FAMILY_LABEL[payload.resultFamily] || String(payload.resultFamily || 'Unknown');
  const structureLabel = String(payload.structureLabel || '').trim().slice(0, 100);
  const readinessLabel = String(payload.readinessLabel || '').trim().slice(0, 100);
  const marketingConsent = payload.marketingConsent === true;

  if (!fullName || !looksLikeEmail(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid fullName/email' }) };
  }

  const submittedAt = new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/London' });

  // Same comma-separated-list convention as ADMIN_EMAILS
  // (netlify/functions/_lib/adminAuth.js) — lets more than one adviser
  // receive the alert without hardcoding any address in source.
  const notifyEmails = process.env.LORDS_CONSULT_NOTIFY_EMAIL
    .split(',').map((e) => e.trim()).filter(Boolean);

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    const { data, error } = await resend.emails.send({
      from: 'Lords Consult Diagnostic <noreply@inspireacademic.org>',
      to: notifyEmails,
      subject: `New Idea to Impact lead: ${fullName} (${resultFamily})`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #0e2e4a; color: #fff; padding: 24px 20px; border-radius: 8px 8px 0 0; }
    .header .tag { display:inline-block; background:#bb8317; color:#fff; font-size:12px; font-weight:700; padding:4px 10px; border-radius:999px; margin-bottom:8px; }
    .content { background: #fff; padding: 24px 20px; border: 1px solid #eee; border-top: none; border-radius: 0 0 8px 8px; }
    .row { margin: 6px 0; font-size: 14px; }
    .row strong { color: #0e2e4a; display:inline-block; min-width: 140px; }
    .meta { color: #666; font-size: 12px; margin-top: 18px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="tag">Idea to Impact</div>
      <div style="font-size:20px; font-weight:700">New diagnostic lead</div>
    </div>
    <div class="content">
      <div class="row"><strong>Name:</strong> ${escapeHtml(fullName)}</div>
      <div class="row"><strong>Email:</strong> ${escapeHtml(email)}</div>
      <div class="row"><strong>Phone:</strong> ${phone ? escapeHtml(phone) : 'Not provided'}</div>
      <div class="row"><strong>Result:</strong> ${escapeHtml(resultFamily)}</div>
      <div class="row"><strong>Structure fit:</strong> ${escapeHtml(structureLabel)}</div>
      <div class="row"><strong>Readiness stage:</strong> ${escapeHtml(readinessLabel)}</div>
      <div class="row"><strong>Marketing consent:</strong> ${marketingConsent ? 'Yes' : 'No'}</div>
      <div class="row"><strong>Submitted:</strong> ${submittedAt}</div>
      <p class="meta">Saved to lords_consult.leads. There is no adviser dashboard yet (Phase 2) — query this table directly in Supabase to review responses and follow up.</p>
    </div>
  </div>
</body>
</html>
      `,
    });

    if (error) {
      console.error('Lords Consult lead notification failed:', error);
      return { statusCode: 200, body: JSON.stringify({ sent: false, error: error.message }) };
    }

    return { statusCode: 200, body: JSON.stringify({ sent: true, id: data?.id }) };
  } catch (error) {
    console.error('notify-lords-consult-lead failed:', error);
    // Still 200 — the database insert already succeeded on the client
    // side; a failed notification shouldn't surface as an error to the lead.
    return { statusCode: 200, body: JSON.stringify({ sent: false, error: error.message }) };
  }
};
