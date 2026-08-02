// Sends the organiser notification + registrant confirmation email for the
// Pink & Powerful (Brovelyn Childcare Services x Inspire Health & Wellbeing)
// registration form (pages/pink-powerful-registration.html).
//
// Deliberately does NOT touch Supabase — the registration row is already
// saved by the time this runs (the browser inserts directly into
// vision.pink_powerful_registrations, same client-insert-then-notify
// pattern as mentorship/dashboard/prayer-support.html + notify-help-request.js).
// A failure here never loses the registration, it just means nobody got
// emailed about it.
//
// Unlike notify-help-request.js, this endpoint is deliberately public/
// unauthenticated — the registrant has no account and no session to prove
// who they are, so there is no bearer token to check. The honeypot field
// on the form (and this function's own field-length/shape validation) is
// the only abuse mitigation short of adding CAPTCHA, which has not been
// introduced here (see docs/pink-powerful/README.md for the tradeoff).
//
// Requires two env vars in Netlify's dashboard (Site settings ->
// Environment variables), neither of which exist yet:
//   RESEND_API_KEY            — reuse Academic's if you have one
//   PINK_POWERFUL_NOTIFY_EMAIL — where the organiser alert should land
const { Resend } = require('resend');

const INTEREST_LABEL = {
  attending: 'Attending the event',
  'survivor-story': 'Sharing my story',
  volunteering: 'Volunteering',
  'healthcare-partner': 'Healthcare partnership',
  sponsorship: 'Sponsorship or fundraising',
  'community-partner': 'Community partnership',
  updates: 'Receiving event updates',
  other: 'Other',
};

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Cheap shape check, not full RFC validation — the database's own CHECK
// constraint is the real gate for what gets stored; this just stops
// obviously-malformed input from being used to compose an email.
function looksLikeEmail(str) {
  return typeof str === 'string' && str.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  if (!process.env.RESEND_API_KEY || !process.env.PINK_POWERFUL_NOTIFY_EMAIL) {
    // Don't fail the registrant's request — the row is already saved
    // regardless of whether this function is configured.
    console.warn('RESEND_API_KEY or PINK_POWERFUL_NOTIFY_EMAIL not set — skipping notification email.');
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
  const location = String(payload.location || '').trim().slice(0, 100);
  const interest = INTEREST_LABEL[payload.interest] ? payload.interest : 'other';
  const marketingConsent = payload.marketingConsent === true;

  if (!fullName || !looksLikeEmail(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid fullName/email' }) };
  }

  const registeredAt = new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/London' });

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    // 1. Organiser notification — internal, not shown to the registrant.
    const organiserSend = resend.emails.send({
      from: 'Inspire Health & Wellbeing <noreply@inspireacademic.org>',
      to: process.env.PINK_POWERFUL_NOTIFY_EMAIL,
      subject: `New Pink & Powerful registration: ${fullName}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4b174f; color: #fff; padding: 24px 20px; border-radius: 8px 8px 0 0; }
    .header .tag { display:inline-block; background:#e61f78; color:#fff; font-size:12px; font-weight:700; padding:4px 10px; border-radius:999px; margin-bottom:8px; }
    .content { background: #fff; padding: 24px 20px; border: 1px solid #eee; border-top: none; border-radius: 0 0 8px 8px; }
    .row { margin: 6px 0; font-size: 14px; }
    .row strong { color: #4b174f; display:inline-block; min-width: 140px; }
    .meta { color: #666; font-size: 12px; margin-top: 18px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="tag">Pink &amp; Powerful 2026</div>
      <div style="font-size:20px; font-weight:700">New registration of interest</div>
    </div>
    <div class="content">
      <div class="row"><strong>Name:</strong> ${escapeHtml(fullName)}</div>
      <div class="row"><strong>Email:</strong> ${escapeHtml(email)}</div>
      <div class="row"><strong>Phone:</strong> ${phone ? escapeHtml(phone) : 'Not provided'}</div>
      <div class="row"><strong>Location:</strong> ${escapeHtml(location) || 'Not provided'}</div>
      <div class="row"><strong>Interest:</strong> ${escapeHtml(INTEREST_LABEL[interest])}</div>
      <div class="row"><strong>Marketing consent:</strong> ${marketingConsent ? 'Yes' : 'No'}</div>
      <div class="row"><strong>Registered:</strong> ${registeredAt}</div>
      <p class="meta">Saved to vision.pink_powerful_registrations. Review, assign and act on it in the admin dashboard: https://inspirevision.org/admin/pink-powerful/registrations</p>
    </div>
  </div>
</body>
</html>
      `,
    });

    // 2. Registrant confirmation — best-effort, and not allowed to block or
    // fail the organiser notification above.
    const registrantSend = resend.emails.send({
      from: 'Inspire Health & Wellbeing <noreply@inspireacademic.org>',
      to: email,
      subject: 'Thank you for registering your interest in Pink & Powerful',
      html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #e61f78; color: #fff; padding: 24px 20px; border-radius: 8px 8px 0 0; text-align:center; }
    .content { background: #fff; padding: 24px 20px; border: 1px solid #eee; border-top: none; border-radius: 0 0 8px 8px; }
    .meta { color: #666; font-size: 12px; margin-top: 18px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><div style="font-size:22px; font-weight:700">Pink &amp; Powerful</div><div style="margin-top:4px">Stories. Support. Hope.</div></div>
    <div class="content">
      <p>Hi ${escapeHtml(fullName)},</p>
      <p>Thank you for registering your interest in <strong>Pink &amp; Powerful</strong> — Saturday 18 October 2026.</p>
      <p>We've recorded your interest and will be in touch when venue and full programme details are confirmed.</p>
      <p>With thanks,<br>Brovelyn Childcare Services &amp; Inspire Health &amp; Wellbeing</p>
      <p class="meta">You're receiving this because you registered at inspirevision.org/pink-powerful-registration. This email confirms your event-contact registration only${marketingConsent ? ' and your opt-in for further updates' : ''}.</p>
    </div>
  </div>
</body>
</html>
      `,
    });

    const [organiserResult, registrantResult] = await Promise.allSettled([organiserSend, registrantSend]);

    if (organiserResult.status === 'rejected' || organiserResult.value?.error) {
      console.error('Pink & Powerful organiser notification failed:', organiserResult.reason || organiserResult.value?.error);
    }
    if (registrantResult.status === 'rejected' || registrantResult.value?.error) {
      console.error('Pink & Powerful registrant confirmation failed:', registrantResult.reason || registrantResult.value?.error);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        sent: organiserResult.status === 'fulfilled' && !organiserResult.value?.error,
        confirmationSent: registrantResult.status === 'fulfilled' && !registrantResult.value?.error,
      }),
    };
  } catch (error) {
    console.error('notify-pink-powerful failed:', error);
    // Still 200 — the database insert already succeeded on the client
    // side; a failed notification shouldn't surface as an error to the
    // registrant.
    return { statusCode: 200, body: JSON.stringify({ sent: false, error: error.message }) };
  }
};
