// ============================================================
// INSPIRE VISION™ - "Watch Our Story" video lightbox
// Reuses the same overlay pattern as index.html's .flyer-lightbox
// (fixed full-screen div, class-toggled open state, Esc/backdrop to close).
// Include with: <script src="assets/watch-story.js" defer></script>
// Then trigger with: onclick="event.preventDefault(); openWatchStory()"
//
// Accessibility: captions ship as a WebVTT track (toggleable via the
// native player's CC control) rather than being burned into the video, and
// a <details> transcript is always available to screen readers. Autoplay
// on open is skipped when the visitor has requested reduced motion —
// their first frame is the poster, and they start playback themselves.
// ============================================================

const WATCH_STORY_CONFIG = {
  videoSrc: 'assets/video/our-story/our-story.mp4',
  posterSrc: 'assets/video/our-story/poster.png',
  captionsSrc: 'assets/video/our-story/our-story.vtt',
  transcript: [
    'Every person is more than the marks they achieve.',
    'Because education is not only about what we know…',
    '…it is also about who we are becoming.',
    'So we began building a place where knowledge, character, wellbeing, faith and purpose grow together.',
    'Because when people flourish, families strengthen. Communities change.',
    'And generations can write a different story.',
    'This is Inspire Vision.',
  ],
};

function injectWatchStoryStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .watch-story-lightbox {
      position: fixed;
      inset: 0;
      z-index: 600;
      background: rgba(5,10,20,0.94);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 3rem 1.5rem;
    }
    .watch-story-lightbox.open { display: flex; }
    .watch-story-panel { display: flex; flex-direction: column; gap: 0.85rem; width: min(92vw, 960px); }
    .watch-story-panel video {
      width: 100%;
      max-height: 78vh;
      border-radius: 6px;
      box-shadow: 0 30px 80px rgba(0,0,0,0.6);
      background: #0A1628;
      display: block;
    }
    .watch-story-transcript {
      color: rgba(255,255,255,0.7);
      font-size: 0.85rem;
      line-height: 1.6;
    }
    .watch-story-transcript summary {
      color: rgba(255,255,255,0.85);
      cursor: pointer;
      font-size: 0.85rem;
      margin-bottom: 0.5rem;
    }
    .watch-story-transcript p { margin: 0 0 0.5rem; }
    .watch-story-close {
      position: absolute;
      top: 1.5rem;
      right: 1.75rem;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.2);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .watch-story-close:hover { background: var(--gold, #C9971C); color: var(--navy, #0A1628); }
    .watch-story-close svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 2; }
  `;
  document.head.appendChild(style);
}

function injectWatchStoryMarkup() {
  const wrap = document.createElement('div');
  wrap.className = 'watch-story-lightbox';
  wrap.id = 'watch-story-lightbox';

  const transcriptHtml = WATCH_STORY_CONFIG.transcript.map((line) => `<p>${line}</p>`).join('');

  wrap.innerHTML = `
    <button class="watch-story-close" id="watch-story-close" aria-label="Close">
      <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
    <div class="watch-story-panel">
      <video id="watch-story-video" controls preload="none" playsinline webkit-playsinline
        poster="${WATCH_STORY_CONFIG.posterSrc}">
        <source data-src="${WATCH_STORY_CONFIG.videoSrc}" type="video/mp4">
        <track kind="captions" srclang="en" label="English" src="${WATCH_STORY_CONFIG.captionsSrc}">
        Your browser does not support the video tag.
      </video>
      <details class="watch-story-transcript">
        <summary>Transcript</summary>
        ${transcriptHtml}
      </details>
    </div>
  `;
  document.body.appendChild(wrap);

  const lightbox = document.getElementById('watch-story-lightbox');
  const video = document.getElementById('watch-story-video');

  function closeWatchStory() {
    lightbox.classList.remove('open');
    video.pause();
  }

  document.getElementById('watch-story-close').addEventListener('click', closeWatchStory);
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeWatchStory(); });
  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') closeWatchStory();
  });

  window.openWatchStory = function openWatchStory() {
    const source = video.querySelector('source');
    if (source.dataset.src && !source.src) {
      source.src = source.dataset.src;
      video.load();
    }
    lightbox.classList.add('open');
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reducedMotion) {
      video.play().catch(() => {});
    }
  };
}

injectWatchStoryStyles();
injectWatchStoryMarkup();
