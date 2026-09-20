// After-class parent email: the wording (_lib/classSummary.js), the scheduled sender
// (notify-class-summaries.js) and the admin preview / test endpoint (cs-class-summary.js).
// Node-only tests against an in-memory stand-in for Supabase and for the email provider, so
// nothing is ever really sent. They aim at the ways this could go wrong for real families:
// emailing twice, emailing the wrong people, emailing about old classes, and being on when it
// should be off.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { buildEmail, churchDisplayName, formatWhen, sessionIsDue } = require('../netlify/functions/_lib/classSummary');
const { run } = require('../netlify/functions/notify-class-summaries');
const { handle } = require('../netlify/functions/cs-class-summary');

const DAVID = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'faith', 'children-service', 'content', 'lessons', 'david-01.json'), 'utf8'));
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const C1 = U(901), C2 = U(902), K1 = U(801), K2 = U(802), L1 = U(701);
const NOW = new Date('2026-10-03T12:00:00Z');
const minAgo = (m) => new Date(NOW.getTime() - m * 60000).toISOString();

// ---------------------------------------------------------------- wording
test.describe('the email', () => {
  const base = { childName: 'Johnny', band: 'explorer', parentName: 'Ama', startsAt: '2026-10-03T09:00:00Z', timezone: 'Europe/London', churchName: 'Inspire (our own church)', lesson: DAVID, teacherName: 'Tina' };

  test('says what was asked for: who attended, when, what they studied, the teacher, questions, thanks, sign-off', () => {
    const e = buildEmail(base);
    expect(e.subject).toBe('Johnny joined Bible Explorers');
    for (const part of [
      'Hello Ama,',
      'Johnny attended the virtual Bible class via Zoom on Saturday 3 October at 10:00.',
      'They studied David. David was the youngest son in his family',
      'Their teacher for today was Tina.',
      'Here are some questions you can discuss with Johnny to reinforce their learning:',
      '1. What was your favourite part of the story about David today?',
      'Thank you for supporting Johnny to become a great Bible explorer.',
      'The Children’s Service team\nInspire\n'
    ]) expect(e.text, part).toContain(part);
    expect(e.text).not.toContain('our own church');                         // signs off with the SHORT church name
    expect(e.text).toContain('turn these emails off');                       // and tells parents how to stop them
    expect(e.html).toContain('Johnny joined Bible Explorers');
  });

  test('shows the time in the CHURCH time zone, summer and winter', () => {
    expect(formatWhen('2026-10-03T09:00:00Z', 'Europe/London')).toEqual({ day: 'Saturday 3 October', time: '10:00' });   // British Summer Time
    expect(formatWhen('2026-12-05T09:00:00Z', 'Europe/London')).toEqual({ day: 'Saturday 5 December', time: '09:00' });  // GMT
    expect(formatWhen('2026-10-03T09:00:00Z', 'Africa/Accra').time).toBe('09:00');                                       // Ghana is UTC year-round
  });

  test('uses the age group\'s own questions, and puts the child\'s name in them', () => {
    const ex = buildEmail(base).text, tr = buildEmail({ ...base, band: 'trailblazer' }).text;
    expect(ex).toContain("What do you think God sees when God looks at Johnny's heart?");
    expect(ex).not.toContain('pressure to go along with the crowd');
    expect(tr).toContain('pressure to go along with the crowd');
    expect(tr).not.toContain('memory verse');
    expect(ex + tr).not.toMatch(/\{child\}/);                                // never a raw placeholder
  });

  test('leaves the teacher line out when nobody is set, rather than saying "unknown"', () => {
    for (const t of [null, undefined, '', '   ']) {
      const e = buildEmail({ ...base, teacherName: t });
      expect(e.text).not.toMatch(/teacher/i);
      expect(e.html).not.toMatch(/teacher for today/);
    }
  });

  test('an older lesson without parent content still gives a sensible email', () => {
    const old = JSON.parse(JSON.stringify(DAVID)); delete old.parentEmail;
    const e = buildEmail({ ...base, lesson: old });
    expect(e.text).toContain('They studied David: The shepherd boy God chose.');           // tagline fallback, with its full stop
    expect(e.text).toContain('1. Who do people sometimes pick last?');                      // family questions fallback
    expect(e.text.match(/^\d\. /gm).length).toBe(3);
  });

  test('a class with no lesson still produces an email (no study line, no questions)', () => {
    const e = buildEmail({ ...base, lesson: null });
    expect(e.text).toContain('Johnny attended the virtual Bible class');
    expect(e.text).not.toContain('They studied');
    expect(e.text).not.toContain('Here are some questions');
    expect(e.text).toContain('Thank you for supporting Johnny');
  });

  test('its own wording never assumes a child\'s gender', () => {
    const e = buildEmail({ ...base, lesson: null, teacherName: null });
    expect(e.text).not.toMatch(/\b(he|she|his|her|him|boy|girl)\b/i);
  });

  test('names are escaped in the HTML version, so they cannot inject markup', () => {
    const e = buildEmail({ ...base, childName: '<img src=x onerror=alert(1)>', parentName: '<b>x</b>', teacherName: '"><script>' });
    expect(e.html).not.toContain('<img src=x');
    expect(e.html).not.toContain('<script>');
    expect(e.html).toContain('&lt;img src=x');
  });

  test('short church name', () => {
    expect(churchDisplayName('Inspire (our own church)')).toBe('Inspire');
    expect(churchDisplayName('Grace Chapel')).toBe('Grace Chapel');
    expect(churchDisplayName('')).toBe('Inspire');
    expect(churchDisplayName(null)).toBe('Inspire');
  });

  test('a class is due 10 minutes after it ends, never after 24 hours, never if cancelled', () => {
    const at = (endedMinAgo, extra = {}) => ({ starts_at: minAgo(endedMinAgo + 28), duration_min: 28, status: 'scheduled', ...extra });
    const due = (s) => sessionIsDue(s, NOW.getTime());
    expect(due(at(-5))).toBe(false);                     // still running
    expect(due(at(5))).toBe(false);                      // ended 5 min ago: still settling
    expect(due(at(11))).toBe(true);
    expect(due(at(60 * 23))).toBe(true);
    expect(due(at(60 * 25))).toBe(false);                // too old: switching on can never email about history
    expect(due(at(60, { status: 'cancelled' }))).toBe(false);
    expect(due(at(60, { starts_at: 'garbage' }))).toBe(false);
  });
});

// ---------------------------------------------------------------- the scheduled sender
function world() {
  const users = { [U(1)]: 'ama@example.com', [U(2)]: 'kwame@example.com', [U(3)]: 'optedout@example.com', [U(4)]: 'archived@example.com', [U(6)]: 'sibling-parent@example.com' };   // U(5) has NO email
  const t = {
    churches: [{ id: C1, name: 'Inspire (our own church)', timezone: 'Europe/London' }],
    classes: [{ id: K1, church_id: C1, age_band: 'explorer' }, { id: K2, church_id: C1, age_band: 'trailblazer' }],
    lessons: [{ id: L1, content: DAVID }],
    sessions: [
      { id: U(11), church_id: C1, class_id: K1, lesson_id: L1, starts_at: minAgo(120), duration_min: 28, status: 'scheduled', teacher_name: 'Tina' },   // ended 92 min ago: DUE
      { id: U(12), church_id: C1, class_id: K1, lesson_id: L1, starts_at: minAgo(20), duration_min: 28, status: 'scheduled' },                         // still running
      { id: U(13), church_id: C1, class_id: K1, lesson_id: L1, starts_at: minAgo(33), duration_min: 28, status: 'scheduled' },                         // ended 5 min ago
      { id: U(14), church_id: C1, class_id: K1, lesson_id: L1, starts_at: minAgo(60 * 30), duration_min: 28, status: 'scheduled' },                    // 30 hours ago
      { id: U(15), church_id: C1, class_id: K1, lesson_id: L1, starts_at: minAgo(120), duration_min: 28, status: 'cancelled' }
    ],
    children: [
      { id: U(21), display_name: 'Kofi', age_band: 'explorer', parent_id: U(1), archived_at: null },
      { id: U(22), display_name: 'Abena', age_band: 'trailblazer', parent_id: U(2), archived_at: null },
      { id: U(23), display_name: 'Esi', age_band: 'explorer', parent_id: U(3), archived_at: null },        // parent switched the emails off
      { id: U(24), display_name: 'Old', age_band: 'explorer', parent_id: U(4), archived_at: '2026-01-01' },  // archived
      { id: U(25), display_name: 'Noemail', age_band: 'explorer', parent_id: U(5), archived_at: null },      // parent has no email
      { id: U(26), display_name: 'Recap', age_band: 'explorer', parent_id: U(6), archived_at: null },        // only watched the recap
      { id: U(27), display_name: 'Sib', age_band: 'explorer', parent_id: U(1), archived_at: null }           // Kofi's sibling, same parent
    ],
    attendance: [
      { id: U(31), session_id: U(11), child_id: U(21), source: 'self_checkin', summary_sent_at: null },
      { id: U(32), session_id: U(11), child_id: U(22), source: 'leader', summary_sent_at: null },
      { id: U(33), session_id: U(11), child_id: U(23), source: 'self_checkin', summary_sent_at: null },
      { id: U(34), session_id: U(11), child_id: U(24), source: 'self_checkin', summary_sent_at: null },
      { id: U(35), session_id: U(11), child_id: U(25), source: 'self_checkin', summary_sent_at: null },
      { id: U(36), session_id: U(11), child_id: U(26), source: 'recap_watched', summary_sent_at: null },
      { id: U(37), session_id: U(11), child_id: U(27), source: 'self_checkin', summary_sent_at: null },
      { id: U(38), session_id: U(12), child_id: U(21), source: 'self_checkin', summary_sent_at: null },      // running
      { id: U(39), session_id: U(13), child_id: U(21), source: 'self_checkin', summary_sent_at: null },      // just ended
      { id: U(40), session_id: U(14), child_id: U(21), source: 'self_checkin', summary_sent_at: null },      // too old
      { id: U(41), session_id: U(15), child_id: U(21), source: 'self_checkin', summary_sent_at: null }       // cancelled
    ],
    consents: [
      { id: U(51), parent_id: U(3), child_id: null, type: 'communications', given: false, created_at: minAgo(500) },
      { id: U(52), parent_id: U(2), child_id: null, type: 'communications', given: false, created_at: minAgo(900) },   // earlier "off"...
      { id: U(53), parent_id: U(2), child_id: null, type: 'communications', given: true, created_at: minAgo(600) }     // ...later "on": the latest wins
    ],
    church_members: [
      { id: U(61), church_id: C1, user_id: U(1), role: 'parent', display_name: 'Ama' },
      { id: U(62), church_id: C1, user_id: U(2), role: 'parent', display_name: 'Kwame' }
    ]
  };
  const sent = []; let failNext = 0, calls = { claims: 0 };
  const resend = { emails: { send: async (m) => { if (failNext > 0) { failNext--; return { error: { message: 'boom' } }; } sent.push(m); return { data: { id: 'x' }, error: null }; } } };
  class Q {
    constructor(table) { this.table = table; this.f = []; this.op = 'select'; this.ord = null; this.lim = null; this.ret = false; }
    select() { if (this.op !== 'select') this.ret = true; return this; }
    update(p) { this.op = 'update'; this.payload = p; return this; }
    eq(c, v) { this.f.push((r) => r[c] === v); return this; }
    is(c, v) { this.f.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
    in(c, vs) { this.f.push((r) => vs.includes(r[c])); return this; }
    gte(c, v) { this.f.push((r) => r[c] >= v); return this; }
    lte(c, v) { this.f.push((r) => r[c] <= v); return this; }
    order(c, o) { this.ord = { c, asc: !o || o.ascending !== false }; return this; }
    limit(n) { this.lim = n; return this; }
    maybeSingle() { this.one = true; return this; }
    then(res, rej) { return Promise.resolve(this.exec()).then(res, rej); }
    exec() {
      const rows = t[this.table], m = (r) => this.f.every((x) => x(r));
      if (this.op === 'update') {
        const hit = rows.filter(m); hit.forEach((r) => Object.assign(r, this.payload));
        if (this.table === 'attendance' && this.payload.summary_sent_at) calls.claims += hit.length;
        return { data: this.ret ? hit.map((r) => ({ id: r.id })) : null, error: null };
      }
      let out = rows.filter(m);
      if (this.ord) out = [...out].sort((a, b) => (a[this.ord.c] > b[this.ord.c] ? 1 : -1) * (this.ord.asc ? 1 : -1));
      if (this.lim != null) out = out.slice(0, this.lim);
      return this.one ? { data: out[0] || null, error: null } : { data: out, error: null };
    }
  }
  const admin = { schema: () => ({ from: (n) => new Q(n) }), auth: { admin: { getUserById: async (id) => ({ data: { user: users[id] ? { id, email: users[id] } : { id } }, error: null }) } } };
  return { admin, resend, t, sent, fail: (n) => { failNext = n; }, calls };
}
const go = (w, env = { CS_CLASS_SUMMARIES: 'on' }, extra = {}) => run({ admin: w.admin, resend: w.resend, env, now: NOW, ...extra });
const row = (w, id) => w.t.attendance.find((a) => a.id === id);

test.describe('the scheduled sender', () => {
  test('is OFF unless switched on: nothing is sent and nothing is touched', async () => {
    for (const env of [{}, { CS_CLASS_SUMMARIES: 'off' }, { CS_CLASS_SUMMARIES: 'true' }, { CS_CLASS_SUMMARIES: 'ON' }, { CS_CLASS_SUMMARIES: '1' }]) {
      const w = world();
      expect((await go(w, env)).skipped).toBe('switched off');
      expect(w.sent).toHaveLength(0);
      expect(w.t.attendance.every((a) => a.summary_sent_at === null)).toBe(true);
    }
    const w = world();
    expect((await go(w, { CS_CLASS_SUMMARIES: 'on' }, { resend: null })).skipped).toMatch(/not configured/);      // on, but no email service
    expect(w.sent).toHaveLength(0);
  });

  test('emails exactly the right parents for a finished class', async () => {
    const w = world();
    const r = await go(w);
    expect(r).toMatchObject({ classes: 1, sent: 3, optedOut: 1, noEmail: 1, skippedChild: 1, failed: 0, capped: false });
    const to = w.sent.map((m) => m.to).sort();
    expect(to).toEqual(['ama@example.com', 'ama@example.com', 'kwame@example.com']);           // Kofi and Sib (same parent: one email each), and Abena
    const kofi = w.sent.find((m) => m.subject === 'Kofi joined Bible Explorers');
    expect(kofi.text).toContain('Hello Ama,');
    expect(kofi.text).toContain('Saturday 3 October at 11:00');                                 // class starts 10:00 UTC = 11:00 British Summer Time
    expect(kofi.text).toContain('Their teacher for today was Tina.');
    expect(kofi.text).toContain('What do you think God sees when God looks at Kofi');            // explorer questions
    const abena = w.sent.find((m) => m.subject === 'Abena joined Bible Explorers');
    expect(abena.text).toContain('pressure to go along with the crowd');                         // trailblazer questions
    expect(abena.text).toContain('Hello Kwame,');
    expect(w.sent.every((m) => /noreply@inspireacademic\.org/.test(m.from) && m.html && m.text)).toBe(true);
    expect(w.sent.map((m) => m.subject).join()).not.toMatch(/Esi|Old|Noemail|Recap/);          // opted out, archived, no email, recap-only
  });

  test('ignores classes that are running, just ended, too old or cancelled', async () => {
    const w = world();
    await go(w);
    for (const id of [U(38), U(39), U(40), U(41)]) expect(row(w, id).summary_sent_at, id).toBeNull();     // untouched, and not emailed
    expect(w.sent.length).toBe(3);
  });

  test('a second run sends nothing: one email per child per class, ever', async () => {
    const w = world();
    await go(w);
    const again = await go(w);
    expect(again.sent).toBe(0);
    expect(w.sent).toHaveLength(3);
  });

  test('two runs at the SAME moment still send each email only once', async () => {
    const w = world();
    const [a, b] = await Promise.all([go(w), go(w)]);
    expect(a.sent + b.sent).toBe(3);
    expect(w.sent).toHaveLength(3);
    const subjects = w.sent.map((m) => m.subject + '>' + m.to);
    expect(new Set(subjects).size).toBe(subjects.length);
  });

  test('a failed send is retried on the next run, not lost and not doubled', async () => {
    const w = world();
    w.fail(1);                                                                       // the first send is refused
    const first = await go(w);
    expect(first.failed).toBe(1);
    expect(first.sent).toBe(2);
    expect(w.t.attendance.filter((a) => [U(31), U(32), U(37)].includes(a.id) && a.summary_sent_at === null)).toHaveLength(1);   // exactly one released for retry
    const second = await go(w);
    expect(second.sent).toBe(1);
    expect(w.sent).toHaveLength(3);                                                  // everyone got exactly one
  });

  test('a parent who switched emails off is skipped and marked; the LATEST choice wins', async () => {
    const w = world();
    await go(w);
    expect(row(w, U(33)).summary_sent_at).not.toBeNull();                            // marked, so never re-evaluated
    expect(w.sent.some((m) => m.to === 'optedout@example.com')).toBe(false);
    expect(w.sent.some((m) => m.to === 'kwame@example.com')).toBe(true);             // switched off, then back on
    w.t.consents.push({ id: U(54), parent_id: U(3), child_id: null, type: 'communications', given: true, created_at: minAgo(1) });
    await go(w);
    expect(w.sent.some((m) => m.to === 'optedout@example.com')).toBe(false);         // opting back in never sends about a class already passed over
  });

  test('never sends more than 40 in one run, and finishes the rest next time', async () => {
    const w = world();
    for (let i = 0; i < 45; i++) {
      const cid = U(1000 + i);
      w.t.children.push({ id: cid, display_name: 'Kid' + i, age_band: 'explorer', parent_id: U(2), archived_at: null });
      w.t.attendance.push({ id: U(2000 + i), session_id: U(11), child_id: cid, source: 'self_checkin', summary_sent_at: null });
    }
    const r1 = await go(w);
    expect(r1.sent).toBe(40);
    expect(r1.capped).toBe(true);
    const r2 = await go(w);
    expect(r2.sent).toBe(w.sent.length - 40);
    expect(w.sent.length).toBe(3 + 45);
  });

  test('a late check-in (teacher marks a child present afterwards) is still emailed', async () => {
    const w = world();
    await go(w);
    w.t.attendance.push({ id: U(90), session_id: U(11), child_id: U(27), source: 'leader', summary_sent_at: null, _late: true });
    // (a second row for the same child would be blocked by the database's unique rule; use a fresh child)
    w.t.children.push({ id: U(91), display_name: 'Late', age_band: 'explorer', parent_id: U(2), archived_at: null });
    w.t.attendance.push({ id: U(92), session_id: U(11), child_id: U(91), source: 'leader', summary_sent_at: null });
    const r = await go(w);
    expect(w.sent.some((m) => m.subject === 'Late joined Bible Explorers')).toBe(true);
  });
});

// ---------------------------------------------------------------- the admin preview / test
function adminWorld() {
  const w = world();
  const users = { 'tok-admin': { id: U(300), email: 'pastor@church.org' }, 'tok-teacher': { id: U(301), email: 't@church.org' }, 'tok-parent': { id: U(1), email: 'ama@example.com' }, 'tok-other': { id: U(303), email: 'boss@other.org' } };
  w.t.churches.push({ id: C2, slug: 'other', name: 'Other', timezone: 'Europe/London' });
  w.t.churches[0].slug = 'inspire';
  w.t.church_members.push(
    { id: U(70), church_id: C1, user_id: U(300), role: 'church_admin', status: 'active' },
    { id: U(71), church_id: C1, user_id: U(301), role: 'facilitator', status: 'active' },
    { id: U(72), church_id: C2, user_id: U(303), role: 'church_admin', status: 'active' }
  );
  w.t.sessions.push({ id: U(16), church_id: C2, class_id: K1, lesson_id: L1, starts_at: minAgo(120), duration_min: 28, status: 'scheduled' });   // belongs to ANOTHER church
  w.t.children.push({ id: U(28), display_name: 'Outsider', age_band: 'explorer', parent_id: U(9), archived_at: null, church_id: C2 });
  w.t.children.forEach((c) => { if (!c.church_id) c.church_id = C1; });
  w.t.sessions.forEach((s) => { if (!s.church_id) s.church_id = C1; });
  const admin = {
    schema: w.admin.schema,
    auth: { getUser: async (tok) => (users[tok] ? { data: { user: users[tok] }, error: null } : { data: { user: null }, error: { message: 'bad' } }), admin: w.admin.auth.admin }
  };
  const call = (tok, body, deps = {}) => handle({ httpMethod: 'POST', headers: { authorization: tok ? `Bearer ${tok}` : '' }, body: JSON.stringify(body) }, { admin, resend: w.resend, env: {}, ...deps })
    .then((r) => ({ status: r.statusCode, body: JSON.parse(r.body) }));
  return { ...w, call };
}

test.describe('admin preview and test send', () => {
  test('only a church admin of this church may use it', async () => {
    const w = adminWorld();
    for (const tok of ['', 'tok-nope', 'tok-teacher', 'tok-parent', 'tok-other']) {
      const r = await w.call(tok, { action: 'preview', session_id: U(11) });
      expect([401, 403], tok).toContain(r.status);
    }
    expect(w.sent).toHaveLength(0);
  });

  test('preview: the exact email for a sample child, changing nothing', async () => {
    const w = adminWorld();
    const before = JSON.stringify(w.t);
    const r = await w.call('tok-admin', { action: 'preview', session_id: U(11) });
    expect(r.status).toBe(200);
    expect(r.body.sample).toBe(true);
    expect(r.body.subject).toBe('Johnny joined Bible Explorers');
    expect(r.body.text).toContain('Their teacher for today was Tina.');
    expect(r.body.html).toContain('<html>');
    expect(JSON.stringify(w.t)).toBe(before);                                       // no writes at all
    expect(w.sent).toHaveLength(0);                                                  // and no email
  });

  test('preview for a real child uses their name and age group; other churches are invisible', async () => {
    const w = adminWorld();
    const r = await w.call('tok-admin', { action: 'preview', session_id: U(11), child_id: U(22) });
    expect(r.body.sample).toBe(false);
    expect(r.body.subject).toBe('Abena joined Bible Explorers');
    expect(r.body.text).toContain('pressure to go along with the crowd');
    expect((await w.call('tok-admin', { action: 'preview', session_id: U(16) })).status).toBe(404);                      // another church's class
    expect((await w.call('tok-admin', { action: 'preview', session_id: U(11), child_id: U(28) })).status).toBe(404);    // another church's child
    expect((await w.call('tok-admin', { action: 'preview', session_id: 'nope' })).status).toBe(400);
    expect((await w.call('tok-admin', { action: 'preview', session_id: U(11), child_id: 'nope' })).status).toBe(400);
    expect((await w.call('tok-admin', { action: 'do_something_else', session_id: U(11) })).status).toBe(400);
  });

  test('send_test emails ONLY the signed-in admin, marked as a test', async () => {
    const w = adminWorld();
    const r = await w.call('tok-admin', { action: 'send_test', session_id: U(11), child_id: U(21) });
    expect(r.status).toBe(200);
    expect(r.body.to).toBe('pastor@church.org');
    expect(w.sent).toHaveLength(1);
    expect(w.sent[0].to).toBe('pastor@church.org');                                  // not Kofi's parent, even though a real child was chosen
    expect(w.sent[0].subject).toBe('[TEST] Kofi joined Bible Explorers');
    expect(w.sent[0].text).toMatch(/^THIS IS A TEST/);
    expect(w.sent[0].html).toContain('THIS IS A TEST');
    expect(w.t.attendance.every((a) => a.summary_sent_at === null)).toBe(true);      // a test never marks anything as sent
  });

  test('send_test says so plainly when email is not set up', async () => {
    const w = adminWorld();
    const r = await w.call('tok-admin', { action: 'send_test', session_id: U(11) }, { resend: null });
    expect(r.status).toBe(503);
    expect(r.body.error).toMatch(/not set up/);
  });
});
