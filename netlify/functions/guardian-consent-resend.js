// Lets a mentee resend their OWN guardian consent email if the original
// was lost, missed, or spam-filtered. Auth pattern: caller identity is
// verified from their own token (same as notify-help-request.js /
// guardian-consent-request.js) — any authenticated user may call this
// for themselves, no admin gate needed.
//
// The actual row update needs service-role, though, unlike
// guardian-consent-request.js: mentorship.guardian_consents
// intentionally has NO client UPDATE grant at all (mentorship_schema_v7
// /_v8). If a mentee could update their own row, they could set their
// own token hash and immediately self-confirm via
// guardian-consent-confirm.js — exactly the self-approval hole this
// whole feature exists to prevent. The service-role client below is
// scoped to the caller's OWN row by an explicit .eq('student_id',
// user.id) filter in server-side code — it removes the missing grant,
// not the "which row" restriction.
//
// The original raw token was never stored anywhere (by design) — only
// its hash — so a resend can't reuse the old link. It mints a fresh
// token and rotates the stored hash, which also invalidates whatever
// link was already sent. That's the correct default for a "didn't
// arrive" resend anyway.
const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = 'https://ygtsrdwoikqnrbexjrtl.supabase.co';
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

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.RESEND_API_KEY) {
    console.warn('SUPABASE_SERVICE_ROLE_KEY or RESEND_API_KEY not set — skipping resend.');
    return { statusCode: 200, body: JSON.stringify({ sent: false, reason: 'not configured' }) };
  }

  const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: row, error: fetchErr } = await admin.schema('mentorship').from('guardian_consents')
      .select('id, status, guardian_name, guardian_email')
      .eq('student_id', user.id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!row) return { statusCode: 404, body: JSON.stringify({ error: 'No guardian consent request found for this account' }) };
    if (row.status === 'confirmed') {
      return { statusCode: 200, body: JSON.stringify({ sent: false, reason: 'already confirmed' }) };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const { error: updateErr } = await admin.schema('mentorship').from('guardian_consents')
      .update({ consent_token_hash: tokenHash, requested_at: new Date().toISOString() })
      .eq('id', row.id);
    if (updateErr) throw updateErr;

    const studentName = user.user_metadata?.full_name || user.email || 'your child';
    const host = event.headers['x-forwarded-host'] || event.headers.host;
    const confirmUrl = `https://${host}/.netlify/functions/guardian-consent-confirm?sid=${encodeURIComponent(user.id)}&t=${encodeURIComponent(rawToken)}`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: 'Inspire Mentorship <noreply@inspireacademic.org>',
      to: row.guardian_email,
      subject: `Reminder: please confirm — ${studentName} has joined Inspire Mentorship`,
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
      <p>Hello${row.guardian_name ? ' ' + row.guardian_name.replace(/</g, '&lt;') : ''},</p>
      <p>This is a reminder — <strong>${studentName.replace(/</g, '&lt;')}</strong> signed up for Inspire Mentorship and told us you're their parent or guardian. We haven't heard back yet.</p>
      <p>Before we pair ${studentName.replace(/</g, '&lt;')} with a mentor, we ask you to confirm you're aware of and support their participation.</p>
      <p style="text-align:center"><a class="btn" href="${confirmUrl}">Confirm I'm aware and support this</a></p>
      <p class="meta">If you weren't expecting this email or don't recognise this request, you can safely ignore it — no mentor will be assigned without this confirmation. Any earlier confirmation link we sent is no longer valid; please use this one.</p>
    </div>
  </div>
</body>
</html>
      `,
    });

    if (error) throw error;
    return { statusCode: 200, body: JSON.stringify({ sent: true, messageId: data.id }) };
  } catch (error) {
    console.error('guardian-consent-resend failed:', error);
    return { statusCode: 200, body: JSON.stringify({ sent: false, error: error.message }) };
  }
};
