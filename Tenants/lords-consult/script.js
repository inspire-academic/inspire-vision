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

const questions = [
  {q:'What are you hoping to build?', a:['A business that generates income for its owners','An organisation that benefits a community','A charity addressing a recognised public need','I am not sure']},
  {q:'Who will mainly benefit?', a:['Paying customers','A defined community','Members of the public experiencing disadvantage','A mixture']},
  {q:'How will the organisation earn money?', a:['Selling products or services','Contracts and commissioned services','Grants and donations','A mixture','I do not know yet']},
  {q:'What should happen to any profit?', a:['It can be paid to the owners','Most should be reinvested into community benefit','Everything should support charitable purposes','I am unsure']},
  {q:'Who should control the organisation?', a:['Me as the owner','A small board led by me','Independent trustees','I am unsure']},
  {q:'Would you like to own shares or potentially sell the organisation?', a:['Yes','No','I do not know']},
  {q:'Have you spoken to potential customers or beneficiaries?', a:['Yes, and I have clear evidence','I have spoken to a few','Not yet']},
  {q:'Have you tested the idea?', a:['Yes, through a pilot or existing service','Informally','Not yet']},
  {q:'Do you have other people ready to take legal responsibility?', a:['Yes','Possibly','No']},
  {q:'How soon do you want to launch?', a:['Within one month','Within three months','Within six months','I am still exploring']},
  {q:'What is your biggest challenge?', a:['Choosing the correct structure','Turning the idea into a workable service','Finding funding','Governance and policies','Registration','Managing an existing organisation']},
  {q:'What level of support do you want?', a:['Advice and a roadmap','Registration and setup','Complete organisation development','Ongoing management support']}
];

// Per-question, per-answer-index point weights feeding the two independent
// axes from BUILD-BRIEF.md section 6: Structure Fit (business | cic |
// charity | specialist) and Venture Readiness (explore | validate |
// prepare | formation_ready | already_operating). Index i here scores
// questions[i]. Weights are deliberately simple/additive — good enough to
// route visitors to one of the 5 result families without pretending to be
// a validated psychometric instrument.
const SCORING = [
  { 0:{structure:{business:3}}, 1:{structure:{cic:3}}, 2:{structure:{charity:3}}, 3:{structure:{specialist:2}} },
  { 0:{structure:{business:2}}, 1:{structure:{cic:2}}, 2:{structure:{charity:2}}, 3:{structure:{business:1,cic:1}} },
  { 0:{structure:{business:2}}, 1:{structure:{cic:2}}, 2:{structure:{charity:2}}, 3:{structure:{cic:1}}, 4:{structure:{specialist:1}} },
  { 0:{structure:{business:2}}, 1:{structure:{cic:2}}, 2:{structure:{charity:2}}, 3:{structure:{specialist:1}} },
  { 0:{structure:{business:2}}, 1:{structure:{cic:2}}, 2:{structure:{charity:2}}, 3:{structure:{specialist:1}} },
  { 0:{structure:{business:2}}, 1:{structure:{cic:1,charity:1}}, 2:{structure:{specialist:1}} },
  { 0:{readiness:{prepare:2,formation_ready:1}}, 1:{readiness:{validate:2}}, 2:{readiness:{explore:2}} },
  { 0:{readiness:{formation_ready:2,prepare:1}}, 1:{readiness:{validate:2}}, 2:{readiness:{explore:2}} },
  { 0:{readiness:{formation_ready:2}}, 1:{readiness:{prepare:1}}, 2:{readiness:{explore:1}} },
  { 0:{readiness:{formation_ready:2}}, 1:{readiness:{prepare:2}}, 2:{readiness:{validate:1}}, 3:{readiness:{explore:2}} },
  { 0:{readiness:{explore:1},structure:{specialist:1}}, 1:{readiness:{validate:1}}, 2:{readiness:{prepare:1}}, 3:{readiness:{prepare:1}}, 4:{readiness:{formation_ready:1}}, 5:{readiness:{already_operating:2}} },
  { 0:{readiness:{explore:1}}, 1:{readiness:{formation_ready:1}}, 2:{readiness:{prepare:1}}, 3:{readiness:{already_operating:2}} },
];

const STRUCTURE_LABELS = { business:'Commercial Business', cic:'Community Interest Company (CIC) / Social Enterprise', charity:'Charity / CIO', specialist:'Needs Specialist Review' };
const READINESS_LABELS = { explore:'Explore', validate:'Validate', prepare:'Prepare', formation_ready:'Formation Ready', already_operating:'Already Operating' };

const FAMILY_COPY = {
  commercial_business: {
    badge: 'Commercial Business Route',
    title: 'A commercial business looks like your best fit',
    explain: () => 'Your answers point toward a standard business structure (sole trader or limited company) rather than a CIC or charity — you’re aiming to earn income for yourself as the owner, keep control, and you’re comfortable with profit belonging to you.',
    steps: [
      'Confirm sole trader vs. limited company based on liability and tax.',
      'Validate pricing and early demand with a small number of real customers.',
      'Register your chosen structure and set up basic bookkeeping before you trade.',
    ],
  },
  social_enterprise_cic: {
    badge: 'Social Enterprise / CIC Route',
    title: 'A Community Interest Company looks like your best fit',
    explain: () => 'Your answers describe trading to benefit a defined community, with profit mostly reinvested and shared or accountable control — that points to the CIC model rather than a standard business or a charity.',
    steps: [
      'Draft your community interest statement and consider an asset lock.',
      'Decide CIC limited-by-guarantee vs. limited-by-shares with a small board.',
      'Map out how trading income will fund the community benefit you described.',
    ],
  },
  charity_cio: {
    badge: 'Charity / CIO Route',
    title: 'A charity or CIO looks like your best fit',
    explain: () => 'Your answers point to a public-benefit purpose funded mainly by grants and donations, with control sitting with independent trustees rather than you personally — that points to a charity/CIO rather than a business or CIC.',
    steps: [
      'Write your charitable purposes in the wording the regulator expects.',
      'Identify trustees who are independent of you and understand their duties.',
      'Map early funding — grants, donations — before committing to structure.',
    ],
  },
  pilot_first: {
    badge: 'Pilot-First Route',
    title: 'Don’t form a structure yet — pilot the idea first',
    explain: (structureLabel) => `Your likely long-term direction is ${structureLabel}, but your answers show the idea itself isn’t tested enough yet to commit to a formal structure. Forming now would lock you into governance, cost and reporting you don’t need before you know the idea works.`,
    steps: [
      'Run a small, low-cost pilot with real customers or beneficiaries.',
      'Collect evidence of demand or need before choosing a legal structure.',
      'Revisit the structure question once you have real pilot evidence.',
    ],
  },
  specialist_review: {
    badge: 'Specialist Review Required',
    title: 'Your answers need a specialist review',
    explain: () => 'Your answers mix signals across business, CIC and charity models, or left key questions open — that’s common and not a problem, but it means this tool shouldn’t pick your structure for you. A Lords Consult adviser should review your answers directly.',
    steps: [
      'Book a strategy session so an adviser can review your specific answers.',
      'Bring your thinking on funding, control and who benefits.',
      'Avoid registering a structure until this review is complete.',
    ],
  },
};

const CONFIDENCE_TEXT = {
  high: 'High confidence — your answers point clearly in one direction.',
  moderate: 'Moderate confidence — a strong starting point, worth confirming with an adviser.',
  low: 'Low confidence — your answers are mixed, so treat this as a starting point rather than a final answer.',
};

function pickTop(scores){
  const entries = Object.entries(scores).sort((a,b) => b[1]-a[1]);
  const [topKey, topVal] = entries[0];
  const second = entries[1] ? entries[1][1] : 0;
  return { key: topKey, value: topVal, margin: topVal - second };
}

function scoreDiagnostic(allAnswers, prefillRoute){
  const structure = { business:0, cic:0, charity:0, specialist:0 };
  const readiness = { explore:0, validate:0, prepare:0, formation_ready:0, already_operating:0 };

  SCORING.forEach((weights, stepIndex) => {
    const w = weights[allAnswers[stepIndex]];
    if (!w) return;
    if (w.structure) Object.entries(w.structure).forEach(([k,v]) => { structure[k] += v; });
    if (w.readiness) Object.entries(w.readiness).forEach(([k,v]) => { readiness[k] += v; });
  });

  // A route clicked on the landing page is a soft hint only (BUILD-BRIEF.md
  // section 5) — small enough that real answers always outweigh it.
  if (prefillRoute && prefillRoute in structure) structure[prefillRoute] += 0.5;

  const topStructure = pickTop(structure);
  const topReadiness = pickTop(readiness);

  let family;
  if (topStructure.key === 'specialist') family = 'specialist_review';
  else if (topReadiness.key === 'explore' || topReadiness.key === 'validate') family = 'pilot_first';
  else family = { business:'commercial_business', cic:'social_enterprise_cic', charity:'charity_cio' }[topStructure.key];

  const confidence = topStructure.margin >= 4 ? 'high' : topStructure.margin >= 2 ? 'moderate' : 'low';

  return { structure, readiness, topStructure, topReadiness, family, confidence };
}

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

  lastResult = scoreDiagnostic(answers, modal.dataset.prefillRoute);
  sessionId = crypto.randomUUID();
  persistSession();
  renderResult();
}

// Best-effort: the session record is a nice-to-have (BUILD-BRIEF.md section
// 9/11 want it for the future adviser dashboard) but must never block the
// visitor from seeing their result or contacting Lords Consult.
async function persistSession(){
  try {
    const db = await getDB();
    const { error } = await db.schema('lords_consult').from('diagnostic_sessions').insert({
      id: sessionId,
      answers,
      structure_scores: lastResult.structure,
      readiness_scores: lastResult.readiness,
      structure_key: lastResult.topStructure.key,
      readiness_key: lastResult.topReadiness.key,
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

function renderResult(){
  const copy = FAMILY_COPY[lastResult.family];
  const structureLabel = STRUCTURE_LABELS[lastResult.topStructure.key];
  const readinessLabel = READINESS_LABELS[lastResult.topReadiness.key];
  const stageNote = lastResult.topReadiness.key === 'already_operating'
    ? ' — you told us you already have something running; a specialist review can confirm whether your current structure still fits.'
    : '';

  host.innerHTML = `
    <div class="result-panel">
      <span class="result-badge">${copy.badge}</span>
      <h3>${copy.title}</h3>
      <p class="result-stage">Current stage: <strong>${readinessLabel}</strong>${stageNote}</p>
      <p class="result-explain">${copy.explain(structureLabel)}</p>
      <p class="result-confidence">${CONFIDENCE_TEXT[lastResult.confidence]}</p>
      <ul class="result-steps">
        ${copy.steps.map((s,i) => `<li><span>${i+1}.</span> ${s}</li>`).join('')}
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
      <h4>Get your full write-up and book your strategy session</h4>
      <p class="form-lead">Share your details and Lords Consult will follow up to arrange your paid Idea-to-Organisation Strategy Session.</p>
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
      structure_key: lastResult.topStructure.key,
      readiness_key: lastResult.topReadiness.key,
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
          structureLabel: STRUCTURE_LABELS[lastResult.topStructure.key],
          readinessLabel: READINESS_LABELS[lastResult.topReadiness.key],
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
