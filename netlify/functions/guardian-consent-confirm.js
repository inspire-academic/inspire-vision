// Public confirmation link a parent/guardian clicks from the email
// guardian-consent-request.js sends. Deliberately unauthenticated,
// unlike every other service-role function in this codebase — the
// guardian has no Supabase account of their own to sign in with. The
// only thing reachable through this endpoint is flipping ONE row's
// status from 'pending' to 'confirmed', gated on a SHA-256 match against
// a random token that only ever existed in the guardian's own emailed
// link (see mentorship_schema_v7_guardian_consent.sql for why the
// mentee themselves can never read or replay it).
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = 'https://ygtsrdwoikqnrbexjrtl.supabase.co';

function page(title, message, ok) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — Inspire Mentorship</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background:#0A1628; color:#f4f6f9; min-height:100vh; margin:0; display:grid; place-items:center; padding:20px }
  .card { max-width:440px; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.1); border-radius:16px; padding:36px 32px; text-align:center }
  .icon { font-size:40px; margin-bottom:12px }
  h1 { font-size:20px; margin:0 0 12px }
  p { color:rgba(244,246,249,.75); font-size:14px; line-height:1.6; margin:0 }
</style></head>
<body><div class="card"><div class="icon">${ok ? '✅' : '⚠️'}</div><h1>${title}</h1><p>${message}</p></div></body></html>`,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return page('Not configured', 'This confirmation link cannot be processed right now — please contact us directly.', false);
  }

  const sid = event.queryStringParameters?.sid;
  const t = event.queryStringParameters?.t;
  if (!sid || !t) {
    return page('Invalid link', 'This confirmation link is missing information and cannot be used.', false);
  }

  const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: row, error } = await admin.schema('mentorship').from('guardian_consents')
      .select('id, status, consent_token_hash')
      .eq('student_id', sid)
      .maybeSingle();
    if (error) throw error;
    if (!row) {
      return page('Invalid link', "We couldn't find a matching consent request. It may be incorrect, or the account may no longer exist.", false);
    }
    if (row.status === 'confirmed') {
      return page('Already confirmed', "This has already been confirmed — thank you, there's nothing more to do.", true);
    }

    const providedHash = Buffer.from(crypto.createHash('sha256').update(t).digest('hex'));
    const storedHash = Buffer.from(row.consent_token_hash);
    const matches = providedHash.length === storedHash.length && crypto.timingSafeEqual(providedHash, storedHash);
    if (!matches) {
      return page('Invalid link', 'This confirmation link is invalid or has expired.', false);
    }

    const { error: updateErr } = await admin.schema('mentorship').from('guardian_consents')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', row.id);
    if (updateErr) throw updateErr;

    return page('Thank you', "You've confirmed you're aware of and support this mentorship journey. A mentor can now be matched.", true);
  } catch (err) {
    console.error('guardian-consent-confirm failed:', err);
    return page('Something went wrong', 'Please try again shortly, or contact us directly if the problem continues.', false);
  }
};
