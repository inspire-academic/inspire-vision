// Mentor <-> mentee pairing. There is no self-service matching
// anywhere — a mentor can never assign themselves to a mentee, and a
// mentee can never pick their own mentor. This function is the only
// place an mentorship.mentor_assignments row gets created or ended,
// same reasoning as admin-mentors.js: it can read every mentee's name
// and email, so it's gated the same way.
//
// Requires the same two env vars as admin-mentors.js
// (SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAILS) — already configured if
// that function is working.
const { getAdminClient, requireAdmin } = require('./_lib/adminAuth');

async function listAllUsers(admin) {
  const users = [];
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  return users;
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
    const { action, mentorId, studentId, assignmentId } = JSON.parse(event.body || '{}');

    if (action === 'list') {
      const [users, { data: assignments, error: assignErr }, { data: applications, error: appErr }, { data: consents, error: consentErr }] = await Promise.all([
        listAllUsers(admin),
        admin.schema('mentorship').from('mentor_assignments').select('*').eq('status', 'active'),
        admin.schema('mentorship').from('mentor_applications').select('mentor_id').eq('status', 'approved'),
        admin.schema('mentorship').from('guardian_consents').select('student_id, status'),
      ]);
      if (assignErr) throw assignErr;
      if (appErr) throw appErr;
      if (consentErr) throw consentErr;

      const assignedStudentIds = new Set((assignments || []).map(a => a.student_id));
      // Picker reads mentor_applications (service-role-only writes), not
      // user_metadata.mentor_status — the latter is client-writable by the
      // account owner (docs/assurance/mentorship/FOLLOWUP-mentor-status-spoofable-picker.md),
      // so a self-elevated account could otherwise appear here as if
      // genuinely vetted by admin-mentors.js.
      const approvedMentorIds = new Set((applications || []).map(a => a.mentor_id));
      const mentors = users
        .filter(u => approvedMentorIds.has(u.id))
        .map(u => ({ id: u.id, email: u.email, full_name: u.user_metadata?.full_name || '' }));
      // Surfaced so admin/matching.html can flag an unconfirmed minor in
      // the picker before hitting the hard server-side gate below — see
      // "assign" action. is_minor is self-reported at signup (same trust
      // level as mentorship_role elsewhere in this schema).
      const consentByStudent = new Map((consents || []).map(c => [c.student_id, c.status]));
      const toMenteeRow = u => ({
        id: u.id,
        email: u.email,
        full_name: u.user_metadata?.full_name || '',
        is_minor: !!u.user_metadata?.is_minor,
        guardian_consent_status: consentByStudent.get(u.id) || null,
      });
      const unassignedMentees = users
        .filter(u => u.user_metadata?.mentorship_role === 'mentee' && !assignedStudentIds.has(u.id))
        .map(toMenteeRow);
      // Full roster for admin/mentees.html — same underlying data as
      // unassignedMentees above, just not filtered down, plus each row's
      // current mentor (if any) for display.
      const assignmentByStudent = new Map((assignments || []).map(a => [a.student_id, a]));
      const allMentees = users
        .filter(u => u.user_metadata?.mentorship_role === 'mentee')
        .map(u => ({
          ...toMenteeRow(u),
          created_at: u.created_at,
          mentor_name: assignmentByStudent.get(u.id)?.mentor_name || null,
        }));

      return { statusCode: 200, body: JSON.stringify({ mentors, unassignedMentees, allMentees, activeAssignments: assignments || [] }) };
    }

    if (action === 'assign') {
      if (!mentorId || !studentId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing mentorId or studentId' }) };
      }
      const [{ data: mentorData, error: mentorErr }, { data: studentData, error: studentErr }] = await Promise.all([
        admin.auth.admin.getUserById(mentorId),
        admin.auth.admin.getUserById(studentId),
      ]);
      if (mentorErr || !mentorData?.user) return { statusCode: 404, body: JSON.stringify({ error: 'Mentor not found' }) };
      if (studentErr || !studentData?.user) return { statusCode: 404, body: JSON.stringify({ error: 'Mentee not found' }) };

      // Hard safeguarding gate: an under-18 mentee cannot be paired with a
      // mentor until their guardian has confirmed via the emailed link
      // (mentorship_schema_v7_guardian_consent.sql, guardian-consent-
      // confirm.js). This is the actual enforcement point — the picker
      // badge in admin/matching.html is just a heads-up, not the guard.
      if (studentData.user.user_metadata?.is_minor) {
        const { data: consent, error: consentCheckErr } = await admin.schema('mentorship').from('guardian_consents')
          .select('status').eq('student_id', studentId).maybeSingle();
        if (consentCheckErr) throw consentCheckErr;
        if (!consent || consent.status !== 'confirmed') {
          return { statusCode: 403, body: JSON.stringify({ error: 'This mentee is under 18 and guardian consent has not been confirmed yet — a mentor cannot be assigned until then.' }) };
        }
      }

      // End any existing active assignment for this student first — the
      // unique index only stops two rows existing at once, it doesn't
      // auto-close the old one.
      await admin.schema('mentorship').from('mentor_assignments')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('student_id', studentId).eq('status', 'active');

      const { error: insertErr } = await admin.schema('mentorship').from('mentor_assignments').insert({
        mentor_id: mentorId,
        student_id: studentId,
        mentor_name: mentorData.user.user_metadata?.full_name || mentorData.user.email,
        student_name: studentData.user.user_metadata?.full_name || studentData.user.email,
      });
      if (insertErr) return { statusCode: 500, body: JSON.stringify({ error: insertErr.message }) };
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'end') {
      if (!assignmentId) return { statusCode: 400, body: JSON.stringify({ error: 'Missing assignmentId' }) };
      const { error: endErr } = await admin.schema('mentorship').from('mentor_assignments')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', assignmentId);
      if (endErr) return { statusCode: 500, body: JSON.stringify({ error: endErr.message }) };
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) };
  } catch (error) {
    console.error('admin-matching failed:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
