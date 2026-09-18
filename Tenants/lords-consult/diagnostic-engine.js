// Pure scoring + result-model logic for the Idea to Impact diagnostic.
// No DOM access and no network, so it can be exercised directly in Node
// (see the header of diagnostic-config.js for the data it reads).
(function (root) {
  const cfg = root.LordsConsultConfig;

  function pickTop(scores) {
    const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [topKey, topVal] = entries[0];
    const second = entries[1] ? entries[1][1] : 0;
    return { key: topKey, value: topVal, margin: topVal - second };
  }

  // Scores the two independent axes and picks the result family. Unchanged
  // behaviour from the original single-file implementation.
  function scoreDiagnostic(allAnswers, prefillRoute) {
    const structure = { business: 0, cic: 0, charity: 0, specialist: 0 };
    const readiness = { explore: 0, validate: 0, prepare: 0, formation_ready: 0, already_operating: 0 };

    cfg.scoring.forEach((weights, stepIndex) => {
      const w = weights[allAnswers[stepIndex]];
      if (!w) return;
      if (w.structure) Object.entries(w.structure).forEach(([k, v]) => { structure[k] += v; });
      if (w.readiness) Object.entries(w.readiness).forEach(([k, v]) => { readiness[k] += v; });
    });

    // A route clicked on the landing page is a soft hint only (BUILD-BRIEF.md
    // section 5) — small enough that real answers always outweigh it.
    if (prefillRoute && prefillRoute in structure) structure[prefillRoute] += 0.5;

    const topStructure = pickTop(structure);
    const topReadiness = pickTop(readiness);

    let family;
    if (topStructure.key === 'specialist') family = 'specialist_review';
    else if (topReadiness.key === 'explore' || topReadiness.key === 'validate') family = 'pilot_first';
    else family = { business: 'commercial_business', cic: 'social_enterprise_cic', charity: 'charity_cio' }[topStructure.key];

    const confidence = topStructure.margin >= 4 ? 'high' : topStructure.margin >= 2 ? 'moderate' : 'low';

    return { structure, readiness, topStructure, topReadiness, family, confidence };
  }

  // Which of IDEA / STRUCTURE / SYSTEM / SCALE the visitor is at. This is the
  // single place to extend once the quiz can tell SYSTEM from SCALE.
  function stageFor(scored) {
    return cfg.readinessToStage[scored.topReadiness.key] || 'idea';
  }

  function insightsFor(kind, allAnswers) {
    return cfg.insights
      .filter(i => i.kind === kind && allAnswers[i.q] === i.a)
      .map(i => i.text);
  }

  // The result as data, separated from how it is displayed:
  //   route, stage, readiness, strengths, risks, recommendedNextStep,
  //   recommendedService, consultationCTA
  // plus the pieces the UI needs (family copy, confidence, stage message).
  function buildResultModel(allAnswers, prefillRoute) {
    const scored = scoreDiagnostic(allAnswers, prefillRoute);
    const family = cfg.families[scored.family];
    const stageKey = stageFor(scored);
    const structureLabel = cfg.structureLabels[scored.topStructure.key];

    return {
      family: scored.family,
      route: family.route ? { key: family.route, label: cfg.structureLabels[family.route] } : null,
      stage: cfg.stages.find(s => s.key === stageKey),
      readiness: { key: scored.topReadiness.key, label: cfg.readinessLabels[scored.topReadiness.key] },
      confidence: scored.confidence,
      strengths: insightsFor('strength', allAnswers),
      risks: insightsFor('risk', allAnswers),
      recommendedNextStep: family.steps[0],
      recommendedService: family.recommendedService,
      consultationCTA: cfg.consultationCTA,

      badge: family.badge,
      title: family.title,
      explain: family.explain(structureLabel),
      steps: family.steps,
      stageMessage: cfg.stageCopy[stageKey].replace('{routeLine}', family.routeLine).trim(),
      confidenceText: cfg.confidenceText[scored.confidence],

      // Raw axes, kept for persistence (diagnostic_sessions columns).
      scores: scored,
    };
  }

  const engine = { scoreDiagnostic, stageFor, buildResultModel };
  root.LordsConsultEngine = engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
})(typeof window !== 'undefined' ? window : globalThis);
