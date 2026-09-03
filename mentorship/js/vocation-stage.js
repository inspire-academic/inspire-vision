// ============================================
// Inspire Vocation & Life Pathways — shared stage-machine helpers
// Loaded after /assets/supabase.js, before each page's own inline
// script. Plain globals (window.X), matching this codebase's existing
// no-build-step convention (same shape as assets/supabase.js/nav.js) —
// not a components framework. Everything else (auth boilerplate,
// sidebar/topbar, per-page form wiring) stays copy-pasted per page.
// ============================================

// Ordered stage metadata — single source of truth for stage keys/labels/
// routes across every dashboard/vocation/*.html page.
window.VOCATION_STAGES = [
  { key: 'discover', label: 'Discover', short: '1', href: '/mentorship/dashboard/vocation/discover.html' },
  { key: 'explore', label: 'Explore', short: '2', href: '/mentorship/dashboard/vocation/explore.html' },
  { key: 'test', label: 'Test', short: '3', href: '/mentorship/dashboard/vocation/test.html' },
  { key: 'discern', label: 'Discern', short: '4', href: '/mentorship/dashboard/vocation/discern.html' },
  { key: 'design', label: 'Design', short: '5', href: '/mentorship/dashboard/vocation/design.html' },
  { key: 'present', label: 'Present', short: '6', href: '/mentorship/dashboard/vocation/present.html' },
  { key: 'review', label: 'Review', short: '7', href: '/mentorship/dashboard/vocation/review.html' },
];

window.VOCATION_STATUS_LABELS = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  ready_for_review: 'Ready for Review',
  mentor_reviewed: 'Mentor Reviewed',
  complete: 'Complete',
};

window.VOCATION_STATUS_BADGE_CLASS = {
  not_started: 'badge-muted',
  in_progress: 'badge-in-progress',
  ready_for_review: 'badge-ready',
  mentor_reviewed: 'badge-reviewed',
  complete: 'badge-complete',
};

// stageStatusBadge(status) -> HTML string for a <span class="badge ...">
window.stageStatusBadge = function stageStatusBadge(status) {
  const s = status || 'not_started';
  const cls = window.VOCATION_STATUS_BADGE_CLASS[s] || 'badge-muted';
  const label = window.VOCATION_STATUS_LABELS[s] || s;
  return `<span class="badge ${cls}">${label}</span>`;
};

// renderStageStepper(container, progressByStage, currentStageKey)
// progressByStage: { [stageKey]: { status } }
window.renderStageStepper = function renderStageStepper(container, progressByStage, currentStageKey) {
  if (!container) return;
  const stages = window.VOCATION_STAGES;
  let html = '';
  stages.forEach((stage, i) => {
    const status = (progressByStage && progressByStage[stage.key] && progressByStage[stage.key].status) || 'not_started';
    const isCurrent = stage.key === currentStageKey;
    html += `
      <a class="vocation-stage-step ${status}${isCurrent ? ' current' : ''}" href="${stage.href}" title="${stage.label} — ${window.VOCATION_STATUS_LABELS[status]}">
        <div class="vocation-stage-step-circle">${status === 'complete' || status === 'mentor_reviewed' ? '✓' : stage.short}</div>
        <div class="vocation-stage-step-label">${stage.label}</div>
      </a>`;
    if (i < stages.length - 1) {
      const doneEnough = status === 'mentor_reviewed' || status === 'complete';
      html += `<div class="vocation-stage-connector${doneEnough ? ' done' : ''}"></div>`;
    }
  });
  container.innerHTML = html;
};

// upsertStageProgress(dbClient, studentId, stage) — lazy row creation,
// called once per stage page load. Safe to call repeatedly (ON CONFLICT
// DO NOTHING via ignoreDuplicates).
window.upsertStageProgress = async function upsertStageProgress(dbClient, studentId, stage) {
  const { error } = await dbClient.schema('mentorship').from('vocation_stage_progress')
    .upsert({ student_id: studentId, stage }, { onConflict: 'student_id,stage', ignoreDuplicates: true });
  if (error) console.warn(`upsertStageProgress(${stage}) failed:`, error);
};

// markStageInProgress(dbClient, studentId, stage) — call once a mentee
// starts actually filling something in on a not_started stage.
window.markStageInProgress = async function markStageInProgress(dbClient, studentId, stage) {
  const { error } = await dbClient.schema('mentorship').from('vocation_stage_progress')
    .update({ status: 'in_progress', updated_at: new Date().toISOString() })
    .eq('student_id', studentId).eq('stage', stage).eq('status', 'not_started');
  if (error) console.warn(`markStageInProgress(${stage}) failed:`, error);
};

// markStageReadyForReview(dbClient, studentId, stage)
window.markStageReadyForReview = async function markStageReadyForReview(dbClient, studentId, stage) {
  const now = new Date().toISOString();
  const { error } = await dbClient.schema('mentorship').from('vocation_stage_progress')
    .update({ status: 'ready_for_review', marked_ready_at: now, updated_at: now })
    .eq('student_id', studentId).eq('stage', stage);
  return { error };
};

// debounceAutosave(fn, ms) — generic debounce wrapper for jsonb/text
// autosave fields (vocation_reflections, pathway_plan, etc.).
window.debounceAutosave = function debounceAutosave(fn, ms = 800) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};

// saveReflection(dbClient, studentId, sectionKey, payload) — upsert into
// vocation_reflections, the shared autosave table backing most Discover
// submodules, Discern's calling reflection, and Design's 10-year
// conversation.
window.saveReflection = async function saveReflection(dbClient, studentId, sectionKey, payload) {
  const { error } = await dbClient.schema('mentorship').from('vocation_reflections')
    .upsert(
      { student_id: studentId, section_key: sectionKey, payload, updated_at: new Date().toISOString() },
      { onConflict: 'student_id,section_key' },
    );
  if (error) console.warn(`saveReflection(${sectionKey}) failed:`, error);
  return { error };
};

// loadReflections(dbClient, studentId, sectionKeys) -> { [sectionKey]: payload }
window.loadReflections = async function loadReflections(dbClient, studentId, sectionKeys) {
  const { data, error } = await dbClient.schema('mentorship').from('vocation_reflections')
    .select('section_key, payload').eq('student_id', studentId).in('section_key', sectionKeys);
  if (error) { console.warn('loadReflections failed:', error); return {}; }
  return Object.fromEntries((data || []).map(r => [r.section_key, r.payload]));
};
