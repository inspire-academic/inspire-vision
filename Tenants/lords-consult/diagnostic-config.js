// Data for the Idea to Impact diagnostic. Pure configuration — no DOM, no
// scoring logic (see diagnostic-engine.js) and no rendering (see script.js).
//
// The wider methodology is PURPOSE -> IDEA -> STRUCTURE -> SYSTEM -> SCALE.
// The Business / CIC / Charity question is one decision inside the STRUCTURE
// stage, so a result carries two independent things: a ROUTE (which structure
// fits) and a STAGE (where the organisation is today). Stage assessment is
// derived from the existing Venture Readiness scores for now; see STAGES.
(function (root) {
  const config = {};

  config.questions = [
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
    {q:'What level of support do you want?', a:['Advice and a roadmap','Registration and setup','Complete organisation development','Ongoing management support']},
  ];

  // Per-question, per-answer-index point weights feeding the two independent
  // axes from BUILD-BRIEF.md section 6: Structure Fit (business | cic |
  // charity | specialist) and Venture Readiness (explore | validate |
  // prepare | formation_ready | already_operating). Index i here scores
  // questions[i]. Weights are deliberately simple/additive — good enough to
  // route visitors to one of the 5 result families without pretending to be
  // a validated psychometric instrument.
  config.scoring = [
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

  config.structureLabels = {
    business: 'Commercial Business',
    cic: 'Community Interest Company (CIC) / Social Enterprise',
    charity: 'Charity / CIO',
    specialist: 'Needs Specialist Review',
  };

  config.readinessLabels = {
    explore: 'Explore',
    validate: 'Validate',
    prepare: 'Prepare',
    formation_ready: 'Formation Ready',
    already_operating: 'Already Operating',
  };

  // The four working stages. PURPOSE is deliberately not a stage: it is the
  // foundation under all of them.
  config.stages = [
    { key: 'idea',      label: 'Idea',      summary: 'Clarify the vision.' },
    { key: 'structure', label: 'Structure', summary: 'Build on the right foundation.' },
    { key: 'system',    label: 'System',    summary: 'Make the organisation work.' },
    { key: 'scale',     label: 'Scale',     summary: 'Grow with discipline.' },
  ];

  // Stage is currently inferred from the readiness axis, because that is the
  // only stage-like signal the 12 questions collect. Nothing in the quiz can
  // yet tell SYSTEM from SCALE, so `already_operating` maps to SYSTEM (the
  // safer, earlier assumption). To assess SCALE properly, add questions on
  // performance and organisational maturity, score them onto a new axis, and
  // extend stageFor() in diagnostic-engine.js — nothing else has to change.
  config.readinessToStage = {
    explore: 'idea',
    validate: 'idea',
    prepare: 'structure',
    formation_ready: 'structure',
    already_operating: 'system',
  };

  // Client-facing stage message. `{routeLine}` is filled from the family's
  // routeLine; stages that are not about choosing a route ignore it.
  config.stageCopy = {
    idea: 'You appear to be at the IDEA stage. Before forming an organisation, it helps to clarify your purpose, who you are serving and how the idea will work in practice.',
    structure: 'You appear ready to move into STRUCTURE. {routeLine}',
    system: 'You already have something running. Your next priority appears to be SYSTEM: governance, operations and consistent delivery.',
    scale: 'Your organisation is established and may be ready for a SCALE review focused on performance, maturity and growth.',
  };

  config.confidenceText = {
    high: 'High confidence — your answers point clearly in one direction.',
    moderate: 'Moderate confidence — a strong starting point, worth confirming with an adviser.',
    low: 'Low confidence — your answers are mixed, so treat this as a starting point rather than a final answer.',
  };

  // One entry per result family. `route` is the structure key the family
  // stands for (null when the family deliberately does not pick one).
  // `recommendedService` values are working titles for the adviser side —
  // they are part of the result model but not shown to visitors, so confirm
  // the real service names with Lords Consult before ever surfacing them.
  config.families = {
    commercial_business: {
      badge: 'Commercial Business Route',
      title: 'A commercial business looks like your best fit',
      route: 'business',
      routeLine: 'A standard business structure (sole trader or limited company) may be the most suitable route based on your objectives.',
      explain: () => 'Your answers point toward a standard business structure (sole trader or limited company) rather than a CIC or charity — you’re aiming to earn income for yourself as the owner, keep control, and you’re comfortable with profit belonging to you.',
      steps: [
        'Confirm sole trader vs. limited company based on liability and tax.',
        'Validate pricing and early demand with a small number of real customers.',
        'Register your chosen structure and set up basic bookkeeping before you trade.',
      ],
      recommendedService: 'Business Formation Consultation',
    },
    social_enterprise_cic: {
      badge: 'Social Enterprise / CIC Route',
      title: 'A Community Interest Company looks like your best fit',
      route: 'cic',
      routeLine: 'A Community Interest Company may be one suitable route based on your objectives.',
      explain: () => 'Your answers describe trading to benefit a defined community, with profit mostly reinvested and shared or accountable control — that points to the CIC model rather than a standard business or a charity.',
      steps: [
        'Draft your community interest statement and consider an asset lock.',
        'Decide CIC limited-by-guarantee vs. limited-by-shares with a small board.',
        'Map out how trading income will fund the community benefit you described.',
      ],
      recommendedService: 'CIC Formation Consultation',
    },
    charity_cio: {
      badge: 'Charity / CIO Route',
      title: 'A charity or CIO looks like your best fit',
      route: 'charity',
      routeLine: 'A charity or CIO may be one suitable route based on your objectives.',
      explain: () => 'Your answers point to a public-benefit purpose funded mainly by grants and donations, with control sitting with independent trustees rather than you personally — that points to a charity/CIO rather than a business or CIC.',
      steps: [
        'Write your charitable purposes in the wording the regulator expects.',
        'Identify trustees who are independent of you and understand their duties.',
        'Map early funding — grants, donations — before committing to structure.',
      ],
      recommendedService: 'Charity / CIO Formation Consultation',
    },
    pilot_first: {
      badge: 'Pilot-First Route',
      title: 'Don’t form a structure yet — pilot the idea first',
      route: null,
      routeLine: '',
      explain: (structureLabel) => `Your likely long-term direction is ${structureLabel}, but your answers show the idea itself isn’t tested enough yet to commit to a formal structure. Forming now would lock you into governance, cost and reporting you don’t need before you know the idea works.`,
      steps: [
        'Run a small, low-cost pilot with real customers or beneficiaries.',
        'Collect evidence of demand or need before choosing a legal structure.',
        'Revisit the structure question once you have real pilot evidence.',
      ],
      recommendedService: 'Idea Validation Session',
    },
    specialist_review: {
      badge: 'Specialist Review Required',
      title: 'Your answers need a specialist review',
      route: null,
      routeLine: 'Your answers mix signals, so an adviser should confirm the right route with you.',
      explain: () => 'Your answers mix signals across business, CIC and charity models, or left key questions open — that’s common and not a problem, but it means this tool shouldn’t pick your structure for you. A Lords Consult adviser should review your answers directly.',
      steps: [
        'Book a strategy session so an adviser can review your specific answers.',
        'Bring your thinking on funding, control and who benefits.',
        'Avoid registering a structure until this review is complete.',
      ],
      recommendedService: 'Specialist Structure Review',
    },
  };

  // Answer-level observations feeding the result's strengths / risks lists.
  // `q` is the question index, `a` the answer index that triggers it. Only
  // observations that are plainly true of the answer given belong here.
  config.insights = [
    { q: 6, a: 0, kind: 'strength', text: 'You have clear evidence from potential customers or beneficiaries.' },
    { q: 6, a: 2, kind: 'risk',     text: 'You have not yet spoken to the people the idea is for.' },
    { q: 7, a: 0, kind: 'strength', text: 'The idea has already been tested through a pilot or live service.' },
    { q: 7, a: 2, kind: 'risk',     text: 'The idea has not been tested yet.' },
    { q: 8, a: 0, kind: 'strength', text: 'Other people are ready to share legal responsibility.' },
    { q: 8, a: 2, kind: 'risk',     text: 'No one else is yet lined up to share legal responsibility.' },
    { q: 3, a: 3, kind: 'risk',     text: 'What should happen to any profit is still undecided.' },
    { q: 4, a: 3, kind: 'risk',     text: 'Who should control the organisation is still undecided.' },
    { q: 9, a: 0, kind: 'risk',     text: 'A launch within a month leaves little time to settle structure and governance.' },
  ];

  config.consultationCTA = {
    heading: 'Get your full write-up and book your strategy session',
    lead: 'Share your details and Lords Consult will follow up to arrange your paid Idea-to-Organisation Strategy Session.',
  };

  root.LordsConsultConfig = config;
  if (typeof module !== 'undefined' && module.exports) module.exports = config;
})(typeof window !== 'undefined' ? window : globalThis);
