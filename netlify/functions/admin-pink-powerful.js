// Organiser-facing read/write access to vision.pink_powerful_registrations.
// vision_schema_v2_pink_powerful.sql deliberately grants anon/authenticated
// no SELECT/UPDATE/DELETE at all on that table — this function is the only
// place registrations are ever read or changed after the public form
// inserts them, gated the same way as the mentorship admin-*.js functions:
// the caller's own Supabase session must belong to an email on the
// ADMIN_EMAILS allowlist (netlify/functions/_lib/adminAuth.js).
//
// Requires the same two env vars as the mentorship admin-*.js functions
// (SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAILS) — already configured if those
// are working.
const { getAdminClient, requireAdmin } = require('./_lib/adminAuth');

const VALID_STATUSES = ['new', 'contacted', 'confirmed', 'declined', 'duplicate', 'archived'];

async function listAdminUsers(admin) {
  const allowlist = (process.env.ADMIN_EMAILS || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const organisers = [];
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    organisers.push(...data.users.filter(u => allowlist.includes((u.email || '').toLowerCase())));
    if (data.users.length < 200) break;
  }
  return organisers.map(u => ({ id: u.id, email: u.email }));
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 200, body: JSON.stringify({ error: 'Not configured — SUPABASE_SERVICE_ROLE_KEY missing' }) };
  }

  const admin = getAdminClient();
  const auth = await requireAdmin(event, admin);
  if (!auth.ok) {
    return { statusCode: auth.status, body: JSON.stringify({ error: auth.error }) };
  }

  try {
    const { action, registrationId, patch } = JSON.parse(event.body || '{}');

    if (action === 'list') {
      const [{ data: rows, error }, organisers] = await Promise.all([
        admin.schema('vision').from('pink_powerful_registrations')
          .select('*').order('created_at', { ascending: false }),
        listAdminUsers(admin),
      ]);
      if (error) throw error;

      const organiserById = new Map(organisers.map(o => [o.id, o.email]));
      const registrations = (rows || []).map(r => ({
        ...r,
        assigned_to_email: r.assigned_to ? (organiserById.get(r.assigned_to) || null) : null,
      }));

      const stats = {
        total: registrations.length,
        new: registrations.filter(r => r.status === 'new').length,
        contacted: registrations.filter(r => r.status === 'contacted').length,
        confirmed: registrations.filter(r => r.status === 'confirmed').length,
        declined: registrations.filter(r => r.status === 'declined').length,
        duplicate: registrations.filter(r => r.status === 'duplicate').length,
        archived: registrations.filter(r => r.status === 'archived').length,
        volunteering: registrations.filter(r => r.interest === 'volunteering').length,
        survivorStory: registrations.filter(r => r.interest === 'survivor-story').length,
        partnership: registrations.filter(r => r.interest === 'healthcare-partner' || r.interest === 'community-partner').length,
        sponsorship: registrations.filter(r => r.interest === 'sponsorship').length,
      };

      return { statusCode: 200, body: JSON.stringify({ registrations, organisers, stats }) };
    }

    if (action === 'update') {
      if (!registrationId || !patch || typeof patch !== 'object') {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing registrationId or patch' }) };
      }

      const update = { updated_at: new Date().toISOString() };

      if ('status' in patch) {
        if (!VALID_STATUSES.includes(patch.status)) {
          return { statusCode: 400, body: JSON.stringify({ error: 'Invalid status' }) };
        }
        update.status = patch.status;
        // Timestamp the transition automatically so organisers don't have
        // to also remember to set it — but never clobber an earlier
        // contacted_at/confirmed_at if the status is later changed again.
        if (patch.status === 'contacted') update.contacted_at = new Date().toISOString();
        if (patch.status === 'confirmed') update.confirmed_at = new Date().toISOString();
      }
      if ('internal_notes' in patch) {
        update.internal_notes = typeof patch.internal_notes === 'string' ? patch.internal_notes.slice(0, 4000) : null;
      }
      if ('assigned_to' in patch) {
        update.assigned_to = patch.assigned_to || null;
      }

      if (Object.keys(update).length === 1) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Nothing to update' }) };
      }

      const { error } = await admin.schema('vision').from('pink_powerful_registrations')
        .update(update).eq('id', registrationId);
      if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) };
  } catch (error) {
    // Log server-side only — never return raw Supabase/internal errors to
    // the caller (same reasoning as the public form's error handling).
    console.error('admin-pink-powerful failed:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Something went wrong. Please try again.' }) };
  }
};
