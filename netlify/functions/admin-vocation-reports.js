// Aggregate, count-only stats for admin/vocation.html — mirrors
// admin-reports.js's shape and gating exactly (requireAdmin() +
// service-role reads). Cross-mentee aggregates require bypassing RLS,
// which only service-role can do, so this never exposes anything a
// single mentor/mentee query couldn't already see in aggregate — no
// individual reflections, evidence text, or mentor notes are read here,
// only stage_progress statuses and count-shaped rollups.
const { getAdminClient, requireAdmin } = require('./_lib/adminAuth');

const STAGES = ['discover', 'explore', 'test', 'discern', 'design', 'present', 'review'];
const STATUSES = ['not_started', 'in_progress', 'ready_for_review', 'mentor_reviewed', 'complete'];
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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
    const { data: progressRows, error: progErr } = await admin.schema('mentorship').from('vocation_stage_progress')
      .select('student_id, stage, status, updated_at');
    if (progErr) throw progErr;

    const byStudent = {};
    (progressRows || []).forEach(r => {
      if (!byStudent[r.student_id]) byStudent[r.student_id] = {};
      byStudent[r.student_id][r.stage] = r;
    });
    const studentIds = Object.keys(byStudent);

    const stageDistribution = {};
    STAGES.forEach(stage => {
      stageDistribution[stage] = Object.fromEntries(STATUSES.map(s => [s, 0]));
    });

    let readyForReviewBacklog = 0;
    let stalledCount = 0;
    let fullyCompleteCount = 0;
    const now = Date.now();

    studentIds.forEach(sid => {
      const rows = byStudent[sid];
      let latestUpdate = 0;
      let completeCount = 0;
      STAGES.forEach(stage => {
        const r = rows[stage];
        const status = r ? r.status : 'not_started';
        stageDistribution[stage][status]++;
        if (status === 'ready_for_review') readyForReviewBacklog++;
        if (status === 'complete') completeCount++;
        if (r?.updated_at) {
          const t = new Date(r.updated_at).getTime();
          if (t > latestUpdate) latestUpdate = t;
        }
      });
      const isFullyComplete = completeCount === STAGES.length;
      if (isFullyComplete) fullyCompleteCount++;
      else if (latestUpdate && (now - latestUpdate) > THIRTY_DAYS_MS) stalledCount++;
    });

    const [
      { count: careerReactionsTotal, error: crErr },
      { data: reactionRows, error: rrErr },
      { count: hypothesesActiveCount, error: hypErr },
      { count: reviewsTotal, error: revErr },
    ] = await Promise.all([
      admin.schema('mentorship').from('vocation_career_reactions').select('id', { count: 'exact', head: true }),
      admin.schema('mentorship').from('vocation_career_reactions').select('career_profile_id'),
      admin.schema('mentorship').from('vocation_pathway_hypotheses').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      admin.schema('mentorship').from('vocation_reviews').select('id', { count: 'exact', head: true }),
    ]);
    if (crErr) throw crErr;
    if (rrErr) throw rrErr;
    if (hypErr) throw hypErr;
    if (revErr) throw revErr;

    // Families explored — distinct career_families reached across the
    // whole cohort's reactions, not a per-student figure.
    let familiesExploredCount = 0;
    const profileIds = [...new Set((reactionRows || []).map(r => r.career_profile_id))];
    if (profileIds.length) {
      const { data: profiles, error: profErr } = await admin.schema('mentorship').from('vocation_career_profiles')
        .select('id, family_id').in('id', profileIds);
      if (profErr) throw profErr;
      familiesExploredCount = new Set((profiles || []).map(p => p.family_id)).size;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        activeParticipants: studentIds.length,
        readyForReviewBacklog,
        stalledCount,
        fullyCompleteCount,
        stageDistribution,
        careerReactionsTotal: careerReactionsTotal || 0,
        familiesExploredCount,
        hypothesesActiveCount: hypothesesActiveCount || 0,
        reviewsTotal: reviewsTotal || 0,
      }),
    };
  } catch (error) {
    console.error('admin-vocation-reports failed:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
