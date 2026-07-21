// Safeguarding queue for mentorship.help_requests (Ask for Help / Prayer &
// Support submissions). Fixes F-03 (docs/mentorship/FOUNDER-E2E-ROUND-TRIP-REPORT.md):
// help_requests RLS is owner-only (a student can read only their own row),
// so until this function existed there was no in-app way for anyone to
// review these at all — the only distribution mechanism was the
// unauthenticated notify-help-request.js email side-channel. This function
// is the one place service-role is used to read across students, gated the
// same way as admin-mentors.js/admin-matching.js: it touches potentially
// sensitive disclosures (bullying, mental health, home situation) from
// minors, so it is not something to leave open.
//
// Requires the same two env vars as the other admin-* functions
// (SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAILS) — already configured if those
// are working.
const { getAdminClient, requireAdmin } = require('./_lib/adminAuth');

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
    const { action, requestId, status } = JSON.parse(event.body || '{}');

    if (action === 'list') {
      const { data, error } = await admin.schema('mentorship').from('help_requests')
        .select('*').order('created_at', { ascending: false });
      if (error) throw error;

      // help_requests only stores student_id — resolve names/emails via
      // auth admin lookup so the queue is actually readable, same
      // denormalization approach admin-matching.js uses for mentor/mentee names.
      const ids = [...new Set((data || []).map(r => r.student_id))];
      const students = {};
      for (const id of ids) {
        const { data: u } = await admin.auth.admin.getUserById(id);
        if (u?.user) students[id] = { email: u.user.email, full_name: u.user.user_metadata?.full_name || '' };
      }
      const requests = (data || []).map(r => ({ ...r, student: students[r.student_id] || null }));
      return { statusCode: 200, body: JSON.stringify({ requests }) };
    }

    if (action === 'update-status') {
      if (!requestId || !status) return { statusCode: 400, body: JSON.stringify({ error: 'Missing requestId or status' }) };
      if (!['new', 'seen', 'resolved'].includes(status)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid status' }) };
      }
      const { error } = await admin.schema('mentorship').from('help_requests')
        .update({ status }).eq('id', requestId);
      if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) };
  } catch (error) {
    console.error('admin-help-requests failed:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
