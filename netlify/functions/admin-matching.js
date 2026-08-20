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
    const { action, mentorId, studentId, assignmentId, closureReason, closureNotes, closureMeetingHeld } = JSON.parse(event.body || '{}');
    const VALID_CLOSURE_REASONS = ['completed_term', 'rematched', 'mentee_moved', 'mentor_stepped_down', 'not_a_good_fit', 'safeguarding_concern', 'other'];

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

      // Match-health — from the "Twelve Months" research pass: the
      // highest-leverage admin view found across every platform studied
      // (Together Platform's "health monitor", MentorcliQ) wasn't more
      // activity counts, it was surfacing SILENCE before a pairing
      // quietly dies. green <=14 days since last session/message/
      // check-in, amber 15-30, red >30 or no activity ever recorded.
      const activeStudentIds = (assignments || []).map(a => a.student_id);
      let healthByStudent = new Map();
      if (activeStudentIds.length) {
        const [{ data: sessions }, { data: messages }, { data: checkins }] = await Promise.all([
          admin.schema('mentorship').from('sessions').select('student_id, scheduled_at').in('student_id', activeStudentIds),
          admin.schema('mentorship').from('messages').select('student_id, created_at').in('student_id', activeStudentIds),
          admin.schema('mentorship').from('check_ins').select('student_id, created_at').in('student_id', activeStudentIds),
        ]);
        const latestByStudent = new Map();
        const bump = (studentId, ts) => {
          if (!ts) return;
          const t = new Date(ts).getTime();
          const cur = latestByStudent.get(studentId);
          if (!cur || t > cur) latestByStudent.set(studentId, t);
        };
        (sessions || []).forEach(s => bump(s.student_id, s.scheduled_at));
        (messages || []).forEach(m => bump(m.student_id, m.created_at));
        (checkins || []).forEach(c => bump(c.student_id, c.created_at));
        const now = Date.now();
        healthByStudent = new Map(activeStudentIds.map(id => {
          const latest = latestByStudent.get(id);
          if (!latest) return [id, 'red'];
          const days = (now - latest) / 86400000;
          return [id, days <= 14 ? 'green' : days <= 30 ? 'amber' : 'red'];
        }));
      }
      const assignmentsWithHealth = (assignments || []).map(a => ({ ...a, health: healthByStudent.get(a.student_id) || 'red' }));

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

      return { statusCode: 200, body: JSON.stringify({ mentors, unassignedMentees, allMentees, activeAssignments: assignmentsWithHealth }) };
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
      // auto-close the old one. closure_reason is set automatically here
      // (not admin-chosen) since this is a rematch, not the explicit
      // "End Pairing" flow below — but it still records a real reason
      // rather than leaving the column null.
      await admin.schema('mentorship').from('mentor_assignments')
        .update({ status: 'ended', ended_at: new Date().toISOString(), closure_reason: 'rematched' })
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
      // Real gate, from the "Twelve Months" research: every closure
      // standard studied (BBBS's Matchforce, MENTOR's EEPM Element 12)
      // treats ending a match well as its own practice, not a silent
      // status flip — an unplanned/unexplained ending is the actual
      // mechanism of harm to the mentee, not just short duration alone.
      if (!closureReason || !VALID_CLOSURE_REASONS.includes(closureReason)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'A closure reason is required to end a pairing.' }) };
      }
      const { error: endErr } = await admin.schema('mentorship').from('mentor_assignments')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString(),
          closure_reason: closureReason,
          closure_notes: closureNotes || null,
          closure_meeting_held: !!closureMeetingHeld,
        })
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
