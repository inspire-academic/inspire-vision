// Teachers and the People page. A teacher account sees the lesson exactly as a child does
// (same player, same look) plus a few quiet teacher notes, and gets a basic class list.
// Access is by role, never by anything the browser claims. (Row-level security for the
// reads and writes involved is proven separately against a real Postgres; the server
// function behind the People page is tested in cs-people.spec.js.)
const { test, expect } = require('@playwright/test');
const { BASE, DAVID, SECRET, iso, seed, setup, db, passMoments } = require('./helpers/cs-fixtures');

function teacherSeed({ vetted = true, alsoParent = false } = {}) {
  const s = seed();
  const staff = {
    id: 't1', church_id: 'church1', user_id: 'parent1', role: 'facilitator', status: 'active', display_name: 'Tina',
    ...(vetted ? { dbs_checked_on: '2026-01-01', safeguarding_trained_on: '2026-01-02' } : {})
  };
  s.t.church_members = alsoParent ? [...s.t.church_members, staff] : [staff];
  if (!alsoParent) s.t.children = s.t.children.map((c) => (c.parent_id === 'parent1' ? { ...c, parent_id: 'someone-else' } : c));
  return s;
}

// mystery -> story -> quiz (+ its moment) -> verse, stopping on the finished verse game
async function playToVerseDone(page) {
  await page.locator('.choice', { hasText: 'David' }).click();
  await page.click('#go');
  for (;;) { const l = await page.locator('#fwd').innerText(); await page.click('#fwd'); if (l.includes('finished')) break; }
  for (let i = 0; i < DAVID.live.quiz.explorer.length; i++) { await page.locator('.choice').first().click(); await page.click('#nx'); }
  await passMoments(page);
  await page.locator('.bank button', { hasText: 'outward' }).click();
  await page.locator('.bank button', { hasText: 'looks' }).click();
}

test.describe('teacher sign-in, teacher home, and the same lessons with notes', () => {
  test('a teacher who signs in lands on the teacher home', async ({ page }) => {
    const errs = await setup(page, teacherSeed());
    await page.goto(`${BASE}/parent/index.html`);
    await expect(page).toHaveURL(/teacher\/index\.html$/);
    await expect(page.getByRole('heading', { name: 'Hello, Tina!' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'David' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Explorers (5–7)' })).toHaveAttribute('href', /teacher=1&band=explorer/);
    await expect(page.getByRole('link', { name: 'Trailblazers (8–11)' })).toHaveAttribute('href', /teacher=1&band=trailblazer/);
    await expect(page.getByRole('link', { name: 'Class list' })).toHaveCount(4);
    errs.assertNoErrors();
  });

  test('the teacher view is the same player, with teacher notes and a run sheet, and saves nothing', async ({ page }) => {
    const errs = await setup(page, teacherSeed());
    await page.goto(`${BASE}/teacher/index.html`);
    await page.getByRole('link', { name: 'Explorers (5–7)' }).click();
    await expect(page.getByText('Teacher view: nothing is saved.')).toBeVisible();
    await expect(page.locator('#stage')).toBeVisible();                                  // the very same stage a child sees
    await expect(page.locator('details.teacher-note summary')).toContainText('28 minutes');
    await page.locator('details.teacher-note summary').click();
    await expect(page.locator('details.teacher-note')).toContainText('Think about it');   // the run sheet spells out the moments

    await page.locator('.choice', { hasText: 'David' }).click();
    await page.click('#go');
    await expect(page.locator('#stage .teacher-note')).toContainText('Prop:');            // first story card
    await expect(page.locator('#stage .teacher-note')).toContainText('God looks at the');
    for (let n = 0; n < 40 && !(await page.locator('.moment-tag').count()); n++) await page.click('#fwd');
    await expect(page.locator('#stage .teacher-note')).toContainText('Ask aloud:');
    await expect(page.locator('#stage .teacher-note')).toContainText('picked last');      // this moment's leader prompt
    await page.locator('#stage .choice').first().click();                                // the child-style tap still works
    await expect(page.locator('#mresp')).not.toBeEmpty();

    await page.locator('[data-band="trailblazer"]').click();                             // preview the other age group
    await expect(page.locator('details.teacher-note summary')).toContainText('42 minutes');
    const s = await db(page);
    expect(s.t.progress).toHaveLength(0);                                                // nothing saved
    expect(s.t.awards).toHaveLength(0);
    errs.assertNoErrors();
  });

  test('the verse and belonging steps carry notes for the teacher too', async ({ page }) => {
    await setup(page, teacherSeed());
    await page.goto(`${BASE}/play/lesson.html?lesson=david-01&teacher=1&band=explorer`);
    await playToVerseDone(page);
    await expect(page.locator('#stage .teacher-note')).toContainText('Actions:');
    await page.click('#nx');
    await passMoments(page);
    await expect(page.locator('.moment-tag.belong')).toBeVisible();
    await expect(page.locator('#stage .teacher-note')).toContainText('Ruth was not born in Israel');   // belonging leader prompt
    await expect(page.locator('#stage .teacher-note')).toContainText('Who else is in this story');
  });

  test('a draft lesson is clearly marked in the teacher view', async ({ page }) => {
    await setup(page, teacherSeed());
    const draft = JSON.parse(JSON.stringify(DAVID));                                   // serve a draft copy, whatever state the real file is in
    draft.contentReview = { status: 'draft', reviewer: null, reviewedOn: null };
    await page.route('**/content/lessons/david-01.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(draft) }));
    await page.goto(`${BASE}/play/lesson.html?lesson=david-01&teacher=1`);
    await expect(page.locator('.preview-banner')).toContainText('DRAFT');
  });

  test('an approved lesson is not marked as a draft, and the real file names its reviewer and date', async ({ page }) => {
    await setup(page, teacherSeed());
    await page.goto(`${BASE}/play/lesson.html?lesson=david-01&teacher=1`);
    await expect(page.locator('.preview-banner')).toBeVisible();
    await expect(page.locator('.preview-banner')).not.toContainText('DRAFT');
    expect(DAVID.contentReview.status).toBe('approved');
    expect(DAVID.contentReview.reviewer).toBeTruthy();
    expect(DAVID.contentReview.reviewedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('?teacher=1 does nothing for someone who is not a teacher', async ({ page }) => {
    await setup(page, seed());                                                           // an ordinary parent
    await page.goto(`${BASE}/play/lesson.html?lesson=david-01&teacher=1`);
    await expect(page.getByText('Practice mode: nothing is saved.')).toBeVisible();
    await page.locator('.choice', { hasText: 'David' }).click();
    await page.click('#go');
    await expect(page.locator('.teacher-note')).toHaveCount(0);
  });

  test('teacher pages turn away a parent', async ({ page }) => {
    await setup(page, seed());
    await page.goto(`${BASE}/teacher/index.html`);
    await expect(page.getByRole('heading', { name: 'Teacher tools are for teachers' })).toBeVisible();
    await page.goto(`${BASE}/teacher/class.html?session=sess-open`);
    await expect(page.getByRole('heading', { name: 'Teachers only' })).toBeVisible();
    expect(await page.content()).not.toContain('SECRET-LINK');
  });

  test('a teacher who is also a parent can reach the family page; an admin is not redirected', async ({ page, browser }) => {
    await setup(page, teacherSeed({ alsoParent: true }));
    await page.goto(`${BASE}/parent/index.html`);
    await expect(page).toHaveURL(/teacher\/index\.html$/);                                // lands on teacher home...
    await page.getByRole('link', { name: 'My family' }).first().click();                  // ...and can still get to their family
    await expect(page.getByRole('heading', { name: 'Kofi' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Teacher tools' })).toBeVisible();

    const a = seed(); a.t.church_members.push({ id: 'adm', church_id: 'church1', user_id: 'parent1', role: 'church_admin', status: 'active', display_name: 'Ama' });
    const p2 = await (await browser.newContext()).newPage();
    await setup(p2, a);
    await p2.goto(`${BASE}/parent/index.html`);
    await expect(p2.getByRole('heading', { name: 'Hello, Ama!' })).toBeVisible();        // an admin stays on the family page
    await expect(p2.getByRole('link', { name: 'Teacher tools' })).toBeVisible();
    await expect(p2.getByRole('link', { name: 'People and roles' })).toBeVisible();
  });
});

test.describe('teacher class list', () => {
  test('a vetted teacher sees the class and the meeting link, marks attendance and gives a badge', async ({ page }) => {
    const errs = await setup(page, teacherSeed());
    await page.goto(`${BASE}/teacher/class.html?session=sess-open`);
    await expect(page.getByRole('heading', { name: 'Explorers' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Open Zoom/ })).toHaveAttribute('href', SECRET);
    await expect(page.locator('[data-kid="kid1"]')).toContainText('Kofi');
    await expect(page.locator('[data-kid="kid1"]')).toContainText('Not marked yet');

    await page.locator('[data-kid="kid1"]').getByRole('button', { name: 'Mark present' }).click();
    await expect(page.locator('[data-kid="kid1"]')).toContainText('Here');
    expect((await db(page)).t.attendance).toEqual([expect.objectContaining({ session_id: 'sess-open', child_id: 'kid1', source: 'leader' })]);
    await page.locator('[data-kid="kid1"]').getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('[data-kid="kid1"]')).toContainText('Not marked yet');
    expect((await db(page)).t.attendance).toHaveLength(0);

    await page.locator('select[data-badge="kid1"]').selectOption('verse-keeper');
    await expect(page.getByText('Verse Keeper given.')).toBeVisible();
    expect((await db(page)).t.awards).toEqual([expect.objectContaining({ child_id: 'kid1', badge_key: 'verse-keeper' })]);
    await expect(page.locator('select[data-badge="kid1"] option[value="verse-keeper"]')).toHaveCount(0);   // already given
    await expect(page.locator('[data-kid="kid1"]')).toContainText('Verse Keeper');
    errs.assertNoErrors();
  });

  test("a family's own check-in is shown and cannot be undone by the teacher", async ({ page }) => {
    const s = teacherSeed();
    s.t.attendance = [{ id: 'a1', session_id: 'sess-open', child_id: 'kid1', source: 'self_checkin' }];
    await setup(page, s);
    await page.goto(`${BASE}/teacher/class.html?session=sess-open`);
    await expect(page.locator('[data-kid="kid1"]')).toContainText('family checked in');
    await expect(page.locator('[data-kid="kid1"]').getByRole('button', { name: 'Undo' })).toHaveCount(0);
    await expect(page.locator('[data-kid="kid1"]').getByRole('button', { name: 'Mark present' })).toHaveCount(0);
    await expect(page.locator('[data-kid="kid-other"]').getByRole('button', { name: 'Mark present' })).toHaveCount(1);   // other children can still be marked
  });

  test('a teacher whose checks are not recorded sees no class list and no meeting link', async ({ page }) => {
    await setup(page, teacherSeed({ vetted: false }));
    await page.goto(`${BASE}/teacher/index.html`);
    await expect(page.getByRole('heading', { name: 'One more step' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Explorers (5–7)' })).toBeVisible();      // but can already teach
    await page.goto(`${BASE}/teacher/class.html?session=sess-open`);
    await expect(page.getByText('Class lists stay hidden')).toBeVisible();
    await expect(page.locator('[data-kid]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Open Zoom/ })).toHaveCount(0);
    const html = await page.content();
    expect(html).not.toContain('Kofi');
    expect(html).not.toContain('SECRET-LINK');
  });
});

// ============================== people and roles ==============================
const PEOPLE = () => [
  { user_id: 'parent1', is_me: true, name: 'Eric', email: 'pastor@church.org', last_sign_in_at: iso(-60), confirmed: true, roles: [{ id: 'r1', role: 'church_admin', status: 'active', dbs_checked_on: null, safeguarding_trained_on: null }] },
  { user_id: 'u-tina', is_me: false, name: 'Tina', email: 'tina@church.org', last_sign_in_at: null, confirmed: true, roles: [{ id: 'r2', role: 'facilitator', status: 'active', dbs_checked_on: '2026-01-01', safeguarding_trained_on: '2026-01-02' }] },
  { user_id: 'u-ama', is_me: false, name: 'Ama', email: 'ama@example.com', last_sign_in_at: iso(-3000), confirmed: true, roles: [{ id: 'r3', role: 'parent', status: 'active', dbs_checked_on: null, safeguarding_trained_on: null }] }
];
function adminSeed() {
  const s = seed();
  s.t.church_members.push({ id: 'adm', church_id: 'church1', user_id: 'parent1', role: 'church_admin', status: 'active', display_name: 'Eric' });
  return s;
}
// Stand-in for the cs-people Netlify function, so the page can be tested without a server.
async function mockPeople(page, opts = {}) {
  const state = { people: PEOPLE(), calls: [], auth: [] };
  await page.route('**/.netlify/functions/cs-people', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    state.calls.push(body); state.auth.push(route.request().headers().authorization);
    const send = (status, obj) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });
    if (opts.denyAll) return send(403, { error: 'Not authorized' });
    if (opts.fail && opts.fail[body.action]) return send(opts.fail[body.action].status, { error: opts.fail[body.action].error });
    const role = (id) => state.people.flatMap((p) => p.roles).find((r) => r.id === id);
    switch (body.action) {
      case 'list': return send(200, { church: { name: 'Inspire' }, me: 'parent1', people: state.people });
      case 'invite':
        state.people.push({ user_id: 'u-new', is_me: false, name: body.first_name || null, email: body.email, last_sign_in_at: null, confirmed: false, roles: [{ id: 'rn', role: body.role, status: 'active', dbs_checked_on: null, safeguarding_trained_on: null }] });
        return send(200, { ok: true, result: 'invited', email: body.email });
      case 'set_status': role(body.member_id).status = body.status; return send(200, { ok: true });
      case 'remove_role': state.people.forEach((p) => { p.roles = p.roles.filter((r) => r.id !== body.member_id); }); state.people = state.people.filter((p) => p.roles.length); return send(200, { ok: true });
      case 'assign_role': state.people.find((p) => p.user_id === body.user_id).roles.push({ id: 'rx', role: body.role, status: 'active' }); return send(200, { ok: true });
      case 'set_checks': { const r = role(body.member_id); r.dbs_checked_on = body.dbs_checked_on; r.safeguarding_trained_on = body.safeguarding_trained_on; return send(200, { ok: true }); }
      case 'send_reset': return send(200, { ok: true, email: state.people.find((p) => p.user_id === body.user_id).email });
      default: return send(400, { error: 'Unknown action.' });
    }
  });
  return state;
}

test.describe('people and roles page', () => {
  test('lists everyone with email, last sign-in and role; protects your own admin role', async ({ page }) => {
    const errs = await setup(page, adminSeed());
    await mockPeople(page);
    await page.goto(`${BASE}/church-admin/people.html`);
    await expect(page.getByRole('heading', { name: 'People and roles' })).toBeVisible();
    const me = page.locator('[data-person="parent1"]'), tina = page.locator('[data-person="u-tina"]'), ama = page.locator('[data-person="u-ama"]');
    await expect(me).toContainText('pastor@church.org');
    await expect(me).toContainText('You');
    await expect(me).toContainText('You can’t change your own admin role');
    await expect(me.getByRole('button', { name: 'Suspend' })).toHaveCount(0);
    await expect(tina).toContainText('Teacher');
    await expect(tina).toContainText('Has not signed in yet');
    await expect(tina).toContainText('Can see class lists');
    await expect(tina.getByRole('button', { name: 'Remove' })).toBeVisible();
    await expect(ama).toContainText('Parent');
    await expect(ama.getByRole('button', { name: 'Suspend' })).toBeVisible();
    await expect(ama.getByRole('button', { name: 'Remove' })).toHaveCount(0);              // a family is suspended, never removed here
    errs.assertNoErrors();
  });

  test("adds a teacher by email, sending the admin's own session token", async ({ page }) => {
    await setup(page, adminSeed());
    const st = await mockPeople(page);
    await page.goto(`${BASE}/church-admin/people.html`);
    await page.fill('#i-email', 'not-an-email');
    await page.click('#i-go');
    await expect(page.locator('#i-err')).toContainText('doesn’t look right');
    await page.fill('#i-email', 'new.teacher@example.com');
    await page.fill('#i-name', 'Kwame Mensah');
    await page.click('#i-go');
    await expect(page.locator('#i-err')).toContainText('just a first name');
    await page.fill('#i-name', 'Kwame');
    await page.click('#i-go');
    await expect(page.getByText('Invitation sent to new.teacher@example.com')).toBeVisible();
    expect(st.calls.find((c) => c.action === 'invite')).toEqual({ action: 'invite', email: 'new.teacher@example.com', first_name: 'Kwame', role: 'facilitator' });
    expect(st.auth.every((a) => a === 'Bearer tok-test')).toBe(true);                       // the caller's own token, on every call
    await expect(page.locator('[data-person="u-new"]')).toContainText('Has not confirmed their email yet');
    await expect(page.locator('[data-person="u-new"]')).toContainText('Teacher');
  });

  test('suspend, reactivate, and a two-step remove', async ({ page }) => {
    await setup(page, adminSeed());
    const st = await mockPeople(page);
    await page.goto(`${BASE}/church-admin/people.html`);
    const tina = () => page.locator('[data-person="u-tina"]');
    await tina().getByRole('button', { name: 'Suspend' }).click();
    await expect(page.getByText('That role is suspended')).toBeVisible();
    expect(st.calls.find((c) => c.action === 'set_status')).toMatchObject({ member_id: 'r2', status: 'suspended' });
    await tina().getByRole('button', { name: 'Reactivate' }).click();
    await expect(page.getByText('Access is back on')).toBeVisible();

    await tina().getByRole('button', { name: 'Remove' }).click();
    await expect(tina()).toContainText('Remove this role?');
    await tina().getByRole('button', { name: 'Keep' }).click();
    expect(st.calls.some((c) => c.action === 'remove_role')).toBe(false);                   // nothing happens until the confirming tap
    await tina().getByRole('button', { name: 'Remove' }).click();
    await tina().getByRole('button', { name: 'Yes, remove' }).click();
    await expect(page.getByText('Role removed.')).toBeVisible();
    await expect(page.locator('[data-person="u-tina"]')).toHaveCount(0);
    expect(st.calls.find((c) => c.action === 'remove_role')).toEqual({ action: 'remove_role', member_id: 'r2' });
  });

  test('gives another role, and sends a password reset', async ({ page }) => {
    await setup(page, adminSeed());
    const st = await mockPeople(page);
    await page.goto(`${BASE}/church-admin/people.html`);
    await page.locator('select[data-addrole-for="u-ama"]').selectOption('facilitator');
    await expect(page.getByText('Teacher role added.')).toBeVisible();
    expect(st.calls.find((c) => c.action === 'assign_role')).toEqual({ action: 'assign_role', user_id: 'u-ama', role: 'facilitator' });
    await page.locator('[data-person="u-tina"]').getByRole('button', { name: 'Send password reset' }).click();
    await expect(page.getByText('A password-reset email has been sent to tina@church.org')).toBeVisible();
  });

  test('DBS and training date boxes are on every teacher and leader card, and not on families', async ({ page }) => {
    await setup(page, adminSeed());
    await mockPeople(page);
    await page.goto(`${BASE}/church-admin/people.html`);
    const tina = page.locator('[data-person="u-tina"]'), eric = page.locator('[data-person="parent1"]'), ama = page.locator('[data-person="u-ama"]');
    await expect(tina.locator('[data-f=dbs]')).toHaveValue('2026-01-01');
    await expect(tina.locator('[data-f=train]')).toHaveValue('2026-01-02');
    await expect(tina).toContainText('✓ Can see class lists');
    await expect(eric.locator('[data-f=dbs]')).toHaveValue('');
    await expect(eric).toContainText('Needs both dates');
    await expect(ama.locator('[data-f=dbs]')).toHaveCount(0);                              // families have no checks
    await expect(ama.locator('[data-savechecks]')).toHaveCount(0);
    const today = await page.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); });
    await expect(tina.locator('[data-f=dbs]')).toHaveAttribute('max', today);            // the picker itself refuses future dates
  });

  test('both dates unlock class lists; one alone does not; a date can be cleared', async ({ page }) => {
    await setup(page, adminSeed());
    const st = await mockPeople(page);
    await page.goto(`${BASE}/church-admin/people.html`);
    const eric = () => page.locator('[data-person="parent1"]');
    await eric().locator('[data-f=dbs]').fill('2026-03-04');
    await eric().getByRole('button', { name: 'Save dates' }).click();
    await expect(page.getByText('once BOTH dates are recorded')).toBeVisible();
    expect(st.calls.find((c) => c.action === 'set_checks')).toEqual({ action: 'set_checks', member_id: 'r1', dbs_checked_on: '2026-03-04', safeguarding_trained_on: null });
    await expect(eric()).toContainText('Needs both dates');                                // still locked with one date

    await eric().locator('[data-f=train]').fill('2026-03-10');
    await eric().getByRole('button', { name: 'Save dates' }).click();
    await expect(page.getByText('can now see class lists and the meeting link')).toBeVisible();
    await expect(eric()).toContainText('✓ Can see class lists');

    const tina = () => page.locator('[data-person="u-tina"]');                            // clearing a date takes access away again
    await tina().locator('[data-f=dbs]').fill('');
    await tina().getByRole('button', { name: 'Save dates' }).click();
    await expect(tina()).toContainText('Needs both dates');
    expect(st.calls.filter((c) => c.action === 'set_checks').pop()).toMatchObject({ member_id: 'r2', dbs_checked_on: null, safeguarding_trained_on: '2026-01-02' });
  });

  test("a refused date is shown plainly and nothing looks saved", async ({ page }) => {
    await setup(page, adminSeed());
    await mockPeople(page, { fail: { set_checks: { status: 400, error: 'Please enter real dates that are not in the future.' } } });
    await page.goto(`${BASE}/church-admin/people.html`);
    await page.locator('[data-person="parent1"]').locator('[data-f=dbs]').fill('2026-03-04');
    await page.locator('[data-person="parent1"]').getByRole('button', { name: 'Save dates' }).click();
    await expect(page.getByText('Please enter real dates that are not in the future.')).toBeVisible();
    await expect(page.locator('[data-person="parent1"]')).toContainText('Needs both dates');
  });

  test("the server's refusal is shown plainly, and a non-admin is turned away", async ({ page, browser }) => {
    await setup(page, adminSeed());
    await mockPeople(page, { fail: { assign_role: { status: 409, error: 'They already have that role.' } } });
    await page.goto(`${BASE}/church-admin/people.html`);
    await page.locator('select[data-addrole-for="u-tina"]').selectOption('assistant');
    await expect(page.getByText('They already have that role.')).toBeVisible();

    const p2 = await (await browser.newContext()).newPage();
    await setup(p2, teacherSeed());
    await mockPeople(p2, { denyAll: true });
    await p2.goto(`${BASE}/church-admin/people.html`);
    await expect(p2.getByRole('heading', { name: 'Church admins only' })).toBeVisible();
    await expect(p2.locator('#invite')).toHaveCount(0);
  });
});
