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

  const known = new Set(['camp-fire-friend', 'catch-up-champion', 'story-detective', 'map-marker', 'verse-keeper', 'brave-like-david', 'helping-hands', 'table-talkers', 'big-question-asker', 'team-trailblazers']);
  for (const b of lesson.rewards?.badges || []) {
    if (!known.has(b.key)) bad(file, `rewards references badge "${b.key}" that is not in the seeded catalogue`);
  }
  console.log(`checked ${file}`);
}
console.log(problems ? `\n${problems} problem(s)` : '\nAll lessons valid');
process.exit(problems ? 1 : 0);
