// Emails a mentee when their mentor sends them a nudge via
// mentorship.messages (mentor-portal/mentee-detail.html). The database
// row is already saved by the time this runs — a failure here never
// loses the message, it just means the mentee doesn't get an email
// about it; they'll still see it next time they open their dashboard.
//
// Reuses the same RESEND_API_KEY as notify-help-request.js — no new env
// var needed, since the recipient here is the mentee's own address
// (looked up server-side via the admin API), not a fixed org inbox.
//
// No SMS path yet: there's no phone-number field anywhere in the
// mentorship schema and no SMS provider wired into this repo. Email-first
// was the deliberate choice (2026-08-07) until a provider is picked and a
// phone-collection flow exists.
const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
const { getAdminClient } = require('./_lib/adminAuth');

const SUPABASE_URL = 'https://ygtsrdwoikqnrbexjrtl.supabase.co';
// Same public anon/publishable key already hardcoded client-side in
// assets/supabase.js — safe to embed here too, it's designed to be public.
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
  const { data: { user: mentor }, error: authErr } = await anon.auth.getUser(token);
  if (authErr || !mentor) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session' }) };
  }

  let studentId, body;
  try {
    ({ studentId, body } = JSON.parse(event.body || '{}'));
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }
  if (!studentId || !body) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing studentId or body' }) };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.RESEND_API_KEY) {
    // Don't fail the request the mentor made — the message row is already
    // saved regardless of whether this fires. Same graceful-degrade
    // philosophy as notify-help-request.js.
    console.warn('SUPABASE_SERVICE_ROLE_KEY or RESEND_API_KEY not set — skipping nudge notification email.');
    return { statusCode: 200, body: JSON.stringify({ sent: false, reason: 'not configured' }) };
  }

  try {
    const admin = getAdminClient();

    // Re-verify the assignment server-side. mentorship.messages' own
    // INSERT policy already enforced this on the write itself, but this
    // is a separate call the client could otherwise invoke with any
    // studentId — never trust the request body for authorization.
    const { data: assignment } = await admin.schema('mentorship').from('mentor_assignments')
      .select('student_name').eq('mentor_id', mentor.id).eq('student_id', studentId).eq('status', 'active').maybeSingle();
    if (!assignment) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Not an active mentee of yours' }) };
    }

    const { data: { user: student }, error: studentErr } = await admin.auth.admin.getUserById(studentId);
    if (studentErr || !student?.email) {
      return { statusCode: 200, body: JSON.stringify({ sent: false, reason: 'mentee has no email on file' }) };
    }

    const mentorName = mentor.user_metadata?.full_name || 'Your Mentor';
    const resend = new Resend(process.env.RESEND_API_KEY);

    const { data, error } = await resend.emails.send({
      // Resend's plan only covers one verified sending domain, already
      // used by inspireacademic.org — same as notify-help-request.js.
      from: 'Inspire Mentorship <noreply@inspireacademic.org>',
      to: student.email,
      subject: `💬 ${mentorName} sent you a message`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #0A1628; color: white; padding: 24px 20px; border-radius: 8px 8px 0 0; }
    .header .tag { display:inline-block; background:#B85C1A; color:#fff; font-size:12px; font-weight:700; padding:4px 10px; border-radius:999px; margin-bottom:8px; }
    .content { background: #fff; padding: 24px 20px; border: 1px solid #eee; border-top: none; border-radius: 0 0 8px 8px; }
    .message-box { background: #f8f9fa; padding: 16px; border-left: 4px solid #B85C1A; margin: 16px 0; white-space: pre-wrap; }
    .meta { color: #666; font-size: 13px; }
    .cta { display:inline-block; margin-top:8px; background:#B85C1A; color:#fff !important; text-decoration:none; padding:10px 18px; border-radius:8px; font-weight:700; font-size:14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="tag">Message from your mentor</div>
      <div style="font-size:20px; font-weight:700">${mentorName} checked in with you</div>
    </div>
    <div class="content">
      <div class="message-box">${(body || '').replace(/</g, '&lt;')}</div>
      <p class="meta">Log in to reply or see more from your mentor.</p>
      <a class="cta" href="https://www.inspirevision.org/mentorship/dashboard/mentor.html">View on your dashboard</a>
    </div>
  </div>
</body>
</html>
      `,
    });

    if (error) throw error;

    return { statusCode: 200, body: JSON.stringify({ sent: true, messageId: data.id }) };
  } catch (error) {
    console.error('notify-mentor-message failed:', error);
    // Still 200 — the database insert already succeeded on the client
    // side; a failed notification shouldn't surface as an error to the mentor.
    return { statusCode: 200, body: JSON.stringify({ sent: false, error: error.message }) };
  }
};
