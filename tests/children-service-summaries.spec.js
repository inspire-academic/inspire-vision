// The screens around the after-class parent email: an admin chooses (and can change) each
// class's teacher, previews the exact email and sends a test to themselves; a parent can switch
// the emails off and on. (The email wording, timing and sending rules are tested in
// cs-class-summary.spec.js; the two new database columns in the Postgres checks.)
const { test, expect } = require('@playwright/test');
const { BASE, seed, setup, db } = require('./helpers/cs-fixtures');

function adminSeed() {
  const s = seed();
  s.t.church_members.push(
    { id: 'adm', church_id: 'church1', user_id: 'parent1', role: 'church_admin', status: 'active', display_name: 'Eric' },
    { id: 't1', church_id: 'church1', user_id: 'u-tina', role: 'facilitator', status: 'active', display_name: 'Tina' },
    { id: 't2', church_id: 'church1', user_id: 'u-gone', role: 'facilitator', status: 'suspended', display_name: 'Gone' },
    { id: 'p2', church_id: 'church1', user_id: 'u-mum', role: 'parent', status: 'active', display_name: 'Ama' }
  );
  return s;
}
// Stand-in for the cs-class-summary Netlify function.
async function mockSummary(page, opts = {}) {
  const state = { calls: [], auth: [] };
  await page.route('**/.netlify/functions/cs-class-summary', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    state.calls.push(body); state.auth.push(route.request().headers().authorization);
    const send = (status, obj) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });
    const names = { kid1: 'Kofi', 'kid-other': 'Esi' };
    const who = body.child_id ? names[body.child_id] : 'Johnny';
    if (body.action === 'preview') return send(200, { ok: true, sample: !body.child_id, hasLesson: !opts.noLesson, childName: who, subject: who + ' joined Bible Explorers', text: 'x', html: '<html><body><p>Hello,</p><p><b>' + who + '</b> attended the virtual Bible class via Zoom</p><script>window.top.name="pwned"</script></body></html>' });
    if (body.action === 'send_test') return opts.testFails ? send(503, { error: 'Email is not set up on the server yet.' }) : send(200, { ok: true, sample: !body.child_id, hasLesson: !opts.noLesson, to: 'pastor@church.org' });
    return send(400, { error: 'Unknown action.' });
  });
  return state;
}

test.describe('choosing the teacher for a class', () => {
  test('the choice lists active teachers and leaders only, and is saved when scheduling', async ({ page }) => {
    const errs = await setup(page, adminSeed());
    await page.goto(`${BASE}/church-admin/index.html`);
    await expect(page.locator('#s-teacher')).toBeVisible();
    const opts = await page.locator('#s-teacher option').allInnerTexts();
    expect(opts[0]).toBe('Not set yet');
    expect(opts.slice(1).sort()).toEqual(['Eric', 'Tina']);                                  // active teachers and leaders only: not the parent, not the suspended teacher
    await page.selectOption('#s-teacher', 'Tina');
    await page.fill('#s-when', '2030-10-03T10:00');
    await page.fill('#s-url', 'https://zoom.example/j/999');
    await page.click('#s-go');
    await expect(page.getByText('Class scheduled')).toBeVisible();
    const s = (await db(page)).t.sessions.find((x) => x.starts_at.startsWith('2030'));
    expect(s.teacher_name).toBe('Tina');
    errs.assertNoErrors();
  });

  test('a class can be scheduled with no teacher yet (the email then leaves that line out)', async ({ page }) => {
    await setup(page, adminSeed());
    await page.goto(`${BASE}/church-admin/index.html`);
    await page.fill('#s-when', '2030-11-03T10:00');
    await page.fill('#s-url', 'https://zoom.example/j/998');
    await page.click('#s-go');
    await expect(page.getByText('Class scheduled')).toBeVisible();
    expect((await db(page)).t.sessions.find((x) => x.starts_at.startsWith('2030')).teacher_name).toBeNull();
  });

  test('the teacher can be set, changed and cleared on an existing class', async ({ page }) => {
    await setup(page, adminSeed());
    await page.goto(`${BASE}/church-admin/index.html`);
    const sel = () => page.locator('select[data-teacher-for="sess-open"]');
    await expect(sel()).toHaveValue('');
    await sel().selectOption('Tina');
    await expect(page.getByText('Teacher saved: Tina.')).toBeVisible();
    expect((await db(page)).t.sessions.find((x) => x.id === 'sess-open').teacher_name).toBe('Tina');
    await expect(sel()).toHaveValue('Tina');
    await sel().selectOption('Eric');
    await expect(page.getByText('Teacher saved: Eric.')).toBeVisible();
    await sel().selectOption('');
    await expect(page.getByText('Teacher cleared')).toBeVisible();
    expect((await db(page)).t.sessions.find((x) => x.id === 'sess-open').teacher_name).toBeNull();
    expect((await db(page)).t.sessions.find((x) => x.id === 'sess-early').teacher_name).toBeUndefined();   // other classes untouched
  });

  test('a teacher who has since left is still shown on the class they taught', async ({ page }) => {
    const s = adminSeed();
    s.t.sessions.find((x) => x.id === 'sess-open').teacher_name = 'Kwabena';
    await setup(page, s);
    await page.goto(`${BASE}/church-admin/index.html`);
    await expect(page.locator('select[data-teacher-for="sess-open"]')).toHaveValue('Kwabena');
  });
});

test.describe('previewing the parent email', () => {
  test('shows the exact email in a locked-down frame, for a REAL child of that class, and can be closed', async ({ page }) => {
    await setup(page, adminSeed());          // (no console-silence check here: the sample email holds a <script> on purpose, and the browser correctly logs that it was blocked)
    const st = await mockSummary(page);
    await page.goto(`${BASE}/church-admin/index.html`);
    await page.locator('[data-preview="sess-open"]').click();
    await expect(page.locator('#preview-card')).toContainText('Subject: Kofi joined Bible Explorers');      // the first real child in the class, not a made-up name
    await expect(page.locator('#preview-card')).toContainText('This is how the email reads for Kofi’s parent');
    await expect(page.locator('#preview-card')).not.toContainText('Johnny is only a stand-in');
    const frame = page.locator('#preview-frame iframe');
    await expect(frame).toHaveAttribute('sandbox', '');                                    // no scripts, no forms, no navigation
    await expect(page.frameLocator('#preview-frame iframe').getByText('attended the virtual Bible class via Zoom')).toBeVisible();
    await expect(page.frameLocator('#preview-frame iframe').getByText('Kofi', { exact: true })).toBeVisible();
    expect(st.calls).toEqual([{ action: 'preview', session_id: 'sess-open', child_id: 'kid1' }]);
    expect(st.auth[0]).toBe('Bearer tok-test');                                             // the admin's own session, checked again on the server
    expect(await page.evaluate(() => window.name)).not.toBe('pwned');                        // a script in the email could not touch the page
    await page.click('#preview-close');
    await expect(page.locator('#preview-card')).toHaveCount(0);
  });

  test('the admin can switch the preview to another child, or to the made-up sample, and it is explained', async ({ page }) => {
    await setup(page, adminSeed());
    const st = await mockSummary(page);
    await page.goto(`${BASE}/church-admin/index.html`);
    await page.locator('[data-preview="sess-open"]').click();
    await expect(page.locator('#preview-child option')).toHaveText(['Kofi', 'Esi', 'A sample child (Johnny)']);
    await page.selectOption('#preview-child', 'kid-other');
    await expect(page.locator('#preview-card')).toContainText('Subject: Esi joined Bible Explorers');
    await page.selectOption('#preview-child', '');
    await expect(page.locator('#preview-card')).toContainText('Subject: Johnny joined Bible Explorers');
    await expect(page.locator('#preview-card')).toContainText('Johnny is only a stand-in name for this preview');
    await expect(page.locator('#preview-card')).toContainText('their own child’s first name');
    expect(st.calls.map((c) => c.child_id)).toEqual(['kid1', 'kid-other', undefined]);
  });

  test('with no children in the class yet, the preview uses the sample and says why', async ({ page }) => {
    const s = adminSeed(); s.t.children = [];
    await setup(page, s);
    const st = await mockSummary(page);
    await page.goto(`${BASE}/church-admin/index.html`);
    await page.locator('[data-preview="sess-open"]').click();
    await expect(page.locator('#preview-card')).toContainText('Subject: Johnny joined Bible Explorers');
    await expect(page.locator('#preview-card')).toContainText('this class has no children in it yet');
    expect(st.calls[0].child_id).toBeUndefined();
  });

  test('a class with no lesson is flagged in the list and in the preview: parents would not be emailed', async ({ page }) => {
    const s = adminSeed(); s.t.sessions.find((x) => x.id === 'sess-open').lesson_id = null;
    await setup(page, s);
    await mockSummary(page, { noLesson: true });
    await page.goto(`${BASE}/church-admin/index.html`);
    await expect(page.getByText('No lesson attached. Parents will not be emailed for this class')).toHaveCount(1);     // only the one class without a lesson
    await page.locator('[data-preview="sess-open"]').click();
    await expect(page.locator('#preview-card')).toContainText('This class has no lesson attached, so parents will not be emailed for it');
    await expect(page.locator('#preview-card')).toHaveClass(/bad/);
  });

  test('a lesson can be attached to (or changed on) an existing class, and the warning goes away', async ({ page }) => {
    const s = adminSeed(); s.t.sessions.find((x) => x.id === 'sess-open').lesson_id = null;
    await setup(page, s);
    await page.goto(`${BASE}/church-admin/index.html`);
    const sel = page.locator('select[data-lesson-for="sess-open"]');
    await expect(sel).toHaveValue('');
    await sel.selectOption({ label: 'David' });
    await expect(page.getByText('Lesson saved for this class.')).toBeVisible();
    expect((await db(page)).t.sessions.find((x) => x.id === 'sess-open').lesson_id).toBe('lesson-david');
    await expect(page.getByText('No lesson attached.')).toHaveCount(0);
    await page.locator('select[data-lesson-for="sess-open"]').selectOption('');
    await expect(page.getByText('Lesson cleared')).toBeVisible();
    expect((await db(page)).t.sessions.find((x) => x.id === 'sess-open').lesson_id).toBeNull();
    expect((await db(page)).t.sessions.find((x) => x.id === 'sess-early').lesson_id).toBe('lesson-david');      // other classes untouched
  });

  test('"Send me a test" says where it went, and says plainly when email is not set up', async ({ page }) => {
    await setup(page, adminSeed());
    const st = await mockSummary(page);
    await page.goto(`${BASE}/church-admin/index.html`);
    await page.locator('[data-sendtest="sess-open"]').click();
    await expect(page.getByText('Test sent to pastor@church.org')).toBeVisible();
    await expect(page.getByText('No parent was emailed')).toBeVisible();
    expect(st.calls[0]).toEqual({ action: 'send_test', session_id: 'sess-open', child_id: 'kid1' });        // the test uses a real child's name too

    const p2 = await page.context().browser().newContext().then((c) => c.newPage());
    await setup(p2, adminSeed());
    await mockSummary(p2, { testFails: true });
    await p2.goto(`${BASE}/church-admin/index.html`);
    await p2.locator('[data-sendtest="sess-open"]').click();
    await expect(p2.getByText('Email is not set up on the server yet.')).toBeVisible();
  });
});

test.describe('a parent switching the emails off and on', () => {
  test('on by default; switching is remembered as a new record each time', async ({ page }) => {
    const errs = await setup(page, seed());
    await page.goto(`${BASE}/parent/index.html`);
    const card = page.locator('#emails');
    await expect(card).toContainText('Class summary emails');
    await expect(card).toContainText('✓ On');
    await card.getByRole('button', { name: 'Turn off' }).click();
    await expect(card).toContainText('Off');
    await expect(card.getByRole('button', { name: 'Turn on' })).toBeVisible();
    let rows = (await db(page)).t.consents.filter((c) => c.type === 'communications');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ parent_id: 'parent1', child_id: null, given: false });
    expect(rows[0].policy_version).toBeTruthy();

    await page.reload();                                                                     // remembered after leaving the page
    await expect(page.locator('#emails')).toContainText('Off');
    await page.locator('#emails').getByRole('button', { name: 'Turn on' }).click();
    await expect(page.locator('#emails')).toContainText('✓ On');
    rows = (await db(page)).t.consents.filter((c) => c.type === 'communications');
    expect(rows.map((r) => r.given)).toEqual([false, true]);                                 // history kept, latest wins
    errs.assertNoErrors();
  });

  test('the switch only appears for a parent who has a child', async ({ page }) => {
    await setup(page, seed({ kid: false }));
    await page.goto(`${BASE}/parent/index.html`);
    await expect(page.getByRole('heading', { name: 'Hello, Ama!' })).toBeVisible();
    await expect(page.locator('#emails')).toHaveCount(0);
  });
});
