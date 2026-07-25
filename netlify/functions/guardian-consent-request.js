// Sends the guardian consent confirmation email for an under-18 mentee's
// signup. Same auth pattern as notify-help-request.js: any caller with
// their own valid Supabase session may call this (not admin-gated -- a
// mentee requesting their own guardian's confirmation is the same trust
// level as submitting a help request), and the caller's identity is
// verified server-side from the token, never trusted from the request
// body.
//
// This function never touches the database and needs no service-role
// key -- mentorship/join.html already inserted the guardian_consents row
// itself (the student's own INSERT, RLS-permitted) with a HASHED token
// before calling this. This function only composes and sends the email
// containing the raw token, which exists only in the browser's memory
// until this call and is never stored anywhere server-side.
//
// Requires the same RESEND_API_KEY already configured for
// notify-help-request.js.
const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ygtsrdwoikqnrbexjrtl.supabase.co';
// Same public anon/publishable key already hardcoded client-side in
// assets/supabase.js -- safe to embed here too, it's designed to be public.
const SUPABASE_ANON_KEY = 'sb_publishable_XxmrO4J18iyQ1Srub73BhQ_FBhd8mXR';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Missing Authorization header' }) };
  }
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error: authErr } = await anon.auth.getUser(token);
  if (authErr || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session' }) };
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping guardian consent email.');
    return { statusCode: 200, body: JSON.stringify({ sent: false, reason: 'not configured' }) };
  }

  try {
    const { guardianName, guardianEmail, consentToken } = JSON.parse(event.body || '{}');
    if (!guardianEmail || !consentToken) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing guardianEmail or consentToken' }) };
    }
    const studentName = user.user_metadata?.full_name || user.email || 'your child';

    // Derived from the request, not trusted from the client body, so the
    // confirm link always points at whichever deploy actually sent it
    // (staging vs. production) without a spoofable "redirectTo" param.
    const host = event.headers['x-forwarded-host'] || event.headers.host;
    const confirmUrl = `https://${host}/.netlify/functions/guardian-consent-confirm?sid=${encodeURIComponent(user.id)}&t=${encodeURIComponent(consentToken)}`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      // Same verified-domain constraint as notify-help-request.js.
      from: 'Inspire Mentorship <noreply@inspireacademic.org>',
      to: guardianEmail,
      subject: `Please confirm: ${studentName} has joined Inspire Mentorship`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #0A1628; color: white; padding: 24px 20px; border-radius: 8px 8px 0 0; }
    .content { background: #fff; padding: 24px 20px; border: 1px solid #eee; border-top: none; border-radius: 0 0 8px 8px; }
    .btn { display: inline-block; background: #B85C1A; color: #fff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; margin: 16px 0; }
    .meta { color: #666; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div style="font-size:20px; font-weight:700">Inspire Mentorship</div>
    </div>
    <div class="content">
      <p>Hello${guardianName ? ' ' + guardianName.replace(/</g, '&lt;') : ''},</p>
      <p><strong>${studentName.replace(/</g, '&lt;')}</strong> has signed up for Inspire Mentorship and told us you're their parent or guardian.</p>
      <p>Inspire Mentorship pairs young people with a vetted, safeguarding-checked adult mentor for character and faith-based formation. Before we pair ${studentName.replace(/</g, '&lt;')} with a mentor, we ask you to confirm you're aware of and support their participation.</p>
      <p style="text-align:center"><a class="btn" href="${confirmUrl}">Confirm I'm aware and support this</a></p>
      <p class="meta">If you weren't expecting this email or don't recognise this request, you can safely ignore it — no mentor will be assigned without this confirmation.</p>
    </div>
  </div>
</body>
</html>
      `,
    });

    if (error) throw error;
    return { statusCode: 200, body: JSON.stringify({ sent: true, messageId: data.id }) };
  } catch (error) {
    console.error('guardian-consent-request failed:', error);
    // Same reasoning as notify-help-request.js: the account/signup already
    // succeeded regardless of whether this email fires, so this stays a 200.
    return { statusCode: 200, body: JSON.stringify({ sent: false, error: error.message }) };
  }
};
