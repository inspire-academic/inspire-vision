/* The Living Language Project — mock persistence service layer.

   MVP note: this repo already has a live Supabase project wired up for
   other modules (see /assets/supabase.js, and mentorship.* / vision.*
   schemas), but standing up a new `living_language.*` schema + RLS
   policies is a bigger, higher-blast-radius step than this first vertical
   slice needs. Per the build brief ("if backend is not ready, implement a
   clearly structured service layer and mock persistence without
   pretending data has been permanently stored"), submissions from the
   Preserve a Voice flow are written to localStorage behind the same
   interface a real backend call would use — swap submit()'s body for a
   Supabase insert later without touching any page code.

   Nothing written here is presented to the user as permanently archived. */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'livingLanguage.preserveSubmissions.v1';

  function readAll() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.warn('[LivingLanguageStore] could not read local storage', err);
      return [];
    }
  }

  function writeAll(records) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      return true;
    } catch (err) {
      console.warn('[LivingLanguageStore] could not write local storage', err);
      return false;
    }
  }

  /**
   * Persists one Preserve a Voice submission (mock/local only for MVP).
   * @param {Object} submission - matches the intake flow's 12-step payload
   * @returns {{ok:boolean, id:string, storedLocallyOnly:true}}
   */
  function submit(submission) {
    const records = readAll();
    const id = 'sub-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    records.push(Object.assign({ id, submittedAt: new Date().toISOString(), reviewStatus: 'PENDING_REVIEW' }, submission));
    writeAll(records);
    return { ok: true, id, storedLocallyOnly: true };
  }

  function listSubmissions() {
    return readAll();
  }

  /**
   * Updates one submission's review status (admin prototype use only).
   * Mirrors the corpus rule that nothing reaches VERIFIED without a
   * human decision — this function is the human decision, made by
   * clicking Approve/Reject in the admin review queue, never automatic.
   */
  function updateSubmissionStatus(id, status) {
    const records = readAll();
    const record = records.find(r => r.id === id);
    if (!record) return { ok: false };
    record.reviewStatus = status;
    record.reviewedAt = new Date().toISOString();
    writeAll(records);
    return { ok: true };
  }

  function clearAll() {
    writeAll([]);
  }

  /* ── Learn Klo progress (local-first per the handoff brief §24 —
     "Do not block MVP on account creation") ──────────────────────── */
  const MODE_KEY = 'livingLanguage.learn.mode.v1';
  const PROGRESS_KEY = 'livingLanguage.learn.progress.v1';

  function getLearnerMode() {
    try { return window.localStorage.getItem(MODE_KEY) || null; }
    catch (err) { return null; }
  }

  function setLearnerMode(mode) {
    try { window.localStorage.setItem(MODE_KEY, mode); return true; }
    catch (err) { console.warn('[LivingLanguageStore] could not set learner mode', err); return false; }
  }

  function readProgress() {
    try {
      const raw = window.localStorage.getItem(PROGRESS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (err) { return {}; }
  }

  function writeProgress(progress) {
    try { window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); return true; }
    catch (err) { console.warn('[LivingLanguageStore] could not write progress', err); return false; }
  }

  function getProgress() {
    return readProgress();
  }

  function getLessonProgress(lessonId) {
    return readProgress()[lessonId] || { status: 'new', itemsSeen: [], startedAt: null, completedAt: null };
  }

  function markLessonStarted(lessonId) {
    const progress = readProgress();
    if (!progress[lessonId]) progress[lessonId] = { status: 'in_progress', itemsSeen: [], startedAt: new Date().toISOString(), completedAt: null };
    else if (progress[lessonId].status === 'new') progress[lessonId].status = 'in_progress';
    writeProgress(progress);
  }

  function markItemSeen(lessonId, itemId) {
    const progress = readProgress();
    if (!progress[lessonId]) progress[lessonId] = { status: 'in_progress', itemsSeen: [], startedAt: new Date().toISOString(), completedAt: null };
    if (!progress[lessonId].itemsSeen.includes(itemId)) progress[lessonId].itemsSeen.push(itemId);
    writeProgress(progress);
  }

  function markLessonCompleted(lessonId) {
    const progress = readProgress();
    if (!progress[lessonId]) progress[lessonId] = { status: 'in_progress', itemsSeen: [], startedAt: new Date().toISOString(), completedAt: null };
    progress[lessonId].status = 'completed';
    progress[lessonId].completedAt = new Date().toISOString();
    writeProgress(progress);
  }

  global.LivingLanguageStore = {
    submit, listSubmissions, updateSubmissionStatus, clearAll,
    getLearnerMode, setLearnerMode,
    getProgress, getLessonProgress, markLessonStarted, markItemSeen, markLessonCompleted
  };
})(window);
