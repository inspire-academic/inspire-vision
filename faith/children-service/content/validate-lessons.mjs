// Validates every lesson in content/lessons/*.json against the rules in
// lesson-schema.md. Zero dependencies. Exit code 1 on any problem.
//   node faith/children-service/content/validate-lessons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lessons');
const BANDS = ['explorer', 'trailblazer'];
let problems = 0;
const bad = (file, msg) => { problems++; console.log(`  FAIL ${file}: ${msg}`); };

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  let lesson;
  try { lesson = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')); }
  catch (e) { bad(file, `invalid JSON (${e.message})`); continue; }

  for (const key of ['id', 'character', 'translation', 'scripture', 'bigIdea', 'sensitivity', 'preClass', 'live', 'postClass', 'review', 'rewards']) {
    if (lesson[key] === undefined) bad(file, `missing "${key}"`);
  }
  if (!lesson.scripture?.passages?.length) bad(file, 'scripture.passages is empty');
  if (lesson.postClass?.reflection?.freeText !== false) bad(file, 'postClass.reflection.freeText must be false (no free text from children)');
  if (lesson.live?.roles?.adultsRequired < 2) bad(file, 'live.roles.adultsRequired must be at least 2');

  const STOPS = ['creation', 'abraham', 'exodus', 'judges', 'kings', 'exile', 'jesus', 'church'];
  if (!STOPS.includes(lesson.character?.mapStop)) bad(file, `character.mapStop must be one of: ${STOPS.join(', ')}`);

  const mystery = lesson.preClass?.mystery;
  if (mystery && !mystery.options?.includes(mystery.answer)) bad(file, 'mystery.answer is not one of mystery.options');

  const activityKeys = new Set((lesson.live?.activities || []).map((a) => a.key));
  for (const band of BANDS) {
    const sheet = lesson.live?.runSheet?.[band];
    if (!sheet) { bad(file, `runSheet.${band} missing`); continue; }
    const sum = sheet.blocks.reduce((n, b) => n + b.minutes, 0);
    if (sum !== sheet.totalMinutes) bad(file, `runSheet.${band} blocks add up to ${sum}, totalMinutes says ${sheet.totalMinutes}`);
    for (const b of sheet.blocks) {
      const m = /^activities\.(.+)$/.exec(b.detail || '');
      if (m && !activityKeys.has(m[1])) bad(file, `runSheet.${band} refers to unknown activity "${m[1]}"`);
    }
    const quiz = lesson.live?.quiz?.[band] || [];
    if (!quiz.length) bad(file, `quiz.${band} is empty`);
    quiz.forEach((q, i) => {
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) bad(file, `quiz.${band}[${i}].answer is not a valid option index`);
    });
  }
  for (const a of lesson.live?.activities || []) {
    if (!a.bands?.every((b) => BANDS.includes(b))) bad(file, `activity "${a.key}" has an unknown band`);
  }

  // ---- content review gate ------------------------------------------------
  const rev = lesson.contentReview;
  if (!rev || !['draft', 'approved'].includes(rev.status)) bad(file, 'contentReview.status must be "draft" or "approved"');
  else if (rev.status === 'approved' && !(rev.reviewer && rev.reviewedOn)) bad(file, 'an approved lesson needs contentReview.reviewer and reviewedOn');

  // ---- life-application moments ------------------------------------------
  const ANCHORS = ['story.part1', 'story.part2', 'quiz', 'verse'];
  const pool = lesson.names || {};
  const moments = lesson.apply?.moments || [];
  const momentKeys = new Set();
  for (const band of BANDS) {
    if (!moments.some((m) => m.bands?.includes(band))) bad(file, `apply has no moments for the ${band} band`);
    if (!moments.some((m) => m.bands?.includes(band) && m.liveUse === 'yes')) bad(file, `apply has no LIVE moment for the ${band} band (live is the main way these are taught)`);
  }
  for (const m of moments) {
    const where = `apply.${m.key}`;
    if (!m.key || momentKeys.has(m.key)) bad(file, `${where}: missing or duplicate key`);
    momentKeys.add(m.key);
    if (!ANCHORS.includes(m.after)) bad(file, `${where}: "after" must be one of ${ANCHORS.join(', ')}`);
    if (!m.bands?.length || !m.bands.every((b) => BANDS.includes(b))) bad(file, `${where}: bands must be explorer and/or trailblazer`);
    if (!['yes', 'home'].includes(m.liveUse)) bad(file, `${where}: liveUse must be "yes" (run in class) or "home" (app/home only)`);
    if (m.liveUse === 'yes' && !m.leaderPrompt) bad(file, `${where}: a live moment needs a leaderPrompt`);
    if (!m.scenario || !m.question) bad(file, `${where}: needs a scenario and a question`);
    if ((m.choices || []).length < 2) bad(file, `${where}: needs at least two choices`);
    for (const c of m.choices || []) {
      if (!c.text || !c.response) bad(file, `${where}: every choice needs text AND a kind response (no choice is left without a reply)`);
    }
    if (!m.grownUpTalk) bad(file, `${where}: the moment must end by handing over to a grown-up (grownUpTalk)`);
    // name tokens like {boy1}, {girl2} must be resolvable from the pool
    const blob = JSON.stringify(m);
    for (const t of blob.matchAll(/\{(boy|girl)(\d+)\}/g)) {
      const total = (pool[t[1]]?.african?.length || 0) + (pool[t[1]]?.other?.length || 0);
      if (Number(t[2]) > total) bad(file, `${where}: token ${t[0]} needs at least ${t[2]} ${t[1]} names in "names"`);
    }
  }
  // Characters alternate between non-African and African names, so each list needs enough names.
  if (moments.length) {
    for (const g of ['boy', 'girl']) for (const o of ['african', 'other']) {
      if (!Array.isArray(pool[g]?.[o]) || pool[g][o].length < 2) bad(file, `names.${g}.${o} needs at least 2 names (characters alternate between African and non-African names)`);
    }
  }

  // run-sheet blocks may only point at moments that exist and are safe to run live
  for (const band of BANDS) {
    for (const b of lesson.live?.runSheet?.[band]?.blocks || []) {
      const mm = /^apply\.(.+)$/.exec(b.detail || '');
      if (mm) {
        const m = moments.find((x) => x.key === mm[1]);
        if (!m) bad(file, `runSheet.${band} refers to unknown moment "${mm[1]}"`);
        else if (m.liveUse !== 'yes') bad(file, `runSheet.${band} runs "${m.key}" live, but it is marked liveUse "${m.liveUse}"`);
        else if (!m.bands.includes(band)) bad(file, `runSheet.${band} runs "${m.key}", which is not for that band`);
      }
    }
    if (!(lesson.live?.runSheet?.[band]?.blocks || []).some((b) => b.detail === 'belonging')) bad(file, `runSheet.${band} has no "belonging" block`);
  }

  // ---- belonging: required in EVERY lesson --------------------------------
  const bel = lesson.belonging;
  if (!bel) bad(file, 'missing "belonging" (every lesson needs a "who else is in this story?" spotlight)');
  else {
    for (const k of ['who', 'from', 'why', 'ref']) if (!bel.spotlight?.[k]) bad(file, `belonging.spotlight.${k} is missing`);
    if (!bel.leaderPrompt) bad(file, 'belonging.leaderPrompt is missing');
    for (const band of BANDS) {
      const cards = (bel.cards || []).filter((c) => c.bands?.includes(band));
      if (cards.length < 2) bad(file, `belonging needs at least 2 cards for the ${band} band`);
      for (const c of cards) if (!c.title || !c.text) bad(file, `belonging card "${c.key}" needs a title and text`);
    }
  }

  // ---- the after-class parent email ---------------------------------------
  const pe = lesson.parentEmail;
  if (!pe) bad(file, 'missing "parentEmail" (the synopsis and discussion questions for the after-class email to parents)');
  else {
    if (!pe.synopsis || pe.synopsis.length < 40 || pe.synopsis.length > 600) bad(file, 'parentEmail.synopsis should be a short paragraph (40 to 600 characters)');
    for (const band of BANDS) {
      const qs = pe.questions?.[band];
      if (!Array.isArray(qs) || qs.length < 2 || qs.length > 4) bad(file, `parentEmail.questions.${band} needs 2 to 4 questions`);
      else qs.forEach((q, i) => { if (typeof q !== 'string' || q.length < 15) bad(file, `parentEmail.questions.${band}[${i}] is too short`); });
    }
    if (/\{(boy|girl)\d+\}/.test(JSON.stringify(pe))) bad(file, 'parentEmail must not use {boy1}/{girl1} name tokens (use {child} for the child)');
  }

  // ---- names are used SPARINGLY -------------------------------------------
  // Outside the pool itself, any one name should appear in at most 3 places in a lesson.
  const allNames = ['boy', 'girl'].flatMap((g) => ['african', 'other'].flatMap((o) => pool[g]?.[o] || []));
  const textNoPool = JSON.stringify({ ...lesson, names: undefined });
  for (const n of allNames) {
    const count = (textNoPool.match(new RegExp(`\\b${n}\\b`, 'g')) || []).length;
    if (count > 3) bad(file, `the name "${n}" appears ${count} times; use each name sparingly (at most 3)`);
  }

  const known = new Set(['camp-fire-friend', 'catch-up-champion', 'story-detective', 'map-marker', 'verse-keeper', 'brave-like-david', 'helping-hands', 'table-talkers', 'big-question-asker', 'team-trailblazers']);
  for (const b of lesson.rewards?.badges || []) {
    if (!known.has(b.key)) bad(file, `rewards references badge "${b.key}" that is not in the seeded catalogue`);
  }
  console.log(`checked ${file}`);
}
console.log(problems ? `\n${problems} problem(s)` : '\nAll lessons valid');
process.exit(problems ? 1 : 0);
