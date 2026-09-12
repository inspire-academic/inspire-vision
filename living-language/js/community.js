/* The Living Language Project — community corpus renderer.

   Shared by the four community pages (muo-ni.html, proverbs.html,
   folk-songs.html, folk-tales.html) and their hub (community/index.html),
   the same "one small engine, several thin pages" pattern learn-engine.js
   uses for lessons. Reads real approved submissions from
   LivingLanguageStore — never seeds or invents Krobo content. An empty
   corpus renders an honest "nothing collected yet" state, matching the
   Learn Klo "being prepared" discipline (see README). */

(function (global) {
  'use strict';

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function corpusCardHtml(entry) {
    const krobo = entry.kroboTranscription ? `<div class="ll-corpus-krobo">${escapeHtml(entry.kroboTranscription)}</div>` : '';
    const english = entry.englishMeaning ? `<p class="ll-corpus-en">${escapeHtml(entry.englishMeaning)}</p>` : '';
    const notes = entry.culturalNotes ? `<p class="ll-corpus-notes">${escapeHtml(entry.culturalNotes)}</p>` : '';
    const contributor = entry.speakerName ? escapeHtml(entry.speakerName) : 'Anonymous contributor';
    const variant = entry.community ? `<span class="ll-corpus-tag">${escapeHtml(entry.community)}</span>` : '';
    return `
      <article class="ll-corpus-card">
        ${variant}
        ${krobo || english ? '' : '<p class="ll-corpus-en" style="color:var(--ll-ink-mute);font-style:italic;">Transcription pending — recorded but not yet transcribed by our language team.</p>'}
        ${krobo}
        ${english}
        ${notes}
        <div class="ll-corpus-credit">Shared by ${contributor}</div>
      </article>`;
  }

  /**
   * @param {{contentType:string, containerId:string, emptyStateHtml:string, viewerAccess?:string}} opts
   */
  function renderCommunityGallery(opts) {
    const container = document.getElementById(opts.containerId);
    if (!container) return;
    const entries = (global.LivingLanguageStore ? global.LivingLanguageStore.listApprovedByContentType(opts.contentType, opts.viewerAccess) : []).slice().reverse();
    container.innerHTML = entries.length
      ? entries.map(corpusCardHtml).join('')
      : `<div class="ll-corpus-empty">${opts.emptyStateHtml}</div>`;
  }

  /**
   * Small "help us name this in Krobo" widget for the two sections
   * launched with English labels only (Folk Songs/Dirges/Chants, Folk
   * Tales). Writes to LivingLanguageStore's naming-suggestions bucket,
   * kept separate from content submissions/review queue.
   * @param {{containerId:string, sectionLabel:string}} opts
   */
  function renderNamingCallout(opts) {
    const container = document.getElementById(opts.containerId);
    if (!container) return;
    container.innerHTML = `
      <div class="ll-naming-callout">
        <strong>Help us name this in Krobo</strong>
        <p>We haven't yet been given a Krobo name for &ldquo;${escapeHtml(opts.sectionLabel)}.&rdquo; If you know the proper term your family or community uses, share it below — this is itself a contribution to the corpus.</p>
        <div class="ll-field"><label>Suggested Krobo name</label><input type="text" id="llNameSuggest" placeholder="e.g. the term your elders use"></div>
        <div class="ll-field"><label>Why this term? <span class="optional">(optional)</span></label><textarea id="llNameReason" placeholder="Any context that helps our language team confirm it"></textarea></div>
        <div class="ll-field"><label>Your name <span class="optional">(optional)</span></label><input type="text" id="llNameSubmitter" placeholder="Optional — for follow-up"></div>
        <button class="btn btn-outline-dark btn-sm" id="llNameSubmitBtn" type="button">Suggest This Name</button>
        <p class="ll-naming-confirm" id="llNameConfirm" hidden>Thank you — this suggestion has been saved for our language team's review.</p>
      </div>`;
    document.getElementById('llNameSubmitBtn').addEventListener('click', () => {
      const suggestedName = document.getElementById('llNameSuggest').value.trim();
      if (!suggestedName) { alert('Please enter a suggested name.'); return; }
      global.LivingLanguageStore.submitNamingSuggestion({
        sectionLabel: opts.sectionLabel,
        suggestedName,
        reasoning: document.getElementById('llNameReason').value.trim(),
        submitterName: document.getElementById('llNameSubmitter').value.trim()
      });
      document.getElementById('llNameConfirm').hidden = false;
      document.getElementById('llNameSuggest').value = '';
      document.getElementById('llNameReason').value = '';
      document.getElementById('llNameSubmitter').value = '';
    });
  }

  global.LivingLanguageCommunity = { renderCommunityGallery, renderNamingCallout };
})(window);
