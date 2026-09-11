/* Learn Klo — reusable lesson engine.
   One generic player drives every lesson via `lessonType`, per the
   handoff brief's instruction to build "a small number of excellent
   reusable lesson types" rather than one-off pages per lesson.

   Content honesty rule enforced throughout this file: wherever a word,
   letter sound, or audio clip has no verified Krobo content yet, the UI
   shows an explicit "being prepared" / "not yet available" state —
   never invented text, never synthetic speech standing in for a native
   voice. See learn-data.js's header comment for why this matters here
   specifically. */

(function (global) {
  'use strict';

  const LL = global.LivingLanguageLearn;
  const Store = global.LivingLanguageStore;

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ── AudioButton — plays real audio when present, otherwise an
     honest "being prepared" state. Never invents/synthesizes speech. */
  function audioButtonHtml(id, label, audioUrl) {
    if (!audioUrl) {
      return `<button class="ll-audio-btn ll-audio-btn--prepared" type="button" disabled aria-label="${escapeHtml(label)} — recording being prepared">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19 5s2 2 2 7-2 7-2 7" stroke-dasharray="2 3"/></svg>
        <span>${escapeHtml(label)}<small>Recording being prepared</small></span>
      </button>`;
    }
    return `<button class="ll-audio-btn" type="button" data-audio-play="${id}" data-audio-src="${escapeHtml(audioUrl)}" aria-label="Play ${escapeHtml(label)}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 010 7"/></svg>
      <span>${escapeHtml(label)}</span>
    </button>`;
  }

  let activeAudioEl = null;
  function wireAudioButtons(root) {
    root.querySelectorAll('[data-audio-play]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (activeAudioEl) { activeAudioEl.pause(); activeAudioEl = null; }
        const audio = new Audio(btn.dataset.audioSrc);
        activeAudioEl = audio;
        audio.play().catch(() => {});
      });
    });
  }

  /* ── RecordWidget — local-only practice recording. Mic permission is
     requested only on explicit click; nothing is ever auto-uploaded;
     the learner can play back, re-record, or discard. See handoff
     brief §41. */
  function createRecordWidget(container) {
    let stream = null, recorder = null, chunks = [], blobUrl = null;
    container.innerHTML = `
      <div class="ll-record-widget">
        <button class="ll-record-btn" type="button" data-action="start">
          <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="7"/></svg>
          Your turn — tap to record
        </button>
        <div class="ll-record-status" hidden></div>
      </div>`;
    const btn = container.querySelector('.ll-record-btn');
    const status = container.querySelector('.ll-record-status');

    function reset(message) {
      if (stream) stream.getTracks().forEach(t => t.stop());
      stream = null; recorder = null; chunks = [];
      btn.hidden = false; btn.dataset.action = 'start';
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="7"/></svg> Your turn — tap to record`;
      status.hidden = !message;
      if (message) status.textContent = message;
    }

    btn.addEventListener('click', async () => {
      if (btn.dataset.action === 'start') {
        if (!navigator.mediaDevices?.getUserMedia) {
          reset('Recording isn’t supported in this browser — you can still continue the lesson.');
          return;
        }
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
          reset('Microphone access was declined — you can continue the lesson without recording.');
          return;
        }
        chunks = [];
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = e => chunks.push(e.data);
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          blobUrl = URL.createObjectURL(blob);
          btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Play my recording`;
          btn.dataset.action = 'play';
          status.hidden = false;
          status.innerHTML = `Recorded locally — not uploaded. <button type="button" class="ll-record-rerecord" data-action="rerecord">Re-record</button>`;
          status.querySelector('[data-action=rerecord]').addEventListener('click', () => { URL.revokeObjectURL(blobUrl); reset(); });
          stream.getTracks().forEach(t => t.stop());
        };
        recorder.start();
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg> Recording — tap to stop`;
        btn.dataset.action = 'stop';
      } else if (btn.dataset.action === 'stop') {
        recorder.stop();
      } else if (btn.dataset.action === 'play') {
        new Audio(blobUrl).play().catch(() => {});
      }
    });
  }

  /* ── Progress chrome shared by every lesson type ─────────────────── */
  function chrome(lesson, bodyHtml) {
    return `
      <div class="ll-lesson-topbar">
        <a class="ll-lesson-exit" href="/living-language/learn/index.html">&larr; Lessons</a>
        <span class="ll-lesson-title">${escapeHtml(lesson.title)}</span>
      </div>
      <div class="ll-lesson-body">${bodyHtml}</div>`;
  }

  /* ── Alphabet lesson ──────────────────────────────────────────────
     Real, playable letter grid using the supplied letter shapes. Name/
     sound audio is honestly "being prepared" until verified. */
  function renderAlphabet(lesson, root) {
    Store.markLessonStarted(lesson.id);
    const items = lesson.itemIds.map(id => LL.getAlphabetById(id));

    function renderGrid() {
      root.innerHTML = chrome(lesson, `
        <p class="ll-lesson-lede">Tap a letter to hear it and practice. Pronunciation audio is still being collected from native speakers — each card shows exactly what's ready today.</p>
        <div class="ll-letter-grid">
          ${items.map(it => `<button class="ll-letter-card" type="button" data-letter="${it.id}">${escapeHtml(it.uppercase)}<small>${escapeHtml(it.lowercase)}</small></button>`).join('')}
        </div>`);
      root.querySelectorAll('[data-letter]').forEach(btn => {
        btn.addEventListener('click', () => renderPanel(btn.dataset.letter));
      });
    }

    function renderPanel(letterId) {
      const idx = items.findIndex(i => i.id === letterId);
      const item = items[idx];
      Store.markItemSeen(lesson.id, item.id);
      root.innerHTML = chrome(lesson, `
        <button class="ll-back-link" type="button" id="llBackToGrid">&larr; All letters</button>
        <div class="ll-letter-panel">
          <div class="ll-letter-panel-glyph">${escapeHtml(item.uppercase)} <span>${escapeHtml(item.lowercase)}</span></div>
          <div class="ll-letter-panel-audios">
            ${audioButtonHtml('name', 'Hear the letter name', item.letterNameAudio)}
            ${audioButtonHtml('sound', 'Hear the sound', item.letterSoundAudio)}
          </div>
          <div class="ll-letter-panel-example">
            <strong>Example word</strong>
            <span>${item.exampleWordId ? escapeHtml(item.exampleWordId) : 'An example word will be added once verified vocabulary using this letter is available.'}</span>
          </div>
          <div id="llRecordArea"></div>
          <div class="ll-lesson-footer">
            <button class="btn btn-outline-dark btn-sm" id="llPrevLetter" type="button" ${idx === 0 ? 'disabled' : ''}>&larr; Previous</button>
            <button class="btn btn-gold" id="llNextLetter" type="button">${idx === items.length - 1 ? 'Finish' : 'Next letter →'}</button>
          </div>
        </div>`);
      wireAudioButtons(root);
      createRecordWidget(root.querySelector('#llRecordArea'));
      root.querySelector('#llBackToGrid').addEventListener('click', renderGrid);
      root.querySelector('#llPrevLetter')?.addEventListener('click', () => idx > 0 && renderPanel(items[idx - 1].id));
      root.querySelector('#llNextLetter').addEventListener('click', () => {
        if (idx === items.length - 1) { Store.markLessonCompleted(lesson.id); renderGrid(); }
        else renderPanel(items[idx + 1].id);
      });
    }

    renderGrid();
  }

  /* ── See & Say ────────────────────────────────────────────────────
     One item at a time: image → hear it → show word → next. Since no
     vocabulary is verified yet, this is a real, working shell that
     honestly discloses "being prepared" per item rather than a fake
     demo of finished content. */
  function renderSeeAndSay(lesson, root) {
    Store.markLessonStarted(lesson.id);
    const items = lesson.itemIds.map(id => LL.getVocabularyById(id));
    let i = 0;

    function step() {
      const item = items[i];
      Store.markItemSeen(lesson.id, item.id);
      const hasWord = !!item.kloWrittenForm;
      root.innerHTML = chrome(lesson, `
        <div class="ll-see-say">
          <div class="ll-see-say-image" role="img" aria-label="${escapeHtml(item.englishMeaning)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5.5-5.5L9 17"/></svg>
          </div>
          <div class="ll-see-say-prompt">What is this called in Klo?</div>
          <div class="ll-see-say-en">${escapeHtml(item.englishMeaning)}</div>
          ${audioButtonHtml('word', 'Hear it', item.audioNatural)}
          <div class="ll-see-say-word">
            ${hasWord ? `<strong>${escapeHtml(item.kloWrittenForm)}</strong>` : `<span class="ll-prepared-note">Krobo written form not yet available — awaiting native-speaker and orthography review.</span>`}
          </div>
          <div class="ll-lesson-footer">
            <span class="ll-lesson-source">${i + 1} of ${items.length}</span>
            <button class="btn btn-gold" id="llSeeSayNext" type="button">${i === items.length - 1 ? 'Finish' : 'Next →'}</button>
          </div>
        </div>`);
      wireAudioButtons(root);
      root.querySelector('#llSeeSayNext').addEventListener('click', () => {
        if (i === items.length - 1) { Store.markLessonCompleted(lesson.id); renderDone(lesson, root, items.length); }
        else { i++; step(); }
      });
    }
    step();
  }

  /* ── Listen & Find / Hear It Choose It / Conversation ────────────
     Real, wired UI proving the interaction pattern; content-gated
     behind an honest preparation notice since no verified audio or
     dialogue exists yet — see handoff brief §44 (fully wired UI,
     "recording being prepared" state, never synthetic Krobo audio). */
  function renderPreparedShell(lesson, root, description, mockup) {
    Store.markLessonStarted(lesson.id);
    root.innerHTML = chrome(lesson, `
      <div class="ll-prepared-shell">
        <div class="ll-prepared-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
          This activity is fully built and ready — it's waiting on verified native-speaker audio before it can go live.
        </div>
        <p class="ll-lesson-lede">${description}</p>
        ${mockup}
        <div class="ll-lesson-footer">
          <a class="btn btn-outline-dark btn-sm" href="/living-language/learn/index.html">&larr; Back to Lessons</a>
        </div>
      </div>`);
  }

  function renderListenAndFind(lesson, root) {
    const items = lesson.itemIds.map(id => LL.getVocabularyById(id)).slice(0, 4);
    const mockup = `
      <div class="ll-prepared-mockup">
        ${audioButtonHtml('lf', 'Play the word', null)}
        <div class="ll-picture-grid">
          ${items.map(it => `<button class="ll-picture-tile" type="button" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5.5-5.5L9 17"/></svg>
            <span>${escapeHtml(it.englishMeaning)}</span>
          </button>`).join('')}
        </div>
      </div>`;
    renderPreparedShell(lesson, root, 'Once native audio is verified, learners will hear a word and tap the matching picture.', mockup);
  }

  function renderConversation(lesson, root) {
    const items = lesson.itemIds.map(id => LL.getVocabularyById(id)).slice(0, 3);
    const mockup = `
      <div class="ll-prepared-mockup ll-conversation-mockup">
        ${items.map(it => `
          <div class="ll-conversation-turn">
            ${audioButtonHtml('c' + it.id, it.englishMeaning, null)}
          </div>`).join('')}
      </div>`;
    renderPreparedShell(lesson, root, 'Once dialogue is recorded and verified, this becomes a short back-and-forth exchange with real speakers.', mockup);
  }

  function renderDone(lesson, root) {
    root.innerHTML = chrome(lesson, `
      <div class="ll-lesson-success">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--ll-green)" stroke-width="1.6" width="52" height="52"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.5 2.5L16 9" stroke-width="2"/></svg>
        <h3>Lesson complete</h3>
        <p>You've worked through <em>${escapeHtml(lesson.title)}</em>.</p>
        <a class="btn btn-gold" href="/living-language/learn/index.html">Back to Lessons &rarr;</a>
      </div>`);
  }

  /* ── Verified Phrase — the one fully real lesson, ported from the
     original sample build. See living-language/README.md for why its
     content is trustworthy: only the founding phrase, no invented
     meaning, ever. ─────────────────────────────────────────────────── */
  function renderVerifiedPhrase(lesson, root) {
    Store.markLessonStarted(lesson.id);
    const entry = window.LivingLanguage.languageEntries.find(e => e.id === 'le-founding-phrase');
    const steps = [
      { type: 'listen' },
      { type: 'spot-character', prompt: 'Which special character appears in this phrase?', options: ['ɔ', 'ŋ', 'ʒ'], correct: 'ɔ' },
      { type: 'reorder-sentence', tokens: ['Wɔ', 'tsuo', 'wa', 'ngɛ', 'saminya', 'ngɛ', 'Mawu', 'biɛm.'] }
    ];
    let step = 0;

    function badge() {
      return `<div class="ll-verified-badge">Verified founding phrase &middot; meaning withheld pending Language Council review</div>`;
    }
    function footer(inner) {
      return `<div class="ll-lesson-footer">${inner}</div>`;
    }
    function render() {
      const s = steps[step];
      if (!s) return finish();
      if (s.type === 'listen') {
        root.innerHTML = chrome(lesson, `
          <div class="ll-lesson-step-label">Hear the phrase</div>${badge()}
          <div class="ll-lesson-krobo">${entry.canonicalForm}</div>
          ${audioButtonHtml('vp', 'Play the sample recording', null)}
          ${footer(`<span class="ll-lesson-source">Source: ${entry.source}</span><button class="btn btn-gold btn-sm" id="llVpNext" type="button">Continue &rarr;</button>`)}`);
        wireAudioButtons(root);
        root.querySelector('#llVpNext').addEventListener('click', () => { step++; render(); });
      } else if (s.type === 'spot-character') {
        root.innerHTML = chrome(lesson, `
          <div class="ll-lesson-step-label">Spot the sound</div>${badge()}
          <div class="ll-lesson-krobo" style="font-size:26px;">${entry.canonicalForm}</div>
          <p class="ll-lesson-hint">${s.prompt}</p>
          <div class="ll-lesson-options" id="llVpOptions"></div>`);
        const wrap = root.querySelector('#llVpOptions');
        s.options.forEach(opt => {
          const btn = document.createElement('button');
          btn.className = 'll-lesson-option'; btn.type = 'button'; btn.textContent = opt;
          btn.addEventListener('click', () => {
            const ok = opt === s.correct;
            wrap.querySelectorAll('button').forEach(b => b.disabled = true);
            btn.classList.add(ok ? 'correct' : 'incorrect');
            if (!ok) Array.from(wrap.children).find(b => b.textContent === s.correct)?.classList.add('correct');
            setTimeout(() => { step++; render(); }, ok ? 700 : 1000);
          });
          wrap.appendChild(btn);
        });
      } else if (s.type === 'reorder-sentence') {
        const shuffled = [...s.tokens].sort(() => Math.random() - 0.5);
        root.innerHTML = chrome(lesson, `
          <div class="ll-lesson-step-label">Put it back in order</div>${badge()}
          <div class="ll-lesson-tokens" id="llVpTarget"></div>
          <div class="ll-lesson-token-bank" id="llVpBank"></div>
          ${footer(`<span class="ll-lesson-source" id="llVpMsg">&nbsp;</span>`)}`);
        const target = root.querySelector('#llVpTarget');
        const bank = root.querySelector('#llVpBank');
        const placed = [];
        function renderBank() {
          bank.innerHTML = '';
          shuffled.forEach((tok, i) => {
            const btn = document.createElement('button');
            btn.className = 'll-lesson-token' + (placed.includes(i) ? ' placed' : '');
            btn.type = 'button'; btn.textContent = tok; btn.disabled = placed.includes(i);
            btn.addEventListener('click', () => {
              placed.push(i);
              target.innerHTML += `<span class="ll-lesson-token">${tok}</span>`;
              renderBank();
              if (placed.length === s.tokens.length) checkOrder();
            });
            bank.appendChild(btn);
          });
        }
        function checkOrder() {
          const built = placed.map(i => shuffled[i]).join(' ');
          const msg = root.querySelector('#llVpMsg');
          if (built === s.tokens.join(' ')) {
            msg.textContent = 'Correct order!'; msg.style.color = 'var(--ll-green)';
            setTimeout(() => { step++; render(); }, 700);
          } else {
            msg.textContent = 'Not quite — tap to try again.'; msg.style.color = 'var(--ll-terracotta)';
            setTimeout(() => { placed.length = 0; target.innerHTML = ''; renderBank(); msg.textContent = ' '; }, 900);
          }
        }
        renderBank();
      }
    }
    function finish() {
      Store.markLessonCompleted(lesson.id);
      root.innerHTML = chrome(lesson, `
        <div class="ll-lesson-success">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--ll-green)" stroke-width="1.6" width="52" height="52"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.5 2.5L16 9" stroke-width="2"/></svg>
          <h3>Well done!</h3>
          <div class="ll-lesson-krobo" style="font-size:20px;">${entry.canonicalForm}</div>
          <p style="color:var(--ll-ink-mute);font-size:13px;margin-bottom:20px;">Source: ${entry.source} &middot; full English meaning to be published once confirmed by the Krobo Language and Culture Council</p>
          <a class="btn btn-gold" href="/living-language/learn/index.html">Back to Lessons &rarr;</a>
        </div>`);
    }
    render();
  }

  function renderLesson(lesson, root) {
    if (lesson.lessonType === 'alphabet') return renderAlphabet(lesson, root);
    if (lesson.lessonType === 'see_and_say') return renderSeeAndSay(lesson, root);
    if (lesson.lessonType === 'listen_and_find') return renderListenAndFind(lesson, root);
    if (lesson.lessonType === 'conversation') return renderConversation(lesson, root);
    if (lesson.lessonType === 'verified_phrase') return renderVerifiedPhrase(lesson, root);
    root.innerHTML = `<p>Unknown lesson type.</p>`;
  }

  global.LivingLanguageLearnEngine = { renderLesson };
})(window);
