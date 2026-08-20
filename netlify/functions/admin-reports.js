// Aggregate operational stats for admin/index.html (summary cards) and
// admin/reports.html (full breakdown). Read-only, service-role gated the
// same way as the other admin-* functions — cross-user counts require
// bypassing RLS, which only service-role can do.
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

async function countTable(admin, table, filters = {}) {
  let q = admin.schema('mentorship').from(table).select('*', { count: 'exact', head: true });
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
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
    const [users, { data: activeAssignments, error: assignErr }] = await Promise.all([
      listAllUsers(admin),
      admin.schema('mentorship').from('mentor_assignments').select('student_id').eq('status', 'active'),
    ]);
    if (assignErr) throw assignErr;

    const mentees = users.filter(u => u.user_metadata?.mentorship_role === 'mentee');
    const assignedMenteeIds = new Set((activeAssignments || []).map(a => a.student_id));
    const assignedMenteeCount = mentees.filter(u => assignedMenteeIds.has(u.id)).length;

    const [
      pendingMentors, approvedMentors, rejectedMentors,
      endedAssignments,
      sessionsScheduled, sessionsCompleted, sessionsCancelled,
      hrNew, hrSeen, hrResolved,
      goalsCount, checkInsCount, journalCount,
    ] = await Promise.all([
      countTable(admin, 'mentor_applications', { status: 'pending_review' }),
      countTable(admin, 'mentor_applications', { status: 'approved' }),
      countTable(admin, 'mentor_applications', { status: 'rejected' }),
      countTable(admin, 'mentor_assignments', { status: 'ended' }),
      countTable(admin, 'sessions', { status: 'scheduled' }),
      countTable(admin, 'sessions', { status: 'completed' }),
      countTable(admin, 'sessions', { status: 'cancelled' }),
      countTable(admin, 'help_requests', { status: 'new' }),
      countTable(admin, 'help_requests', { status: 'seen' }),
      countTable(admin, 'help_requests', { status: 'resolved' }),
      countTable(admin, 'goals'),
      countTable(admin, 'check_ins'),
      countTable(admin, 'journal_entries'),
    ]);

    const { count: hrUrgentNew, error: e1 } = await admin.schema('mentorship').from('help_requests')
      .select('*', { count: 'exact', head: true }).eq('category', 'urgent').eq('status', 'new');
    const { count: hrUrgentSeen, error: e2 } = await admin.schema('mentorship').from('help_requests')
      .select('*', { count: 'exact', head: true }).eq('category', 'urgent').eq('status', 'seen');
    if (e1) throw e1;
    if (e2) throw e2;

    // Guardian consent (mentorship_schema_v7/_v8) — is_minor is
    // self-reported at signup (auth.users.user_metadata), same trust
    // level as mentorship_role elsewhere; missingRequest catches minors
    // whose join.html insert into guardian_consents never landed (e.g. a
    // transient failure at signup — best-effort by design, see join.html).
    const { data: consents, error: gcErr } = await admin.schema('mentorship').from('guardian_consents').select('status');
    if (gcErr) throw gcErr;
    const gcPending = (consents || []).filter(c => c.status === 'pending').length;
    const gcConfirmed = (consents || []).filter(c => c.status === 'confirmed').length;
    const totalMinors = users.filter(u => u.user_metadata?.is_minor).length;
    const gcMissing = Math.max(0, totalMinors - gcPending - gcConfirmed);

    // Mentor safeguarding checks (mentorship_schema_v9) — a mentor with
    // no row at all (never reviewed) counts as "not started," same as a
    // row explicitly set to 'not_started'.
    const { data: sgChecks, error: sgErr } = await admin.schema('mentorship').from('mentor_safeguarding_checks').select('status');
    if (sgErr) throw sgErr;
    const sgInProgress = (sgChecks || []).filter(c => c.status === 'in_progress').length;
    const sgPassed = (sgChecks || []).filter(c => c.status === 'passed').length;
    const sgFailed = (sgChecks || []).filter(c => c.status === 'failed').length;
    const totalMentorApplicants = pendingMentors + approvedMentors + rejectedMentors;
    const sgNotStarted = Math.max(0, totalMentorApplicants - sgInProgress - sgPassed - sgFailed);

    // EPOCH wellbeing surveys (mentorship_schema_v15) — aggregate only,
    // never individual responses (see that table's RLS comment on why
    // it's mentee-only, same privacy footing as Journal). This is the
    // one validated outcome measure the platform has, from the "Twelve
    // Months" research pass — averages per wave are the actual point of
    // adopting it: can the programme show wellbeing moving, not just
    // activity counts.
    const { data: epochRows, error: epochErr } = await admin.schema('mentorship').from('epoch_surveys').select('wave, overall');
    if (epochErr) throw epochErr;
    const epochByWave = { intake: [], '3_month': [], '6_month': [] };
    (epochRows || []).forEach(r => { if (epochByWave[r.wave]) epochByWave[r.wave].push(Number(r.overall)); });
    const avgOf = arr => arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100 : null;

    // Relationship-quality pulse (mentorship_schema_v16) — aggregate
    // only, same reasoning as wellbeing above: individual responses are
    // never exposed, including to the other side of the same pairing.
    const { data: pulseRows, error: pulseErr } = await admin.schema('mentorship').from('relationship_pulses').select('reporter, overall');
    if (pulseErr) throw pulseErr;
    const menteeOveralls = (pulseRows || []).filter(r => r.reporter === 'mentee').map(r => Number(r.overall));
    const mentorOveralls = (pulseRows || []).filter(r => r.reporter === 'mentor').map(r => Number(r.overall));

    return {
      statusCode: 200,
      body: JSON.stringify({
        mentors: { approved: approvedMentors, pendingReview: pendingMentors, rejected: rejectedMentors },
        mentees: { total: mentees.length, assigned: assignedMenteeCount, unassigned: mentees.length - assignedMenteeCount },
        assignments: { active: assignedMenteeIds.size, ended: endedAssignments },
        sessions: { scheduled: sessionsScheduled, completed: sessionsCompleted, cancelled: sessionsCancelled },
        helpRequests: { new: hrNew, seen: hrSeen, resolved: hrResolved, urgentOpen: (hrUrgentNew || 0) + (hrUrgentSeen || 0) },
        engagement: { goals: goalsCount, checkIns: checkInsCount, journalEntries: journalCount },
        guardianConsent: { pending: gcPending, confirmed: gcConfirmed, missingRequest: gcMissing },
        mentorSafeguarding: { notStarted: sgNotStarted, inProgress: sgInProgress, passed: sgPassed, failed: sgFailed },
        wellbeing: {
          intakeCount: epochByWave.intake.length, intakeAvg: avgOf(epochByWave.intake),
          threeMonthCount: epochByWave['3_month'].length, threeMonthAvg: avgOf(epochByWave['3_month']),
          sixMonthCount: epochByWave['6_month'].length, sixMonthAvg: avgOf(epochByWave['6_month']),
        },
        relationshipPulse: {
          menteeCount: menteeOveralls.length, menteeAvg: avgOf(menteeOveralls),
          mentorCount: mentorOveralls.length, mentorAvg: avgOf(mentorOveralls),
        },
      }),
    };
  } catch (error) {
    console.error('admin-reports failed:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
