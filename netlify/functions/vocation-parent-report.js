// Public endpoint behind a Vocation & Life Pathways parent link
// (mentorship/parent-report.html?token=...). Deliberately unauthenticated
// like guardian-consent-confirm.js — a parent has no Supabase account of
// their own. The access_token itself (192-bit random, from
// vocation_parent_links.access_token) is the entire security boundary:
// this function is the ONLY path that can ever read vocation data on a
// parent's behalf, and it assembles a pre-filtered payload via the
// service-role client rather than exposing any table directly. Private
// mentor notes are structurally absent here — only
// vocation_observation_recaps (shared_with_student = true rows) is ever
// queried, the same view the mentee's own dashboard reads from.
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ygtsrdwoikqnrbexjrtl.supabase.co';

function fail(statusCode, error) {
  return { statusCode, body: JSON.stringify({ error }) };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fail(200, 'This report link cannot be processed right now — please contact us directly.');
  }

  let requestToken;
  try {
    ({ token: requestToken } = JSON.parse(event.body || '{}'));
  } catch (e) {
    return fail(400, 'Invalid JSON body');
  }
  if (!requestToken) {
    return fail(400, 'Missing token');
  }

  const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: link, error: linkErr } = await admin.schema('mentorship').from('vocation_parent_links')
      .select('*').eq('access_token', requestToken).maybeSingle();
    if (linkErr) throw linkErr;
    if (!link) return fail(404, 'This report link is invalid.');
    if (link.revoked_at) return fail(410, 'This report link has been revoked.');
    if (link.expires_at && new Date(link.expires_at) < new Date()) return fail(410, 'This report link has expired.');

    const studentId = link.student_id;
    const { data: { user: student } } = await admin.auth.admin.getUserById(studentId);
    const studentName = student?.user_metadata?.full_name || student?.user_metadata?.name || 'Your child';

    const [
      progressRes, statementRes, evidenceRes, reactionsRes, profilesRes, familiesRes,
      hypothesesRes, planRes, actionItemsRes, recapsRes, reviewsRes,
    ] = await Promise.all([
      admin.schema('mentorship').from('vocation_stage_progress').select('stage, status').eq('student_id', studentId),
      admin.schema('mentorship').from('vocation_working_statement').select('statement, updated_at').eq('student_id', studentId).maybeSingle(),
      admin.schema('mentorship').from('vocation_evidence_items').select('title, evidence_type, stage, evidence_date').eq('student_id', studentId).order('created_at', { ascending: false }),
      admin.schema('mentorship').from('vocation_career_reactions').select('career_profile_id, reaction').eq('student_id', studentId),
      admin.schema('mentorship').from('vocation_career_profiles').select('id, title, family_id'),
      admin.schema('mentorship').from('vocation_career_families').select('id, name'),
      admin.schema('mentorship').from('vocation_pathway_hypotheses').select('label, category, why_it_fits, what_would_change_my_mind, status').eq('student_id', studentId).eq('status', 'active'),
      admin.schema('mentorship').from('vocation_pathway_plan').select('preferred_pathway, alternative_pathway').eq('student_id', studentId).maybeSingle(),
      admin.schema('mentorship').from('vocation_action_plan_items').select('plan_type, title, target_date, target_period_text, status').eq('student_id', studentId),
      admin.schema('mentorship').from('vocation_observation_recaps').select('note, stage, created_at').eq('student_id', studentId).order('created_at', { ascending: false }),
      admin.schema('mentorship').from('vocation_reviews').select('review_type, review_date, working_statement_snapshot, mentee_reflection, mentor_summary').eq('student_id', studentId).order('review_date', { ascending: false }),
    ]);

    const familyById = Object.fromEntries((familiesRes.data || []).map(f => [f.id, f.name]));
    const profileById = Object.fromEntries((profilesRes.data || []).map(p => [p.id, p]));
    const reactions = (reactionsRes.data || [])
      .filter(r => r.reaction !== 'not_for_me')
      .map(r => {
        const p = profileById[r.career_profile_id];
        return p ? { title: p.title, family: familyById[p.family_id] || null, reaction: r.reaction } : null;
      })
      .filter(Boolean);

    return {
      statusCode: 200,
      body: JSON.stringify({
        studentName,
        generatedAt: new Date().toISOString(),
        stageProgress: progressRes.data || [],
        workingStatement: statementRes.data?.statement || null,
        evidence: evidenceRes.data || [],
        careerInterests: reactions,
        hypotheses: hypothesesRes.data || [],
        pathwayPlan: planRes.data || { preferred_pathway: {}, alternative_pathway: {} },
        actionPlanItems: actionItemsRes.data || [],
        mentorNotes: recapsRes.data || [],
        reviews: reviewsRes.data || [],
      }),
    };
  } catch (error) {
    console.error('vocation-parent-report failed:', error);
    return fail(500, 'Something went wrong loading this report. Please try again shortly.');
  }
};
