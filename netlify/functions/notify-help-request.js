// Sends an email alert when a mentee submits Ask for Help / Prayer & Support.
// The database row (mentorship.help_requests) is already saved by the time
// this runs — a failure here never loses the submission, it just means
// nobody got pinged about it. Requires two env vars in Netlify's dashboard
// (Site settings -> Environment variables), neither of which exist yet:
//   RESEND_API_KEY          — reuse Academic's if you have one, or grab a
//                              new one from resend.com
//   HELP_REQUEST_NOTIFY_EMAIL — where these alerts should land
const { Resend } = require('resend');

const CATEGORY_LABEL = {
  prayer: 'Prayer request',
  general: 'Support request',
  urgent: 'URGENT',
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const notifyEmail = process.env.HELP_REQUEST_NOTIFY_EMAIL;
  if (!notifyEmail || !process.env.RESEND_API_KEY) {
    // Don't fail the request the mentee made — just log it. The row is
    // already saved in the database regardless of whether this fires.
    // The Resend client is only constructed below, once we know a key
    // exists — its constructor throws on a missing key, which previously
    // crashed the whole function at module load (every invocation 502'd).
    console.warn('RESEND_API_KEY or HELP_REQUEST_NOTIFY_EMAIL not set — skipping notification email.');
    return { statusCode: 200, body: JSON.stringify({ sent: false, reason: 'not configured' }) };
  }

  try {
    const { category, message, studentEmail, studentName } = JSON.parse(event.body || '{}');
    if (!message) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing message' }) };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const label = CATEGORY_LABEL[category] || 'Support request';
    const urgent = category === 'urgent';

    const { data, error } = await resend.emails.send({
      from: 'Inspire Mentorship <noreply@inspirevision.org>',
      to: notifyEmail,
      subject: `${urgent ? '🚨 URGENT — ' : ''}${label} from ${studentName || studentEmail || 'a mentee'}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #0A1628; color: white; padding: 24px 20px; border-radius: 8px 8px 0 0; }
    .header .tag { display:inline-block; background:${urgent ? '#dc2626' : '#B85C1A'}; color:#fff; font-size:12px; font-weight:700; padding:4px 10px; border-radius:999px; margin-bottom:8px; }
    .content { background: #fff; padding: 24px 20px; border: 1px solid #eee; border-top: none; border-radius: 0 0 8px 8px; }
    .message-box { background: #f8f9fa; padding: 16px; border-left: 4px solid #B85C1A; margin: 16px 0; white-space: pre-wrap; }
    .meta { color: #666; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="tag">${label}</div>
      <div style="font-size:20px; font-weight:700">New submission — Mentorship dashboard</div>
    </div>
    <div class="content">
      <p class="meta">From: <strong>${studentName || 'Not provided'}</strong> (${studentEmail || 'no email on record'})</p>
      <div class="message-box">${(message || '').replace(/</g, '&lt;')}</div>
      <p class="meta">This was also saved to mentorship.help_requests in Supabase.</p>
    </div>
  </div>
</body>
</html>
      `,
    });

    if (error) throw error;

    return { statusCode: 200, body: JSON.stringify({ sent: true, messageId: data.id }) };
  } catch (error) {
    console.error('notify-help-request failed:', error);
    // Still 200 — the database insert already succeeded on the client side;
    // a failed notification shouldn't surface as an error to the mentee.
    return { statusCode: 200, body: JSON.stringify({ sent: false, error: error.message }) };
  }
};
