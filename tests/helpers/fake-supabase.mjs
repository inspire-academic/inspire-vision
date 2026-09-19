// In-browser stand-in for @supabase/supabase-js, used ONLY by
// tests/children-service.spec.js. The spec serves this file in place of the
// jsdelivr module that assets/supabase.js imports, so the real page code runs
// unchanged against an in-memory database.
//
// State lives in localStorage['fakedb'] so it survives page navigations
// within one test. It deliberately does NOT re-implement row-level security:
// those rules are proven against a real Postgres in the schema tests. What it
// does mirror, because the pages depend on them, is: the join-link time
// window, the unique constraints, and the badge-awarding rules.

const KEY = 'fakedb';
const load = () => JSON.parse(localStorage.getItem(KEY) || '{"t":{},"auth":{"users":[],"session":null}}');
const save = (db) => localStorage.setItem(KEY, JSON.stringify(db));
const uuid = () => crypto.randomUUID();
const err = (code, message) => ({ code, message });

const UNIQUE = {
  attendance: ['session_id', 'child_id'],
  progress: ['child_id', 'lesson_id', 'step_key'],
  awards: ['child_id', 'badge_key'],
  church_members: ['church_id', 'user_id', 'role']
};

class Query {
  constructor(table) { this.table = table; this.op = 'select'; this.filters = []; this.sortBy = null; this.max = null; this.one = null; this.payload = null; this.opts = {}; }
  select() { return this; }
  insert(rows) { this.op = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
  upsert(rows, opts) { this.op = 'upsert'; this.payload = Array.isArray(rows) ? rows : [rows]; this.opts = opts || {}; return this; }
  update(obj) { this.op = 'update'; this.payload = obj; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
  in(c, vs) { this.filters.push((r) => vs.includes(r[c])); return this; }
  is(c, v) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
  order(c, o) { this.sortBy = { c, asc: !o || o.ascending !== false }; return this; }
  limit(n) { this.max = n; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  single() { this.one = 'single'; return this; }
  then(resolve, reject) { return Promise.resolve(this.run()).then(resolve, reject); }

  run() {
    const db = load();
    const rows = (db.t[this.table] = db.t[this.table] || []);
    const match = (r) => this.filters.every((f) => f(r));
    const uk = UNIQUE[this.table];
    const dup = (r, cand) => uk && uk.every((k) => r[k] === cand[k]);
    let out;

    if (this.op === 'insert') {
      for (const p of this.payload) {
        if (uk && rows.some((r) => dup(r, p))) return { data: null, error: err('23505', 'duplicate key value violates unique constraint') };
      }
      out = this.payload.map((p) => ({ id: uuid(), created_at: new Date().toISOString(), ...p }));
      rows.push(...out);
      save(db);
      return { data: null, error: null };
    }
    if (this.op === 'upsert') {
      for (const p of this.payload) {
        const i = rows.findIndex((r) => dup(r, p));
        if (i >= 0) rows[i] = { ...rows[i], ...p }; else rows.push({ id: uuid(), created_at: new Date().toISOString(), ...p });
      }
      save(db);
      return { data: null, error: null };
    }
    if (this.op === 'update') {
      rows.filter(match).forEach((r) => Object.assign(r, this.payload));
      save(db);
      return { data: null, error: null };
    }
    if (this.op === 'delete') {
      const gone = rows.filter(match).map((r) => r.id);
      db.t[this.table] = rows.filter((r) => !gone.includes(r.id));
      // mimic ON DELETE CASCADE from children
      if (this.table === 'children') for (const t of ['attendance', 'progress', 'awards', 'consents']) db.t[t] = (db.t[t] || []).filter((r) => !gone.includes(r.child_id));
      save(db);
      return { data: null, error: null };
    }
    out = rows.filter(match);
    if (this.sortBy) out = [...out].sort((a, b) => (a[this.sortBy.c] > b[this.sortBy.c] ? 1 : -1) * (this.sortBy.asc ? 1 : -1));
    if (this.max != null) out = out.slice(0, this.max);
    if (this.one) return { data: out[0] || null, error: null };
    return { data: out, error: null };
  }
}

function rpc(name, a) {
  const db = load();
  const T = (n) => (db.t[n] = db.t[n] || []);
  const me = db.auth.session && db.auth.session.user.id;
  const ownChild = (id) => T('children').find((c) => c.id === id && c.parent_id === me);
  if (name === 'church_by_slug') {
    return { data: T('churches').filter((c) => c.slug === a.p_slug && c.open_enrolment).map((c) => ({ id: c.id, name: c.name })), error: null };
  }
  if (name === 'get_join_info') {
    const s = T('sessions').find((x) => x.id === a.p_session);
    const d = T('session_join_details').find((x) => x.session_id === a.p_session);
    if (!s || !d || !['scheduled', 'live'].includes(s.status)) return { data: [], error: null };
    const start = new Date(s.starts_at).getTime(), now = Date.now();
    const inWindow = now >= start - 30 * 60000 && now <= start + s.duration_min * 60000 + 30 * 60000;
    const mine = T('children').some((c) => c.class_id === s.class_id && c.parent_id === me);
    return { data: inWindow && mine ? [{ join_url: d.join_url, meeting_id: d.meeting_id, passcode: d.passcode, platform: s.platform }] : [], error: null };
  }
  if (name === 'evaluate_badges') {
    if (!ownChild(a.p_child)) return { data: null, error: err('42501', 'not permitted') };
    const has = (k) => T('awards').some((x) => x.child_id === a.p_child && x.badge_key === k);
    const prog = T('progress').filter((p) => p.child_id === a.p_child);
    const earned = [];
    if (T('attendance').some((x) => x.child_id === a.p_child && x.source === 'self_checkin')) earned.push('camp-fire-friend');
    if (prog.some((p) => p.step_key === 'mystery' && p.detail && p.detail.solved === true)) earned.push('story-detective');
    const byLesson = {};
    prog.forEach((p) => { (byLesson[p.lesson_id] = byLesson[p.lesson_id] || new Set()).add(p.step_key); });
    if (Object.values(byLesson).some((s) => ['mystery', 'story', 'quiz', 'verse'].every((k) => s.has(k)))) earned.push('map-marker');
    const fresh = earned.filter((k) => !has(k));
    fresh.forEach((k) => T('awards').push({ id: uuid(), child_id: a.p_child, badge_key: k }));
    save(db);
    return { data: fresh.map((k) => ({ new_badge: k })), error: null };
  }
  if (name === 'award_badge_by_parent') {
    const b = T('badges').find((x) => x.key === a.p_badge && x.awarded_by === 'parent');
    if (!ownChild(a.p_child) || !b) return { data: null, error: err('42501', 'not permitted') };
    if (!T('awards').some((x) => x.child_id === a.p_child && x.badge_key === a.p_badge)) T('awards').push({ id: uuid(), child_id: a.p_child, badge_key: a.p_badge });
    save(db);
    return { data: null, error: null };
  }
  return { data: null, error: err('42883', 'unknown function ' + name) };
}

export function createClient() {
  return {
    auth: {
      async getSession() { return { data: { session: load().auth.session } }; },
      async signUp({ email, password, options }) {
        const db = load();
        if (db.auth.users.some((u) => u.email === email)) return { data: {}, error: { message: 'User already registered' } };
        const user = { id: uuid(), email, password, user_metadata: (options && options.data) || {} };
        db.auth.users.push(user);
        if (!db.auth.confirmEmail) db.auth.session = { user: { id: user.id, email, user_metadata: user.user_metadata } };
        save(db);
        return { data: { user, session: db.auth.session }, error: null };
      },
      async signInWithPassword({ email, password }) {
        const db = load();
        const u = db.auth.users.find((x) => x.email === email && x.password === password);
        if (!u) return { data: {}, error: { message: 'Invalid login credentials' } };
        db.auth.session = { user: { id: u.id, email, user_metadata: u.user_metadata } };
        save(db);
        return { data: { session: db.auth.session }, error: null };
      },
      async signOut() { const db = load(); db.auth.session = null; save(db); return { error: null }; }
    },
    schema(name) {
      if (name !== 'children_service') throw new Error('fake supabase: unexpected schema ' + name);
      return { from: (t) => new Query(t), rpc: (fn, args) => Promise.resolve(rpc(fn, args || {})) };
    },
    rpc: (fn, args) => Promise.resolve(rpc(fn, args || {}))
  };
}
