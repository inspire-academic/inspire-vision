// Emails the project owner when someone submits "Join the Movement" on
// living-language/get-involved.html. This is the 90-day validation
// waitlist (see the Krobo market-research doc's own success metric:
// "500+ sign-ups without paid mass advertising") — the submission is
// already saved client-side via LivingLanguageStore (localStorage), but
// that alone can't be counted in aggregate since it never leaves the
// visitor's own browser. This function is the channel that actually
// reaches the owner.
//
// Public, unauthenticated form (no login exists on the marketing site),
// so unlike notify-help-request.js / notify-mentor-message.js there is no
// Supabase session to verify. A hidden honeypot field is used instead of
// auth to filter trivial bots.
//
// Requires two env vars in Netlify's dashboard (Site settings ->
// Environment variables):
//   RESEND_API_KEY               — already used by the other notify-*.js
//                                   functions in this repo, reuse it
//   LIVING_LANGUAGE_NOTIFY_EMAIL — where these leads should land
// Neither existing means this silently no-ops (submission is still saved
// locally and the visitor still sees the thank-you screen) — same
// graceful-degrade pattern as notify-help-request.js.
const { Resend } = require('resend');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { name, email, message, company } = payload;

  // Honeypot: real visitors never fill in this hidden field.
  if (company) {
    return { statusCode: 200, body: JSON.stringify({ sent: false, reason: 'filtered' }) };
  }
  if (!name || !email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing name or email' }) };
  }

  const notifyEmail = process.env.LIVING_LANGUAGE_NOTIFY_EMAIL;
  if (!notifyEmail || !process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY or LIVING_LANGUAGE_NOTIFY_EMAIL not set — skipping notification email.');
    return { statusCode: 200, body: JSON.stringify({ sent: false, reason: 'not configured' }) };
  }
  // Comma-separated list supported (e.g. "a@x.org,b@y.com") — Resend
  // needs an actual array to deliver to more than one recipient.
  const notifyRecipients = notifyEmail.split(',').map(e => e.trim()).filter(Boolean);

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      // Same shared verified sending domain used by the mentorship
      // notify-*.js functions, until inspirevision.org gets its own.
      from: 'The Living Language Project <noreply@inspireacademic.org>',
      to: notifyRecipients,
      subject: `Join the Movement — new signup from ${name}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #123521; color: white; padding: 24px 20px; border-radius: 8px 8px 0 0; }
    .content { background: #fff; padding: 24px 20px; border: 1px solid #eee; border-top: none; border-radius: 0 0 8px 8px; }
    .message-box { background: #f8f9fa; padding: 16px; border-left: 4px solid #B85C1A; margin: 16px 0; white-space: pre-wrap; }
    .meta { color: #666; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div style="font-size:20px; font-weight:700">100 Voices of Krobo — Join the Movement</div>
    </div>
    <div class="content">
      <p class="meta">From: <strong>${(name || '').replace(/</g, '&lt;')}</strong> (${(email || '').replace(/</g, '&lt;')})</p>
      ${message ? `<div class="message-box">${message.replace(/</g, '&lt;')}</div>` : ''}
      <p class="meta">Submitted via living-language/get-involved.html.</p>
    </div>
  </div>
</body>
</html>
      `,
    });

    if (error) throw error;

    return { statusCode: 200, body: JSON.stringify({ sent: true, messageId: data.id }) };
  } catch (error) {
    console.error('notify-join-movement failed:', error);
    return { statusCode: 200, body: JSON.stringify({ sent: false, error: error.message }) };
  }
};
