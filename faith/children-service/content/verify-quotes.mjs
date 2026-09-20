// Checks that every Bible quotation in a lesson really is in the World English
// Bible (public domain), by fetching the passage from bible-api.com and testing
// that the quoted words appear in it. Needs the network, so it is a manual /
// pre-approval check, not part of the offline validator.
//   node faith/children-service/content/verify-quotes.mjs
//
// A "quotation" is any object with a `ref` and a `text` (story quotes,
// belonging quotes, the memory verse). A quote may be an excerpt of the verse
// but must be the verse's own words, in order.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lessons');
const norm = (s) => String(s)
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[.,;:!?"'—-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

function* quotes(node, where = '') {
  if (Array.isArray(node)) { for (let i = 0; i < node.length; i++) yield* quotes(node[i], `${where}[${i}]`); return; }
  if (node && typeof node === 'object') {
    if (typeof node.ref === 'string' && typeof node.text === 'string' && /\d+:\d+/.test(node.ref)) yield { where, ref: node.ref, text: node.text };
    for (const [k, v] of Object.entries(node)) yield* quotes(v, `${where}.${k}`);
  }
}

let bad = 0, total = 0;
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const lesson = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const cache = new Map();
  for (const q of quotes(lesson)) {
    const ref = q.ref.replace(/\s*\(.*\)\s*$/, '');                 // "1 Samuel 16:7 (last part)" -> "1 Samuel 16:7"
    if (!cache.has(ref)) {
      const res = await fetch(`https://bible-api.com/${encodeURIComponent(ref)}?translation=web`);
      if (!res.ok) { console.log(`  FAIL ${file} ${q.where}: could not fetch ${ref} (${res.status})`); bad++; total++; continue; }
      cache.set(ref, norm((await res.json()).text));
    }
    total++;
    if (!cache.get(ref)) continue;
    if (cache.get(ref).includes(norm(q.text))) console.log(`  ok   ${ref}`);
    else { bad++; console.log(`  FAIL ${file} ${q.where}: text is not in WEB ${ref}\n       quoted: ${q.text}`); }
  }
}
console.log(bad ? `\n${bad} of ${total} quotations do NOT match the World English Bible` : `\nAll ${total} quotations match the World English Bible`);
process.exit(bad ? 1 : 0);
