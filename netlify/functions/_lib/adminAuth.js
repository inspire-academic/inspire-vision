// Shared by every admin-* Netlify Function. Verifies the caller's own
// Supabase access token, then checks their email against ADMIN_EMAILS
// before any service-role action runs. Kept in one place rather than
// copy-pasted per function so the security check can't quietly drift
// between them.
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ygtsrdwoikqnrbexjrtl.supabase.co';

function getAdminClient() {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function requireAdmin(event, admin) {
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return { ok: false, status: 401, error: 'Missing Authorization header' };

  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return { ok: false, status: 401, error: 'Invalid or expired session' };

  const allowlist = (process.env.ADMIN_EMAILS || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (!allowlist.includes((user.email || '').toLowerCase())) {
    return { ok: false, status: 403, error: 'Not authorized' };
  }
  return { ok: true, user };
}

module.exports = { getAdminClient, requireAdmin };
