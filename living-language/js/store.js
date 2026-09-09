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

  global.LivingLanguageStore = { submit, listSubmissions, updateSubmissionStatus, clearAll };
})(window);
