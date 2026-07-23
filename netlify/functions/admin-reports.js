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

    return {
      statusCode: 200,
      body: JSON.stringify({
        mentors: { approved: approvedMentors, pendingReview: pendingMentors, rejected: rejectedMentors },
        mentees: { total: mentees.length, assigned: assignedMenteeCount, unassigned: mentees.length - assignedMenteeCount },
        assignments: { active: assignedMenteeIds.size, ended: endedAssignments },
        sessions: { scheduled: sessionsScheduled, completed: sessionsCompleted, cancelled: sessionsCancelled },
        helpRequests: { new: hrNew, seen: hrSeen, resolved: hrResolved, urgentOpen: (hrUrgentNew || 0) + (hrUrgentSeen || 0) },
        engagement: { goals: goalsCount, checkIns: checkInsCount, journalEntries: journalCount },
      }),
    };
  } catch (error) {
    console.error('admin-reports failed:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
