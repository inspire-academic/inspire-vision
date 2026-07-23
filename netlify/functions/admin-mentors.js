// Mentor application review — list / approve / reject pending mentor
// applications. The queryable record of truth is mentorship.mentor_applications
// (mentorship_schema_v5_mentor_applications.sql) — mentors.html inserts a
// row there right after signup. Approval still also touches
// auth.users.user_metadata purely so the account can read its own status
// client-side for the login redirect; that copy is never trusted for
// anything security-relevant (see mentor_applications' own RLS: an
// applicant can create their own pending row and read it back, but there
// is no client UPDATE/DELETE policy at all — only this service-role
// function can change status).
//
// Requires two env vars in Netlify's dashboard, neither of which exist
// yet (Site settings -> Environment variables):
//   SUPABASE_SERVICE_ROLE_KEY — Project Settings -> API -> service_role
//   ADMIN_EMAILS              — comma-separated allowlist, e.g.
//                                "you@example.com,other-admin@example.com"
//
// Every request must carry the caller's own Supabase access token
// (Authorization: Bearer <token>) so we can verify who's asking before
// touching anyone's account. No token, or a token for an email not on
// the allowlist, gets a 401/403 — this endpoint can read every
// mentee's name and email and can grant mentor access to minors, so it
// is not something to leave open.
const { getAdminClient, requireAdmin } = require('./_lib/adminAuth');

async function listPendingMentors(admin) {
  const { data, error } = await admin.schema('mentorship').from('mentor_applications')
    .select('*').eq('status', 'pending_review').order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(a => ({
    id: a.mentor_id,
    email: a.email,
    full_name: a.full_name || '',
    motivation: a.motivation || '',
    created_at: a.created_at,
  }));
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
    const { action, userId } = JSON.parse(event.body || '{}');

    if (action === 'list') {
      const pending = await listPendingMentors(admin);
      return { statusCode: 200, body: JSON.stringify({ pending }) };
    }

    if (action === 'approve' || action === 'reject') {
      if (!userId) return { statusCode: 400, body: JSON.stringify({ error: 'Missing userId' }) };
      const { data: existing, error: fetchErr } = await admin.auth.admin.getUserById(userId);
      if (fetchErr || !existing?.user) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Mentor application not found' }) };
      }
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      // updateUserById replaces user_metadata wholesale — merge in the
      // existing fields so approving someone doesn't wipe their name,
      // email, or application answers. This metadata copy is kept purely
      // so the client can read its own status for the login redirect —
      // it is NOT the authoritative record (see mentor_applications
      // below), because a user can freely rewrite their own metadata.
      const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...existing.user.user_metadata,
          mentor_status: newStatus,
        },
      });
      if (updateErr) return { statusCode: 500, body: JSON.stringify({ error: updateErr.message }) };

      // Authoritative record (docs/assurance/mentorship/FOLLOWUP-mentor-status-spoofable-picker.md):
      // admin-matching.js's mentor picker must read this, not user_metadata,
      // since only this table is unreachable by the account owner themselves
      // — mentor_applications has no client UPDATE policy at all. Upsert,
      // not update: if mentors.html's own insert at signup ever failed
      // (logged there, best-effort), a plain UPDATE would silently affect
      // zero rows and this approval would appear to succeed while doing
      // nothing — upsert recreates the row from the auth account instead.
      const { error: appErr } = await admin.schema('mentorship').from('mentor_applications').upsert({
        mentor_id: userId,
        email: existing.user.email,
        full_name: existing.user.user_metadata?.full_name || '',
        motivation: existing.user.user_metadata?.mentor_motivation || '',
        status: newStatus,
        reviewed_by: auth.user.id,
        reviewed_at: new Date().toISOString(),
      });
      if (appErr) return { statusCode: 500, body: JSON.stringify({ error: appErr.message }) };

      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) };
  } catch (error) {
    console.error('admin-mentors failed:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
