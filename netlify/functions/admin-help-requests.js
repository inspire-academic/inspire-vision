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
        .select('*');
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

      // Claim/reply state lives in a separate table (help_request_responses,
      // mentorship_schema_v23) rather than columns here — see that
      // migration's own comment for why (help_requests' RLS is student-
      // writable, so admin-only fields can't safely live on this row).
      const requestIds = (data || []).map(r => r.id);
      let responsesById = {};
      if (requestIds.length) {
        const { data: responses } = await admin.schema('mentorship').from('help_request_responses')
          .select('*').in('request_id', requestIds);
        responsesById = Object.fromEntries((responses || []).map(r => [r.request_id, r]));
      }

      // Fixes the audit finding that this queue sorted newest-first with
      // no regard for urgency: unresolved cases surface before resolved
      // ones, "urgent" surfaces before other categories within that, and
      // within a tier the OLDEST unattended request comes first — a
      // safeguarding queue should process what's been waiting longest,
      // not what just arrived, once urgency is accounted for.
      const requests = (data || [])
        .map(r => ({ ...r, student: students[r.student_id] || null, response: responsesById[r.id] || null }))
        .sort((a, b) => {
          const aResolved = a.status === 'resolved' ? 1 : 0;
          const bResolved = b.status === 'resolved' ? 1 : 0;
          if (aResolved !== bResolved) return aResolved - bResolved;
          const aUrgent = a.category === 'urgent' ? 0 : 1;
          const bUrgent = b.category === 'urgent' ? 0 : 1;
          if (aUrgent !== bUrgent) return aUrgent - bUrgent;
          return new Date(a.created_at) - new Date(b.created_at);
        });
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

    // Case ownership (audit finding: no "claimed by" meant nothing stopped
    // two staff both assuming someone else had handled a request, or no
    // one had). Upsert rather than insert/update — a request may not have
    // a help_request_responses row yet at all.
    if (action === 'claim') {
      if (!requestId) return { statusCode: 400, body: JSON.stringify({ error: 'Missing requestId' }) };
      const { data: req } = await admin.schema('mentorship').from('help_requests')
        .select('student_id').eq('id', requestId).maybeSingle();
      if (!req) return { statusCode: 404, body: JSON.stringify({ error: 'Request not found' }) };
      const claimerName = auth.user.user_metadata?.full_name || auth.user.email;
      const { error } = await admin.schema('mentorship').from('help_request_responses')
        .upsert({
          request_id: requestId,
          student_id: req.student_id,
          claimed_by: auth.user.id,
          claimed_by_name: claimerName,
          claimed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'request_id' });
      if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // Direct in-app reply (audit finding: staff could only set a status —
    // a student who wrote "I'm not safe" got silently marked "Seen" with
    // nothing visible on their end). Visible to the student via RLS SELECT
    // on help_request_responses (mentorship_schema_v23) — see dashboard/
    // prayer-support.html. Replying also marks the request "seen" if it
    // was still "new", so a reply always shows real queue progress too.
    if (action === 'reply') {
      const { requestId: rid, replyMessage } = JSON.parse(event.body || '{}');
      if (!rid || !replyMessage || !replyMessage.trim()) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing requestId or replyMessage' }) };
      }
      const { data: req } = await admin.schema('mentorship').from('help_requests')
        .select('student_id, status').eq('id', rid).maybeSingle();
      if (!req) return { statusCode: 404, body: JSON.stringify({ error: 'Request not found' }) };
      const replierName = auth.user.user_metadata?.full_name || auth.user.email;
      const now = new Date().toISOString();
      const { error } = await admin.schema('mentorship').from('help_request_responses')
        .upsert({
          request_id: rid,
          student_id: req.student_id,
          reply_message: replyMessage.trim(),
          replied_by: auth.user.id,
          replied_by_name: replierName,
          replied_at: now,
          updated_at: now,
        }, { onConflict: 'request_id' });
      if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
      if (req.status === 'new') {
        await admin.schema('mentorship').from('help_requests').update({ status: 'seen' }).eq('id', rid);
      }
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) };
  } catch (error) {
    console.error('admin-help-requests failed:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
