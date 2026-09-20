// Auth for the Children's Service people/roles function. Unlike adminAuth.js (a fixed
// email allowlist for site-wide staff), access here is PER CHURCH and comes from the
// database: the caller must hold an ACTIVE `church_admin` row in
// children_service.church_members for the church in question. The browser can claim
// nothing: we verify the caller's own Supabase access token, then look the role up
// with the service-role client.
const { getAdminClient } = require('./adminAuth');

const DEFAULT_CHURCH_SLUG = 'inspire';

async function requireChurchAdmin(event, admin, churchSlug) {
  const authHeader = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return { ok: false, status: 401, error: 'Missing Authorization header' };

  const { data, error } = await admin.auth.getUser(token);
  const user = data && data.user;
  if (error || !user) return { ok: false, status: 401, error: 'Invalid or expired session' };

  const cs = admin.schema('children_service');
  const ch = await cs.from('churches').select('id,slug,name').eq('slug', churchSlug || DEFAULT_CHURCH_SLUG).maybeSingle();
  if (ch.error || !ch.data) return { ok: false, status: 404, error: 'Church not found' };

  const m = await cs.from('church_members').select('id')
    .eq('church_id', ch.data.id).eq('user_id', user.id).eq('role', 'church_admin').eq('status', 'active');
  if (m.error) return { ok: false, status: 500, error: 'Could not check your role' };
  if (!(m.data || []).length) return { ok: false, status: 403, error: 'Not authorized' };
  return { ok: true, user, church: ch.data };
}

module.exports = { getAdminClient, requireChurchAdmin, DEFAULT_CHURCH_SLUG };
