const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.primary-nav');
menuButton?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open));
});
nav?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
  nav.classList.remove('open');
  menuButton?.setAttribute('aria-expanded','false');
}));

document.getElementById('year').textContent = new Date().getFullYear();

const { questions, structureLabels: STRUCTURE_LABELS, readinessLabels: READINESS_LABELS, stages } = window.LordsConsultConfig;
const { buildResultModel } = window.LordsConsultEngine;

let step = 0;
let answers = {};
let lastResult = null;
let sessionId = null;

const modal = document.getElementById('diagnostic-modal');
const host = document.getElementById('question-host');
const bar = document.getElementById('progress-bar');
const progressWrap = bar.parentElement;
const prev = document.getElementById('prev-question');
const next = document.getElementById('next-question');
const modalActions = document.getElementById('modal-actions');
const modalIntro = document.getElementById('modal-intro');
const prototypeNote = document.getElementById('prototype-note');
const INTRO_TEXT = modalIntro.textContent;
const NOTE_TEXT = prototypeNote.textContent;

function renderQuestion(){
  const item = questions[step];
  host.innerHTML = `<p class="eyebrow">QUESTION ${step+1} OF ${questions.length}</p><h3>${item.q}</h3><div class="answers">${item.a.map((text,i)=>`<label class="answer"><input type="radio" name="q${step}" value="${i}" ${answers[step]==i?'checked':''}><span>${text}</span></label>`).join('')}</div>`;
  bar.style.width = `${((step+1)/questions.length)*100}%`;
  prev.disabled = step===0;
  next.textContent = step===questions.length-1 ? 'See My Result' : 'Next';
}

function resetDiagnostic(){
  step = 0;
  answers = {};
  lastResult = null;
  sessionId = null;
  delete modal.dataset.prefillRoute;
  progressWrap.style.display = '';
  modalActions.style.display = '';
  modalIntro.textContent = INTRO_TEXT;
  prototypeNote.textContent = NOTE_TEXT;
  renderQuestion();
}

document.querySelectorAll('[data-start-diagnostic]').forEach(el => el.addEventListener('click', e => {
  if (el.tagName === 'A') e.preventDefault();
  resetDiagnostic();
  modal.showModal();
}));

document.querySelectorAll('[data-route]').forEach(el => el.addEventListener('click', () => {
  const route = el.dataset.route;
  resetDiagnostic();
  modal.dataset.prefillRoute = route;
  modal.showModal();
}));

host.addEventListener('change', e => {
  if(e.target.matches('input[type=radio]')) answers[step] = Number(e.target.value);
});
prev.addEventListener('click', () => { if(step>0){step--;renderQuestion();} });
next.addEventListener('click', () => {
  const selected = host.querySelector('input:checked');
  if(!selected){ host.querySelector('.answers')?.animate([{transform:'translateX(-5px)'},{transform:'translateX(5px)'},{transform:'translateX(0)'}],{duration:220}); return; }
  answers[step] = Number(selected.value);
  if(step < questions.length-1){step++;renderQuestion();return;}
  finishDiagnostic();
});

function finishDiagnostic(){
  progressWrap.style.display = 'none';
  modalActions.style.display = 'none';
  modalIntro.textContent = '';
  prototypeNote.textContent = '';

  lastResult = buildResultModel(answers, modal.dataset.prefillRoute);
  sessionId = crypto.randomUUID();
  persistSession();
  renderResult();
}

// Best-effort: the session record is a nice-to-have (BUILD-BRIEF.md section
// 9/11 want it for the future adviser dashboard) but must never block the
// visitor from seeing their result or contacting Lords Consult.
//
// The column set here is fixed by lords_consult_schema.sql. `stage` is
// derived from readiness_key on read, so it is deliberately NOT sent — an
// unknown column would make PostgREST reject the whole insert.
async function persistSession(){
  try {
    const db = await getDB();
    const { scores } = lastResult;
    const { error } = await db.schema('lords_consult').from('diagnostic_sessions').insert({
      id: sessionId,
      answers,
      structure_scores: scores.structure,
      readiness_scores: scores.readiness,
      structure_key: scores.topStructure.key,
      readiness_key: scores.topReadiness.key,
      result_family: lastResult.family,
      confidence: lastResult.confidence,
      route_prefill: modal.dataset.prefillRoute || null,
      source_page: location.pathname,
    });
    if (error) console.warn('Could not save diagnostic session:', error);
  } catch (err) {
    console.warn('Could not save diagnostic session:', err);
  }
}

// Four-stage marker. The current stage is flagged with aria-current as well
// as styling, so it doesn't rely on colour alone.
function stageIndicatorMarkup(current){
  return `<ol class="stage-indicator" aria-label="Your current stage">${stages.map((s,i) => `<li${s.key === current.key ? ' class="is-current" aria-current="step"' : ''}><span class="stage-indicator-no" aria-hidden="true">${i+1}</span>${s.label}</li>`).join('')}</ol>`;
}

function insightListMarkup(title, items, cls){
  if (!items.length) return '';
  return `<div class="insight ${cls}"><h4>${title}</h4><ul>${items.map(t => `<li>${t}</li>`).join('')}</ul></div>`;
}

function renderResult(){
  const r = lastResult;
  const insights = insightListMarkup('In your favour', r.strengths, 'insight-strength') + insightListMarkup('Worth addressing', r.risks, 'insight-risk');

  host.innerHTML = `
    <div class="result-panel">
      <span class="result-badge">${r.badge}</span>
      <h3>${r.title}</h3>
      ${stageIndicatorMarkup(r.stage)}
      <p class="result-stage">${r.stageMessage}</p>
      <p class="result-explain">${r.explain}</p>
      <p class="result-confidence">Readiness: <strong>${r.readiness.label}</strong>. ${r.confidenceText}</p>
      ${insights ? `<div class="insights">${insights}</div>` : ''}
      <h4 class="steps-title">Recommended next steps</h4>
      <ul class="result-steps">
        ${r.steps.map((s,i) => `<li><span>${i+1}.</span> ${s}</li>`).join('')}
      </ul>
      <p class="result-disclaimer">This is guidance, not legal, tax or regulated financial advice. A Lords Consult adviser reviews every result before formation.</p>
      ${contactFormMarkup()}
    </div>
  `;

  wireContactForm();
}

// A plain <div>, not a <form> — the whole diagnostic modal is already one
// <form method="dialog"> (so the × close button can cancel the dialog
// natively), and browsers silently drop a <form> nested inside a <form>
// (the element never makes it into the DOM, so wiring up submit/getElementById
// on it fails). Validation and field access below are done manually instead
// of relying on form semantics.
function contactFormMarkup(){
  return `
    <div class="contact-form" id="lead-form">
      <h4>${lastResult.consultationCTA.heading}</h4>
      <p class="form-lead">${lastResult.consultationCTA.lead}</p>
      <div class="form-field"><label for="lead-name">Full name</label><input id="lead-name" name="name" type="text" required autocomplete="name" /></div>
      <div class="form-field"><label for="lead-email">Email</label><input id="lead-email" name="email" type="email" required autocomplete="email" /></div>
      <div class="form-field"><label for="lead-phone">Phone (optional)</label><input id="lead-phone" name="phone" type="tel" autocomplete="tel" /></div>
      <label class="consent-row"><input type="checkbox" name="privacy_consent" required /><span>I agree to Lords Consult storing my diagnostic answers and contact details to provide my result and follow up about this enquiry.</span></label>
      <label class="consent-row"><input type="checkbox" name="marketing_consent" /><span>I’d also like to receive occasional emails about Lords Consult services (optional — unsubscribe anytime).</span></label>
      <div class="form-field" style="position:absolute;left:-9999px" aria-hidden="true"><label for="lead-website">Leave this field blank</label><input id="lead-website" name="website" type="text" tabindex="-1" autocomplete="off" /></div>
      <p class="form-status" id="lead-form-status" role="status"></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="skip-contact">Maybe later</button>
        <button type="button" class="btn btn-primary" id="send-lead">Send My Details</button>
      </div>
    </div>
  `;
}

function wireContactForm(){
  const form = document.getElementById('lead-form');
  const status = document.getElementById('lead-form-status');
  const skip = document.getElementById('skip-contact');
  const sendBtn = document.getElementById('send-lead');
  const field = (name) => form.querySelector(`[name="${name}"]`);
  skip?.addEventListener('click', () => modal.close());

  sendBtn.addEventListener('click', async () => {
    const requiredFields = form.querySelectorAll('[required]');
    for (const el of requiredFields) {
      if (!el.checkValidity()) { el.reportValidity(); return; }
    }
    if (field('website').value.trim()) return; // honeypot — real visitors never fill this

    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
    status.textContent = '';
    status.className = 'form-status';

    const payload = {
      session_id: sessionId,
      full_name: field('name').value.trim(),
      email: field('email').value.trim().toLowerCase(),
      phone: field('phone').value.trim() || null,
      marketing_consent: field('marketing_consent').checked,
      privacy_consent: field('privacy_consent').checked,
      result_family: lastResult.family,
      structure_key: lastResult.scores.topStructure.key,
      readiness_key: lastResult.scores.topReadiness.key,
      source_page: location.pathname,
    };

    try {
      const db = await getDB();
      const { error } = await db.schema('lords_consult').from('leads').insert(payload);
      if (error) throw error;

      // Best-effort organiser notification — the lead is already saved
      // regardless of whether this succeeds (same pattern as
      // notify-pink-powerful.js / notify-help-request.js).
      fetch('/.netlify/functions/notify-lords-consult-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: payload.full_name,
          email: payload.email,
          phone: payload.phone,
          resultFamily: lastResult.family,
          structureLabel: STRUCTURE_LABELS[lastResult.scores.topStructure.key],
          readinessLabel: READINESS_LABELS[lastResult.scores.topReadiness.key],
          marketingConsent: payload.marketing_consent,
        }),
      }).catch(err => console.warn('Could not send lead notification email:', err));

      renderThanks();
    } catch (err) {
      console.error(err);
      status.textContent = 'We could not save your details just now. Please try again or email us directly.';
      status.className = 'form-status error';
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send My Details';
    }
  });
}

function renderThanks(){
  host.innerHTML = `
    <div class="thanks-panel">
      <span class="result-badge">Thank you</span>
      <h3>We’ll be in touch</h3>
      <p>A member of the Lords Consult team will follow up by email to arrange your Idea-to-Organisation Strategy Session.</p>
      <div class="modal-actions"><span></span><button type="button" class="btn btn-primary" id="close-thanks">Close</button></div>
    </div>
  `;
  document.getElementById('close-thanks').addEventListener('click', () => modal.close());
}
