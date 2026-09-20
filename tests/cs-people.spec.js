// netlify/functions/cs-people.js — people, roles and logins for one church.
// Pure Node tests against an in-memory stand-in for Supabase (no browser, no network),
// aimed at the things that must never happen: a non-admin acting, another church's admin
// acting, anyone outside the church becoming visible, an admin locking themselves out,
// and links being built for origins we do not own.
const { test, expect } = require('@playwright/test');
const { handle } = require('../netlify/functions/cs-people');

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const C1 = U(901), C2 = U(902);
const ids = { admin: U(1), admin2: U(2), teacher: U(3), parent: U(4), otherAdmin: U(5), outsider: U(6), susp: U(7) };

function world() {
  const users = [
    { id: ids.admin, email: 'pastor@church.org', last_sign_in_at: '2026-09-19T10:00:00Z', email_confirmed_at: 'x' },
    { id: ids.admin2, email: 'second.admin@church.org', last_sign_in_at: null, email_confirmed_at: 'x' },
    { id: ids.teacher, email: 'Teacher@Church.org', last_sign_in_at: '2026-09-18T10:00:00Z', email_confirmed_at: 'x' },
    { id: ids.parent, email: 'mum@example.com', last_sign_in_at: null, email_confirmed_at: null },
    { id: ids.otherAdmin, email: 'boss@otherchurch.org', last_sign_in_at: null, email_confirmed_at: 'x' },
    { id: ids.outsider, email: 'student@academic-site.org', last_sign_in_at: null, email_confirmed_at: 'x' },   // a user of ANOTHER site sharing the project
    { id: ids.susp, email: 'gone@church.org', last_sign_in_at: null, email_confirmed_at: 'x' }
  ];
  const tokens = { 'tok-admin': ids.admin, 'tok-admin2': ids.admin2, 'tok-teacher': ids.teacher, 'tok-parent': ids.parent, 'tok-other': ids.otherAdmin, 'tok-susp': ids.susp };
  const t = {
    churches: [{ id: C1, slug: 'inspire', name: 'Inspire' }, { id: C2, slug: 'other', name: 'Other' }],
    church_members: [
      { id: U(101), church_id: C1, user_id: ids.admin, role: 'church_admin', status: 'active', display_name: 'Eric', created_at: '1' },
      { id: U(102), church_id: C1, user_id: ids.teacher, role: 'facilitator', status: 'active', display_name: 'Tina', dbs_checked_on: '2026-01-01', safeguarding_trained_on: '2026-01-02', created_at: '2' },
      { id: U(103), church_id: C1, user_id: ids.parent, role: 'parent', status: 'active', display_name: 'Ama', created_at: '3' },
      { id: U(104), church_id: C2, user_id: ids.otherAdmin, role: 'church_admin', status: 'active', display_name: 'Boss', created_at: '4' },
      { id: U(105), church_id: C1, user_id: ids.susp, role: 'church_admin', status: 'suspended', display_name: 'Gone', created_at: '5' },
      { id: U(106), church_id: C2, user_id: ids.parent, role: 'parent', status: 'active', display_name: 'Ama', created_at: '6' }
    ]
  };
  const calls = { invite: [], reset: [], errors: 0 };
  let breakInserts = false;
  class Q {
    constructor(table) { this.table = table; this.f = []; this.op = 'select'; this.payload = null; }
    select() { return this; } order() { return this; }
    insert(p) { this.op = 'insert'; this.payload = p; return this; }
    update(p) { this.op = 'update'; this.payload = p; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c, v) { this.f.push((r) => r[c] === v); return this; }
    maybeSingle() { this.one = true; return this; }
    then(res, rej) { return Promise.resolve(this.run()).then(res, rej); }
    run() {
      const rows = t[this.table], m = (r) => this.f.every((x) => x(r));
      if (this.op === 'insert') {
        if (breakInserts) return { data: null, error: { code: 'XX000', message: 'secret internal detail' } };
        if (this.table === 'church_members' && rows.some((r) => r.church_id === this.payload.church_id && r.user_id === this.payload.user_id && r.role === this.payload.role)) return { data: null, error: { code: '23505', message: 'dup' } };
        rows.push({ id: U(500 + rows.length), created_at: '9', ...this.payload }); return { data: null, error: null };
      }
      if (this.op === 'update') { rows.filter(m).forEach((r) => Object.assign(r, this.payload)); return { data: null, error: null }; }
      if (this.op === 'delete') { t[this.table] = rows.filter((r) => !m(r)); return { data: null, error: null }; }
      const out = rows.filter(m);
      return this.one ? { data: out[0] || null, error: null } : { data: out, error: null };
    }
  }
  const admin = {
    schema: () => ({ from: (n) => new Q(n) }),
    auth: {
      getUser: async (tok) => (tokens[tok] ? { data: { user: users.find((u) => u.id === tokens[tok]) }, error: null } : { data: { user: null }, error: { message: 'bad' } }),
      resetPasswordForEmail: async (email, opts) => { calls.reset.push({ email, redirectTo: opts.redirectTo }); return { error: null }; },
      admin: {
        getUserById: async (id) => ({ data: { user: users.find((u) => u.id === id) || null }, error: null }),
        listUsers: async ({ page }) => ({ data: { users: page === 1 ? users : [] }, error: null }),
        inviteUserByEmail: async (email, opts) => { calls.invite.push({ email, opts }); const u = { id: U(700 + calls.invite.length), email }; users.push(u); return { data: { user: u }, error: null }; }
      }
    }
  };
  return { admin, t, calls, users, breakNext: () => { breakInserts = true; } };
}
const call = (w, token, body, headers = {}, method = 'POST') =>
  handle({ httpMethod: method, headers: { authorization: token ? `Bearer ${token}` : '', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }, { admin: w.admin, env: {} })
    .then((r) => ({ status: r.statusCode, body: JSON.parse(r.body) }));

test.describe('who may call it', () => {
  test('rejects a wrong method, no token, and a bad token', async () => {
    const w = world();
    expect((await call(w, 'tok-admin', {}, {}, 'GET')).status).toBe(405);
    expect((await call(w, '', { action: 'list' })).status).toBe(401);
    expect((await call(w, 'tok-nope', { action: 'list' })).status).toBe(401);
  });
  for (const [who, tok] of [['a teacher', 'tok-teacher'], ['a parent', 'tok-parent'], ["another church's admin", 'tok-other'], ['a SUSPENDED admin', 'tok-susp']]) {
    test(`refuses ${who}, for every action`, async () => {
      const w = world();
      for (const action of ['list', 'invite', 'assign_role', 'set_status', 'remove_role', 'send_reset']) {
        const r = await call(w, tok, { action, email: 'x@y.org', role: 'facilitator', user_id: ids.parent, member_id: U(102), status: 'suspended' });
        expect(r.status, `${who} / ${action}`).toBe(403);
      }
      expect(w.calls.invite).toHaveLength(0);
      expect(w.calls.reset).toHaveLength(0);
    });
  }
});

test.describe('list', () => {
  test('shows this church only, with emails, and never a user of another site', async () => {
    const w = world();
    const r = await call(w, 'tok-admin', { action: 'list' });
    expect(r.status).toBe(200);
    const emails = r.body.people.map((p) => p.email);
    expect(emails).toEqual(expect.arrayContaining(['pastor@church.org', 'Teacher@Church.org', 'mum@example.com', 'gone@church.org']));
    expect(emails).not.toContain('student@academic-site.org');                 // another site's user
    expect(emails).not.toContain('boss@otherchurch.org');                       // another church's admin
    expect(r.body.people.find((p) => p.user_id === ids.admin).is_me).toBe(true);
    const parent = r.body.people.find((p) => p.user_id === ids.parent);
    expect(parent.roles).toHaveLength(1);                                       // her membership in ANOTHER church is not shown
    expect(parent.confirmed).toBe(false);
    expect(JSON.stringify(r.body)).not.toMatch(/password|token|service/i);
  });
});

test.describe('invite', () => {
  test('a new person is invited by email and given the role; the link uses our own origin', async () => {
    const w = world();
    const r = await call(w, 'tok-admin', { action: 'invite', email: ' New.Teacher@Example.com ', role: 'facilitator', first_name: 'Kwame' });
    expect(r.status).toBe(200);
    expect(r.body.result).toBe('invited');
    expect(w.calls.invite).toHaveLength(1);
    expect(w.calls.invite[0].email).toBe('new.teacher@example.com');
    expect(w.calls.invite[0].opts.redirectTo).toBe('https://inspirevision.org/faith/children-service/parent/reset.html');
    expect(w.calls.invite[0].opts.data.full_name).toBe('Kwame');
    const row = w.t.church_members.find((m) => m.display_name === 'Kwame');
    expect(row).toMatchObject({ church_id: C1, role: 'facilitator', status: 'active' });
    expect(row.dbs_checked_on).toBeUndefined();                                // being a teacher does not grant sight of children: vetting is separate
  });

  test('staging origin is honoured; a foreign origin is ignored', async () => {
    const w = world();
    await call(w, 'tok-admin', { action: 'invite', email: 'a@example.com', role: 'facilitator' }, { origin: 'https://staging--inspire-vision.netlify.app' });
    expect(w.calls.invite[0].opts.redirectTo).toBe('https://staging--inspire-vision.netlify.app/faith/children-service/parent/reset.html');
    await call(w, 'tok-admin', { action: 'invite', email: 'b@example.com', role: 'facilitator' }, { origin: 'https://evil.example' });
    expect(w.calls.invite[1].opts.redirectTo).toBe('https://inspirevision.org/faith/children-service/parent/reset.html');
  });

  test('an existing account (any capitalisation) just gets the role; no email is sent', async () => {
    const w = world();
    const r = await call(w, 'tok-admin', { action: 'invite', email: 'MUM@example.com', role: 'assistant', first_name: 'Ama' });
    expect(r.body.result).toBe('assigned');
    expect(w.calls.invite).toHaveLength(0);
    expect(w.t.church_members.some((m) => m.user_id === ids.parent && m.role === 'assistant' && m.church_id === C1)).toBe(true);
    expect((await call(w, 'tok-admin', { action: 'invite', email: 'mum@example.com', role: 'assistant' })).status).toBe(409);   // same role twice
  });

  test('rejects a bad email, the parent role, and a surname', async () => {
    const w = world();
    expect((await call(w, 'tok-admin', { action: 'invite', email: 'nope', role: 'facilitator' })).status).toBe(400);
    expect((await call(w, 'tok-admin', { action: 'invite', email: 'a@b.org', role: 'parent' })).status).toBe(400);
    expect((await call(w, 'tok-admin', { action: 'invite', email: 'a@b.org', role: 'facilitator', first_name: 'Ama Mensah' })).status).toBe(400);
    expect(w.calls.invite).toHaveLength(0);
  });
});

test.describe('roles and status', () => {
  test('assign_role: members only, no duplicates, no parent role', async () => {
    const w = world();
    expect((await call(w, 'tok-admin', { action: 'assign_role', user_id: ids.outsider, role: 'facilitator' })).status).toBe(404);   // not a member of this church
    expect((await call(w, 'tok-admin', { action: 'assign_role', user_id: ids.parent, role: 'facilitator' })).status).toBe(200);
    expect((await call(w, 'tok-admin', { action: 'assign_role', user_id: ids.parent, role: 'facilitator' })).status).toBe(409);
    expect((await call(w, 'tok-admin', { action: 'assign_role', user_id: ids.parent, role: 'parent' })).status).toBe(400);
    expect((await call(w, 'tok-admin', { action: 'assign_role', user_id: 'not-a-uuid', role: 'facilitator' })).status).toBe(400);
  });

  test('set_status: suspends and reactivates; an admin cannot suspend themselves', async () => {
    const w = world();
    expect((await call(w, 'tok-admin', { action: 'set_status', member_id: U(102), status: 'suspended' })).status).toBe(200);
    expect(w.t.church_members.find((m) => m.id === U(102)).status).toBe('suspended');
    expect((await call(w, 'tok-admin', { action: 'set_status', member_id: U(102), status: 'active' })).status).toBe(200);
    expect((await call(w, 'tok-admin', { action: 'set_status', member_id: U(101), status: 'suspended' })).status).toBe(400);   // own admin row
    expect(w.t.church_members.find((m) => m.id === U(101)).status).toBe('active');
    expect((await call(w, 'tok-admin', { action: 'set_status', member_id: U(104), status: 'suspended' })).status).toBe(404);   // another church's row
    expect((await call(w, 'tok-admin', { action: 'set_status', member_id: U(102), status: 'pending' })).status).toBe(400);
  });

  test('there is always one active church admin', async () => {
    const w = world();
    w.t.church_members.push({ id: U(110), church_id: C1, user_id: ids.admin2, role: 'church_admin', status: 'active', display_name: 'Second', created_at: '7' });
    // admin suspends the second admin: allowed, they remain the only active admin
    expect((await call(w, 'tok-admin', { action: 'set_status', member_id: U(110), status: 'suspended' })).status).toBe(200);
    // the second admin (now suspended) can no longer act at all
    expect((await call(w, 'tok-admin2', { action: 'list' })).status).toBe(403);
    // and the remaining admin can neither suspend nor remove themselves
    expect((await call(w, 'tok-admin', { action: 'set_status', member_id: U(101), status: 'suspended' })).status).toBe(400);
    expect((await call(w, 'tok-admin', { action: 'remove_role', member_id: U(101) })).status).toBe(400);
  });

  test('remove_role: takes a teacher role away, refuses a parent, and stays inside this church', async () => {
    const w = world();
    expect((await call(w, 'tok-admin', { action: 'remove_role', member_id: U(103) })).status).toBe(400);            // parent
    expect(w.t.church_members.some((m) => m.id === U(103))).toBe(true);
    expect((await call(w, 'tok-admin', { action: 'remove_role', member_id: U(104) })).status).toBe(404);            // other church
    expect((await call(w, 'tok-admin', { action: 'remove_role', member_id: U(102) })).status).toBe(200);
    expect(w.t.church_members.some((m) => m.id === U(102))).toBe(false);
  });
});

test.describe('send_reset', () => {
  test('only for a member of this church, to their own address', async () => {
    const w = world();
    expect((await call(w, 'tok-admin', { action: 'send_reset', user_id: ids.teacher })).status).toBe(200);
    expect(w.calls.reset).toEqual([{ email: 'Teacher@Church.org', redirectTo: 'https://inspirevision.org/faith/children-service/parent/reset.html' }]);
    expect((await call(w, 'tok-admin', { action: 'send_reset', user_id: ids.outsider })).status).toBe(404);          // exists in auth, not in this church
    expect((await call(w, 'tok-admin', { action: 'send_reset', user_id: ids.otherAdmin })).status).toBe(404);
    expect(w.calls.reset).toHaveLength(1);                                                                         // the function cannot be used to email anyone else
  });
});

test.describe('robustness', () => {
  test('unknown action and invalid JSON are refused; internal errors never leak', async () => {
    const w = world();
    expect((await call(w, 'tok-admin', { action: 'drop_everything' })).status).toBe(400);
    expect((await call(w, 'tok-admin', '{not json')).status).toBe(400);
    w.breakNext();
    const r = await call(w, 'tok-admin', { action: 'assign_role', user_id: ids.parent, role: 'facilitator' });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('secret internal detail');
  });
});
