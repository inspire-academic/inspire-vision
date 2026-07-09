// Mentor application review — list / approve / reject pending mentor
// applications. Mentor profiles live in Supabase Auth user_metadata
// (set at signup in mentors.html), which the browser can never list
// across users — only a service-role key can, and that key must never
// reach the client. This function is the one place it's used.
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
//
// Known scaling limit: pending applications are found by paging
// through *all* users via listUsers() and filtering client-side, since
// mentor profiles aren't in a queryable table. Fine while the mentor
// pipeline is small; if it grows, move mentor applications into their
// own `mentorship.mentor_applications` table with normal RLS instead.
const { getAdminClient, requireAdmin } = require('./_lib/adminAuth');

async function listPendingMentors(admin) {
  const pending = [];
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) {
      if (u.user_metadata?.mentorship_role === 'mentor' && u.user_metadata?.mentor_status === 'pending_review') {
        pending.push({
          id: u.id,
          email: u.email,
          full_name: u.user_metadata?.full_name || '',
          motivation: u.user_metadata?.mentor_motivation || '',
          created_at: u.created_at,
        });
      }
    }
    if (data.users.length < 200) break;
  }
  return pending;
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
      // updateUserById replaces user_metadata wholesale — merge in the
      // existing fields so approving someone doesn't wipe their name,
      // email, or application answers.
      const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...existing.user.user_metadata,
          mentor_status: action === 'approve' ? 'approved' : 'rejected',
        },
      });
      if (updateErr) return { statusCode: 500, body: JSON.stringify({ error: updateErr.message }) };
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) };
  } catch (error) {
    console.error('admin-mentors failed:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
