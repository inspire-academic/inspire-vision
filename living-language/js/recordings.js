/* The Living Language Project — real audio recordings client.
   Backed by Supabase (living_language.recordings + the
   living-language-audio storage bucket — see
   supabase/living_language_schema_v1_recordings.sql, which someone
   with Supabase dashboard access must run before any of this works).

   Nothing uploaded here is ever presented to a learner until a human
   explicitly approves it via setStatus() — matches the same
   never-auto-verify rule store.js and learn-data.js already enforce
   for text content. See INSPIRE-VISION-LANGUAGE-PRESERVATION-MANUAL.md
   for how a recording gets from a contributor to this pipeline. */

(function (global) {
  'use strict';

  const BUCKET = 'living-language-audio';
  const SCHEMA = 'living_language';

  function publicUrlFor(db, storagePath) {
    return db.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
  }

  /**
   * @param {{conceptId:string, audioKind:'name'|'sound', file:File, speakerName?:string, contributorNote?:string}} input
   */
  async function uploadRecording({ conceptId, audioKind, file, speakerName, contributorNote }) {
    if (!conceptId || !audioKind || !file) return { ok: false, error: 'Missing letter, audio type, or file.' };
    try {
      const db = await window.getDB();
      const ext = (file.name.split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp3';
      const path = `${conceptId}/${audioKind}-${Date.now()}.${ext}`;

      const { error: uploadError } = await db.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || 'audio/mpeg',
      });
      if (uploadError) return { ok: false, error: uploadError.message };

      const { data, error } = await db.schema(SCHEMA).from('recordings').insert({
        concept_type: 'alphabet_letter',
        concept_id: conceptId,
        audio_kind: audioKind,
        storage_path: path,
        speaker_name: speakerName || null,
        contributor_note: contributorNote || null,
      }).select().single();
      if (error) return { ok: false, error: error.message };

      return { ok: true, recording: data };
    } catch (err) {
      return { ok: false, error: err.message || 'Upload failed.' };
    }
  }

  /** All recordings, newest first, each with a ready-to-play publicUrl. */
  async function listAll() {
    try {
      const db = await window.getDB();
      const { data, error } = await db.schema(SCHEMA).from('recordings')
        .select('*')
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(r => Object.assign({}, r, { publicUrl: publicUrlFor(db, r.storage_path) }));
    } catch (err) {
      console.warn('[Recordings] listAll failed', err);
      return [];
    }
  }

  /** Admin review action — the only way a recording can become audible to learners. */
  async function setStatus(id, status, reviewerNote) {
    try {
      const db = await window.getDB();
      const { error } = await db.schema(SCHEMA).from('recordings')
        .update({ verification_status: status, reviewed_at: new Date().toISOString(), reviewer_note: reviewerNote || null })
        .eq('id', id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message || 'Update failed.' };
    }
  }

  /**
   * Approved alphabet audio only, shaped for learn-data.js's ALPHABET
   * items: { alphabet_a: { name: url, sound: url }, ... }. Fails soft —
   * an unreachable database just means every letter keeps showing
   * "recording being prepared", never a broken page.
   */
  async function fetchApprovedAlphabetAudio() {
    try {
      const db = await window.getDB();
      const { data, error } = await db.schema(SCHEMA).from('recordings')
        .select('concept_id, audio_kind, storage_path')
        .eq('concept_type', 'alphabet_letter')
        .eq('verification_status', 'approved');
      if (error) throw error;
      const map = {};
      (data || []).forEach(r => {
        if (!map[r.concept_id]) map[r.concept_id] = {};
        map[r.concept_id][r.audio_kind] = publicUrlFor(db, r.storage_path);
      });
      return map;
    } catch (err) {
      console.warn('[Recordings] fetchApprovedAlphabetAudio failed — alphabet audio stays "being prepared"', err);
      return {};
    }
  }

  global.LivingLanguageRecordings = { uploadRecording, listAll, setStatus, fetchApprovedAlphabetAudio };
})(window);
