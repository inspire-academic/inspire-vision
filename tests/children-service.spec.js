// Children's Service (Bible Explorers) — end-to-end behaviour of the parent
// and play pages.
//
// Unlike the other specs here this one does NOT talk to the real Supabase
// project: the module's tables aren't deployed there yet, and a test must
// never create real accounts or children's records. Instead the Supabase SDK
// import is intercepted and replaced with tests/helpers/fake-supabase.mjs, an
// in-memory stand-in. The page code under test is unchanged.
//
// What this DOES prove: the pages' flows, gating and rendering, that the
// Zoom link is not in the page before the server releases it, that a child
// belonging to another parent can't be opened, and that practice mode writes
// nothing. What it does NOT prove: row-level security, which lives in
// supabase/children_service_schema*.sql and is tested against a real Postgres
// (see the commit message / PR notes for how).
const { test, expect } = require('@playwright/test');
const { BASE, DAVID, SECRET, iso, BADGES, seed, setup, db, passMoments } = require('./helpers/cs-fixtures');
const { trackConsoleErrors } = require('./helpers');

test.describe('landing page', () => {
  test('the mystery is driven by the lesson JSON and can be solved', async ({ page }) => {
    const errs = await trackConsoleErrors(page);
    await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto(`${BASE}/index.html`);
    await expect(page.locator('#clues li')).toHaveCount(1);
    await expect(page.locator('#clues li span')).toHaveText(DAVID.preClass.mystery.clues[0]);
    await page.getByRole('button', { name: 'Moses' }).click();
    await expect(page.locator('#msg')).toContainText('Not quite');
    await page.getByRole('button', { name: 'David' }).click();
    await expect(page.locator('#msg')).toContainText('It was David');
    await expect(page.locator('#badge-pop')).toBeVisible();
    errs.assertNoErrors();
  });

  test('"Give me another clue" disappears after the last clue', async ({ page }) => {
    await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto(`${BASE}/index.html`);
    const more = page.locator('#more');
    for (let i = 1; i < DAVID.preClass.mystery.clues.length; i++) await more.click();
    await expect(page.locator('#clues li')).toHaveCount(DAVID.preClass.mystery.clues.length);
    await expect(more).toBeHidden();
  });
});

test.describe('accounts and gating', () => {
  test('a signed-out visitor is sent to sign in and back', async ({ page }) => {
    await setup(page, seed({ signedIn: false }));
    await page.goto(`${BASE}/parent/index.html`);
    await expect(page).toHaveURL(/parent\/login\.html\?next=/);
    await page.fill('#email', 'ama@example.com');
    await page.fill('#pw', 'password1');
    await page.click('#go');
    await expect(page).toHaveURL(/parent\/index\.html$/);
  });

  test('sign-in ignores an off-site ?next= (no open redirect)', async ({ page }) => {
    await setup(page, seed({ signedIn: false }));
    await page.goto(`${BASE}/parent/login.html?next=${encodeURIComponent('https://evil.example/steal')}`);
    await page.fill('#email', 'ama@example.com');
    await page.fill('#pw', 'password1');
    await page.click('#go');
    await expect(page).toHaveURL(/faith\/children-service\/parent\/index\.html$/);
  });

  test('wrong password gives a friendly message', async ({ page }) => {
    await setup(page, seed({ signedIn: false }));
    await page.goto(`${BASE}/parent/login.html`);
    await page.fill('#email', 'ama@example.com');
    await page.fill('#pw', 'nope-nope');
    await page.click('#go');
    await expect(page.locator('#err')).toContainText('don’t match');
  });

  test('new parent: sign up, consent gate, ask to join, wait for approval', async ({ page }) => {
    // Fresh database for a brand-new parent: the fake has no row-level security, so
    // seeded rows belonging to other people must not be present or they'd be visible.
    const fresh = seed().t;
    fresh.consents = []; fresh.church_members = []; fresh.children = []; fresh.sessions = [];
    const errs = await setup(page, { auth: { users: [], session: null }, t: fresh });
    await page.goto(`${BASE}/parent/join.html`);
    await page.fill('#name', 'Ama');
    await page.fill('#email', 'new@example.com');
    await page.fill('#pw', 'password1');
    await page.click('#go');
    await expect(page.locator('#err')).toContainText('18 or over');           // adult box not ticked
    await page.check('#adult');
    await page.click('#go');
    await expect(page).toHaveURL(/parent\/index\.html$/);
    await expect(page.getByRole('heading', { name: 'Before we start' })).toBeVisible();
    await page.click('#cgo');
    await expect(page.locator('#cerr')).toContainText('tick both');            // cannot skip consent
    await page.check('#c1'); await page.check('#c2');
    await page.click('#cgo');
    await expect(page.getByRole('heading', { name: /Join Inspire/ })).toBeVisible();
    await page.click('#ask');
    await expect(page.getByRole('heading', { name: 'Waiting for a leader to approve you' })).toBeVisible();
    const s = await db(page);
    const mine = s.t.consents.filter((c) => c.type === 'data_processing' || c.type === 'safeguarding_policy');
    expect(mine).toHaveLength(2);
    expect(mine.every((c) => c.given === true && c.policy_version && c.child_id === null)).toBe(true);
    expect(s.t.church_members.find((m) => m.status === 'pending' && m.role === 'parent')).toBeTruthy();
    errs.assertNoErrors();
  });

  test('a pending parent cannot add children', async ({ page }) => {
    await setup(page, seed({ member: 'pending', kid: false }));
    await page.goto(`${BASE}/parent/child.html`);
    await expect(page.getByRole('heading', { name: 'Not just yet' })).toBeVisible();
    await expect(page.locator('#form')).toHaveCount(0);
  });

  test('a parent who has not consented is stopped at the consent screen', async ({ page }) => {
    await setup(page, seed({ consent: false }));
    await page.goto(`${BASE}/parent/index.html`);
    await expect(page.getByRole('heading', { name: 'Before we start' })).toBeVisible();
  });
});

test.describe('family, children and avatars', () => {
  test('add a child: name rules, class assignment, avatar saved', async ({ page }) => {
    const errs = await setup(page, seed({ kid: false }));
    await page.goto(`${BASE}/parent/index.html`);
    await expect(page.getByRole('heading', { name: 'Hello, Ama!' })).toBeVisible();
    await page.getByRole('link', { name: /Add a child/ }).click();
    await expect(page).toHaveURL(/child\.html$/);

    await page.click('#save');
    await expect(page.locator('#err')).toContainText('first name');
    await page.fill('#dn', 'Kofi Mensah');
    await page.click('#save');
    await expect(page.locator('#err')).toContainText('no surname');
    await page.fill('#dn', 'Kofi');
    await page.click('#save');
    await expect(page.locator('#err')).toContainText('age group');

    await page.getByLabel(/Trailblazers/).check();
    await page.getByRole('button', { name: 'Long' }).click();
    await page.getByRole('button', { name: 'Scarf' }).click();
    await page.click('#save');
    await expect(page).toHaveURL(/parent\/index\.html$/);
    await expect(page.getByRole('heading', { name: 'Kofi' })).toBeVisible();
    await expect(page.getByText('Trailblazer (8–11)')).toBeVisible();

    const kid = (await db(page)).t.children.find((c) => c.display_name === 'Kofi');
    expect(kid.class_id).toBe('class-trb');                                    // matched to the right class
    expect(kid.parent_id).toBe('parent1');
    expect(kid.avatar).toMatchObject({ hair: 2, gear: 2 });
    expect(Object.keys(kid).sort()).toEqual(['age_band', 'avatar', 'church_id', 'class_id', 'created_at', 'display_name', 'id', 'parent_id']); // nothing else collected
    errs.assertNoErrors();
  });

  test("another parent's child cannot be opened, edited or played", async ({ page }) => {
    await setup(page, seed());
    await page.goto(`${BASE}/parent/child.html?id=kid-other`);
    await expect(page.getByRole('heading', { name: /couldn’t find that child/ })).toBeVisible();
    await page.goto(`${BASE}/play/home.html?child=kid-other`);
    await expect(page.getByRole('heading', { name: /couldn’t find that explorer/ })).toBeVisible();
    await page.goto(`${BASE}/play/lesson.html?lesson=david-01&child=kid-other`);
    await expect(page.getByRole('heading', { name: /couldn’t find that explorer/ })).toBeVisible();
  });

  test('editing a child keeps their age group; removing needs a second confirming tap', async ({ page }) => {
    await setup(page, seed());
    await page.goto(`${BASE}/parent/child.html?id=kid1`);
    await expect(page.locator('input[name=band]')).toHaveCount(0);            // age group is fixed
    await page.fill('#dn', 'Kojo');
    await page.click('#save');
    await expect(page.getByRole('heading', { name: 'Kojo' })).toBeVisible();
    expect((await db(page)).t.children.find((c) => c.id === 'kid1').age_band).toBe('explorer');

    await page.goto(`${BASE}/parent/child.html?id=kid1`);
    await page.click('#rm');
    await expect(page.getByText('Really remove Kojo?')).toBeVisible();
    await page.click('#rm-no');
    expect((await db(page)).t.children.some((c) => c.id === 'kid1')).toBe(true);
    await page.click('#rm');
    await page.click('#rm-yes');
    await expect(page).toHaveURL(/parent\/index\.html$/);
    expect((await db(page)).t.children.some((c) => c.id === 'kid1')).toBe(false);
  });
});

test.describe('joining class', () => {
  test('the Zoom link is not in the page before its time', async ({ page }) => {
    await setup(page, seed());
    await page.goto(`${BASE}/class/join.html?session=sess-early`);
    await expect(page.getByText('Not open yet')).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain('SECRET-LINK');
    expect(html).not.toContain('pw-early');
    await expect(page.getByRole('link', { name: /Open Zoom/ })).toHaveCount(0);
  });

  test('inside the window the link appears, and check-in earns Camp Fire Friend', async ({ page }) => {
    const errs = await setup(page, seed());
    await page.goto(`${BASE}/class/join.html?session=sess-open`);
    const link = page.getByRole('link', { name: /Open Zoom/ });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', SECRET);
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(page.getByText('pw-open')).toBeVisible();
    await page.getByRole('button', { name: 'I’m here!' }).click();
    await expect(page.getByText('✓ Checked in')).toBeVisible();
    await expect(page.locator('#newbadge')).toContainText('Camp Fire Friend');
    const s = await db(page);
    expect(s.t.attendance).toEqual([expect.objectContaining({ session_id: 'sess-open', child_id: 'kid1', source: 'self_checkin' })]);
    errs.assertNoErrors();
  });

  test('just after the scheduled end the link still works but the page no longer says "open"', async ({ page }) => {
    await setup(page, seed());
    await page.goto(`${BASE}/class/join.html?session=sess-just-ended`);
    await expect(page.getByText('The class time is over')).toBeVisible();
    await expect(page.getByText('The class is open')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Open Zoom/ })).toHaveAttribute('href', SECRET + '-JUSTENDED');
  });

  test('more than 10 minutes after the end the link is gone', async ({ page }) => {
    await setup(page, seed());
    await page.goto(`${BASE}/class/join.html?session=sess-long-over`);
    await expect(page.getByRole('heading', { name: 'This class has finished' })).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain('SECRET-LINK');
    expect(html).not.toContain('pw-over');
  });

  test('the family page lists a class only until its grace period ends', async ({ page }) => {
    await setup(page, seed());
    await page.goto(`${BASE}/parent/index.html`);
    await expect(page.locator('.session')).toHaveCount(3);                     // open, early, just-ended (long-over is hidden)
    await expect(page.locator(`a[href*="sess-long-over"]`)).toHaveCount(0);
    await expect(page.locator(`a[href*="sess-just-ended"]`)).toHaveCount(1);
  });

  test('a non-https join link is never offered', async ({ page }) => {
    const s = seed();
    s.t.session_join_details[0].join_url = 'javascript:alert(1)';
    await setup(page, s);
    await page.goto(`${BASE}/class/join.html?session=sess-open`);
    await expect(page.getByRole('link', { name: /Open Zoom/ })).toHaveCount(0);
  });

  test('a parent with no child in the class sees no link', async ({ page }) => {
    await setup(page, seed({ kid: false }));
    await page.goto(`${BASE}/class/join.html?session=sess-open`);
    await expect(page.getByRole('heading', { name: /None of your children/ })).toBeVisible();
    expect(await page.content()).not.toContain('SECRET-LINK');
  });
});

test.describe('password reset', () => {
  test('asking for a reset gives the same answer for any address', async ({ page }) => {
    const errs = await setup(page, seed({ signedIn: false }));
    await page.goto(`${BASE}/parent/login.html`);
    await page.click('#forgot');
    await expect(page.locator('#err')).toContainText('email address');       // needs an address first
    for (const email of ['ama@example.com', 'nobody@example.com']) {
      await page.fill('#email', email);
      await page.click('#forgot');
      await expect(page.locator('#info')).toContainText('If that email has an account');
    }
    expect((await db(page)).auth.resetRequests).toEqual(['ama@example.com', 'nobody@example.com']);
    errs.assertNoErrors();
  });

  test('a valid reset link lets the parent choose a new password', async ({ page }) => {
    await setup(page, seed());                                                // session present = recovery session established
    await page.goto(`${BASE}/parent/reset.html`);
    await page.fill('#pw', 'short');
    await page.click('#go');
    await expect(page.locator('#err')).toContainText('at least 8');
    await page.fill('#pw', 'brand-new-pass');
    await page.fill('#pw2', 'different-pass');
    await page.click('#go');
    await expect(page.locator('#err')).toContainText('don’t match');
    await page.fill('#pw2', 'brand-new-pass');
    await page.click('#go');
    await expect(page.getByRole('heading', { name: 'Password changed' })).toBeVisible();
    expect((await db(page)).auth.users[0].password).toBe('brand-new-pass');
  });

  test('an expired or reused link asks for a fresh one', async ({ page }) => {
    await setup(page, seed({ signedIn: false }));
    await page.goto(`${BASE}/parent/reset.html`);
    await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#form')).toHaveCount(0);
  });
});

test.describe('leader tools', () => {
  function adminSeed() {
    const s = seed();
    s.t.church_members.push(
      { id: 'adm', church_id: 'church1', user_id: 'parent1', role: 'church_admin', status: 'active', display_name: 'Ama', created_at: iso(-900) },
      { id: 'pend1', church_id: 'church1', user_id: 'u-efua', role: 'parent', status: 'pending', display_name: 'Efua', created_at: iso(-30) },
      { id: 'pend2', church_id: 'church1', user_id: 'u-stranger', role: 'parent', status: 'pending', display_name: 'Stranger', created_at: iso(-20) }
    );
    return s;
  }

  test('a parent who is not an admin is turned away', async ({ page }) => {
    await setup(page, seed());
    await page.goto(`${BASE}/church-admin/index.html`);
    await expect(page.getByRole('heading', { name: 'Leaders only' })).toBeVisible();
    await expect(page.locator('#sess-form')).toHaveCount(0);
  });

  test('the family page shows the leader-tools link only to admins', async ({ page }) => {
    await setup(page, adminSeed());
    await page.goto(`${BASE}/parent/index.html`);
    await expect(page.getByRole('link', { name: 'Leader tools' })).toBeVisible();
  });

  test('approve and decline families; give a leader role; vetting unlocks children', async ({ page }) => {
    const errs = await setup(page, adminSeed());
    await page.goto(`${BASE}/church-admin/index.html`);
    await expect(page.getByRole('heading', { name: 'Families waiting for approval' })).toBeVisible();
    await expect(page.getByText('Efua')).toBeVisible();
    await page.locator('[data-approve="pend1"]').click();
    await expect(page.getByText('Family approved')).toBeVisible();
    await page.locator('[data-decline="pend2"]').click();
    await expect(page.getByText('Request declined')).toBeVisible();
    let s = await db(page);
    expect(s.t.church_members.find((m) => m.id === 'pend1').status).toBe('active');
    expect(s.t.church_members.some((m) => m.id === 'pend2')).toBe(false);

    // Efua becomes a leader; she cannot see children until BOTH dates are recorded
    await page.selectOption('#role-who', 'u-efua');
    await page.selectOption('#role-what', 'facilitator');
    await page.click('#role-add');
    await expect(page.getByText('Role added')).toBeVisible();
    const row = page.locator('[data-staff]', { hasText: 'Efua' });
    await expect(row).toContainText('Cannot see children yet');
    await row.locator('[data-f=dbs]').fill('2026-01-15');
    await row.locator('[data-savestaff]').click();
    await expect(page.locator('[data-staff]', { hasText: 'Efua' })).toContainText('Cannot see children yet');   // one date is not enough
    await page.locator('[data-staff]', { hasText: 'Efua' }).locator('[data-f=train]').fill('2026-02-01');
    await page.locator('[data-staff]', { hasText: 'Efua' }).locator('[data-savestaff]').click();
    await expect(page.locator('[data-staff]', { hasText: 'Efua' })).toContainText('Can see children');
    s = await db(page);
    expect(s.t.church_members.find((m) => m.user_id === 'u-efua' && m.role === 'facilitator')).toMatchObject({ dbs_checked_on: '2026-01-15', safeguarding_trained_on: '2026-02-01', status: 'active' });

    // the same role cannot be added twice
    await page.selectOption('#role-who', 'u-efua');
    await page.selectOption('#role-what', 'facilitator');
    await page.click('#role-add');
    await expect(page.locator('#role-err')).toContainText('already have that role');
    errs.assertNoErrors();
  });

  test('schedule a class (link must be https), see it listed, cancel it', async ({ page }) => {
    const errs = await setup(page, adminSeed());
    await page.goto(`${BASE}/church-admin/index.html`);
    await page.selectOption('#s-class', 'class-trb');
    await expect(page.locator('#s-dur')).toHaveValue('42');                    // Trailblazers default to 42 minutes
    await page.click('#s-go');
    await expect(page.locator('#s-err')).toContainText('start time');
    await page.fill('#s-when', '2030-10-03T10:00');
    await page.fill('#s-url', 'http://zoom.example/j/999');
    await page.click('#s-go');
    await expect(page.locator('#s-err')).toContainText('https://');
    await page.fill('#s-url', 'https://zoom.example/j/999?pwd=abc');
    await page.fill('#s-mid', '999 000');
    await page.fill('#s-pw', 'letmein');
    await page.selectOption('#s-lesson', 'lesson-david');
    await page.click('#s-go');
    await expect(page.getByText('Class scheduled')).toBeVisible();

    const s = await db(page);
    const created = s.t.sessions.find((x) => x.class_id === 'class-trb');
    expect(created).toMatchObject({ church_id: 'church1', lesson_id: 'lesson-david', duration_min: 42, platform: 'zoom', status: 'scheduled' });
    expect(s.t.session_join_details.find((d) => d.session_id === created.id)).toMatchObject({ join_url: 'https://zoom.example/j/999?pwd=abc', meeting_id: '999 000', passcode: 'letmein' });

    await page.locator(`[data-cancel="${created.id}"]`).click();
    await expect(page.getByText('Class cancelled')).toBeVisible();
    expect((await db(page)).t.sessions.find((x) => x.id === created.id).status).toBe('cancelled');
    errs.assertNoErrors();
  });
});

// Solve the mystery and page through the story until the first moment card; return its scenario text.
async function toFirstMoment(page) {
  await page.goto(`${BASE}/play/lesson.html?lesson=david-01&child=kid1`);
  // a child who already solved the mystery resumes at the story, so the mystery may not be there
  await page.locator('#stage').waitFor();
  if (await page.locator('.choice', { hasText: 'David' }).count()) {
    await page.locator('.choice', { hasText: 'David' }).click();
    await page.click('#go');
  }
  for (let n = 0; n < 40 && !(await page.locator('.moment-tag').count()); n++) await page.click('#fwd');
  return page.locator('#stage .story').first().innerText();
}

// Walk the flow (mystery, story, quiz) and collect the scenario text of every "Think about it"
// moment in the order a child meets them, stopping after the quiz moment. Nothing is saved that matters here.
async function scenarios(page) {
  await page.goto(`${BASE}/play/lesson.html?lesson=david-01&child=kid1`);
  await page.locator('#stage').waitFor();
  if (await page.locator('.choice', { hasText: 'David' }).count()) { await page.locator('.choice', { hasText: 'David' }).click(); await page.click('#go'); }
  const out = [];
  for (let n = 0; n < 60; n++) {                                                // story
    if (await page.locator('.q-count .moment-tag').count()) out.push(await page.locator('#stage .story').first().innerText());
    const label = await page.locator('#fwd').innerText();
    await page.click('#fwd');
    if (label.includes('finished')) break;
  }
  const qs = await page.evaluate(() => 0);
  while (!(await page.locator('.q-count .moment-tag:not(.belong)').count())) {   // quiz until its moment appears
    await page.locator('#stage .choice').first().click();
    await page.click('#nx');
  }
  out.push(await page.locator('#stage .story').first().innerText());
  return out;
}

test.describe('life application and belonging', () => {
  test('Explorers and Trailblazers get different, age-fitted moments', async ({ page, browser }) => {
    await setup(page, seed());
    const explorer = await toFirstMoment(page);
    expect(explorer).toMatch(/picked last/);
    await expect(page.getByRole('heading', { name: 'Left out at break' })).toBeVisible();

    const s = seed(); s.t.children[0].age_band = 'trailblazer'; s.t.children[0].class_id = 'class-trb';
    const p2 = await (await browser.newContext()).newPage();                    // its own storage, so its own seed
    await setup(p2, s);
    const trailblazer = await toFirstMoment(p2);
    expect(trailblazer).toMatch(/laugh at how her name sounds/);
    await expect(p2.getByRole('heading', { name: /A name that.s hard to say/ })).toBeVisible();
  });

  test("a scenario never uses the child's own name, and the names are stable across visits", async ({ page, browser }) => {
    // The first Trailblazer character is a non-African girl, so a real Sophie must not meet herself in it.
    const s = seed(); s.t.children[0].display_name = 'Sophie'; s.t.children[0].age_band = 'trailblazer'; s.t.children[0].class_id = 'class-trb';
    await setup(page, s);
    const first = await toFirstMoment(page);
    expect(first).not.toContain('Sophie');
    expect(first).toMatch(new RegExp(DAVID.names.girl.other.filter((n) => n !== 'Sophie').join('|')));
    expect(first).not.toMatch(/\{(boy|girl)\d\}/);                             // no unresolved placeholder
    expect(await toFirstMoment(page)).toBe(first);                             // same names next time, not random

    // The same rule for a boy, and for an African name: Explorer boy1 is non-African (Jason may not appear for a Jason)
    const s2 = seed(); s2.t.children[0].display_name = 'Jason';
    const p2 = await (await browser.newContext()).newPage();
    await setup(p2, s2);
    expect(await toFirstMoment(p2)).not.toContain('Jason');

    // Trailblazer Kweku: boy1 is the African slot in the second moment, and must not be Kweku.
    const s3 = seed(); s3.t.children[0].display_name = 'Kweku'; s3.t.children[0].age_band = 'trailblazer'; s3.t.children[0].class_id = 'class-trb';
    const p3 = await (await browser.newContext()).newPage();
    await setup(p3, s3);
    expect((await scenarios(p3)).join(' ')).not.toContain('Kweku');
  });

  test('characters alternate between non-African and African names, starting non-African', async ({ page, browser }) => {
    const origin = (name) => (['boy', 'girl'].flatMap((g) => DAVID.names[g].african).includes(name) ? 'african' : 'other');
    const allNames = ['boy', 'girl'].flatMap((g) => ['african', 'other'].flatMap((o) => DAVID.names[g][o]));
    const namesInOrder = (texts) => {
      const found = [];
      for (const t of texts) for (const m of t.matchAll(new RegExp(`\\b(${allNames.join('|')})\\b`, 'g'))) if (!found.includes(m[1])) found.push(m[1]);
      return found;
    };
    // Explorer: three characters
    await setup(page, seed());
    const ex = namesInOrder(await scenarios(page)).map(origin);
    expect(ex).toEqual(['other', 'african', 'other']);
    // Trailblazer: four characters (a boy appears twice in one chat scenario)
    const s = seed(); s.t.children[0].age_band = 'trailblazer'; s.t.children[0].class_id = 'class-trb';
    const p2 = await (await browser.newContext()).newPage();
    await setup(p2, s);
    const tr = namesInOrder(await scenarios(p2)).map(origin);
    expect(tr).toEqual(['other', 'african', 'other', 'african']);
    for (let i = 1; i < tr.length; i++) expect(tr[i]).not.toBe(tr[i - 1]);       // never two of the same heritage in a row
  });

  test('tapping a choice gives a kind reply and a grown-up prompt, and saves nothing', async ({ page }) => {
    await setup(page, seed());
    await toFirstMoment(page);
    await expect(page.locator('#mresp')).toBeEmpty();
    await page.locator('#stage .choice').first().click();
    await expect(page.locator('#mresp blockquote.quote')).not.toBeEmpty();
    await expect(page.locator('#mresp')).toContainText('Ask a grown-up');
    await expect(page.locator('#stage input, #stage textarea')).toHaveCount(0);      // children never type
    const s = await db(page);
    expect(s.t.progress.map((p) => p.step_key)).toEqual(['mystery']);           // only the mystery was recorded: the moment stored nothing
    // ...and nothing about the moment reached any table that records a child's activity
    expect(JSON.stringify([s.t.progress, s.t.awards, s.t.attendance, s.t.consents])).not.toMatch(/picked last|hard to say|Ask a grown-up|picked/);
  });

  test('every choice in every moment has a reply (nobody is left with a wrong answer)', async () => {
    for (const m of DAVID.apply.moments) {
      expect(m.choices.length).toBeGreaterThanOrEqual(2);
      for (const c of m.choices) expect(c.response.length).toBeGreaterThan(20);
      expect(m.grownUpTalk.length).toBeGreaterThan(10);
    }
  });

  test('the Belong step: 3 cards for Explorers with the exact Bible words, then on to the mission', async ({ page }) => {
    const s = seed();
    s.t.progress = ['mystery', 'story', 'quiz', 'verse'].map((k) => ({ id: k, child_id: 'kid1', lesson_id: 'lesson-david', step_key: k, detail: {} }));
    await setup(page, s);
    await page.goto(`${BASE}/play/lesson.html?lesson=david-01&child=kid1`);        // existing players resume at the new step
    const cards = DAVID.belonging.cards.filter((c) => c.bands.includes('explorer'));
    expect(cards).toHaveLength(3);
    for (let i = 0; i < cards.length; i++) {
      await expect(page.locator('.q-count .moment-tag.belong')).toBeVisible();
      await expect(page.getByRole('heading', { name: cards[i].title })).toBeVisible();
      if (cards[i].quote) await expect(page.locator('blockquote.quote')).toContainText(cards[i].quote.text);
      await page.click('#fwd');
    }
    await expect(page.getByRole('heading', { name: DAVID.postClass.mission.title })).toBeVisible();   // straight on to the mission
    expect((await db(page)).t.progress.map((p) => p.step_key)).toContain('belong');
  });

  test('a Trailblazer gets the extra Belong card (every nation), and there is no Africa-only card', async ({ page }) => {
    const s = seed(); s.t.children[0].age_band = 'trailblazer'; s.t.children[0].class_id = 'class-trb';
    s.t.progress = ['mystery', 'story', 'quiz', 'verse'].map((k) => ({ id: k, child_id: 'kid1', lesson_id: 'lesson-david', step_key: k, detail: {} }));
    await setup(page, s);
    await page.goto(`${BASE}/play/lesson.html?lesson=david-01&child=kid1`);
    const titles = [];
    for (;;) {
      titles.push(await page.locator('#stage h2').innerText());
      const label = await page.locator('#fwd').innerText();
      await page.click('#fwd');
      if (label.includes('mission')) break;
    }
    expect(titles).toEqual(DAVID.belonging.cards.map((c) => c.title));           // all of them, in order
    expect(titles).toHaveLength(4);
    expect(titles).toContain('Every nation, tribe and language');
    expect(titles.join(' ')).not.toMatch(/Africa is in the story/);               // removed: Pastor Eric did not want that framing
  });

  test('an older lesson without moments or belonging still plays, and does not record a Belong step it never showed', async ({ page }) => {
    const s = seed();
    const old = JSON.parse(JSON.stringify(DAVID));
    delete old.apply; delete old.belonging; delete old.names;
    s.t.lessons[0].content = old;
    await setup(page, s);
    await page.goto(`${BASE}/play/lesson.html?lesson=david-01&child=kid1`);
    await page.locator('.choice', { hasText: 'David' }).click(); await page.click('#go');
    for (;;) { const l = await page.locator('#fwd').innerText(); await page.click('#fwd'); if (l.includes('finished')) break; }
    for (let i = 0; i < old.live.quiz.explorer.length; i++) { await page.locator('.choice').first().click(); await page.click('#nx'); }
    await expect(page.locator('.q-count .moment-tag')).toHaveCount(0);        // no moments in the old lesson
    await page.locator('.bank button', { hasText: 'outward' }).click();
    await page.locator('.bank button', { hasText: 'looks' }).click();
    await page.click('#nx');
    await expect(page.getByRole('heading', { name: old.postClass.mission.title })).toBeVisible();   // Belong skipped straight to the mission
    expect((await db(page)).t.progress.map((p) => p.step_key)).not.toContain('belong');
  });

  test('every scripture quote on the Belong cards is the exact text in the lesson file', async () => {
    for (const c of DAVID.belonging.cards.filter((x) => x.quote)) {
      expect(c.quote.ref).toMatch(/\d+:\d+/);
      expect(c.quote.text.length).toBeGreaterThan(15);
    }
  });
});

test.describe('the David adventure', () => {
  test('play all steps as an Explorer: moments, belonging, progress saved, badges earned, map unlocked', async ({ page }) => {
    const errs = await setup(page, seed());
    await page.goto(`${BASE}/play/home.html?child=kid1`);
    await expect(page.getByRole('heading', { name: 'Hi, Kofi!' })).toBeVisible();
    await page.getByRole('link', { name: 'Start the adventure' }).click();

    // 1. mystery: a wrong guess first, then right
    await page.locator('.choice', { hasText: 'Moses' }).click();
    await expect(page.locator('#msg')).toContainText('Not quite');
    await page.locator('.choice', { hasText: 'David' }).click();
    await expect(page.locator('#msg')).toContainText('It was David');
    await expect(page.locator('#toasts')).toContainText('Story Detective');
    await page.click('#go');

    // 2. story
    for (;;) {
      const label = await page.locator('#fwd').innerText();
      await page.click('#fwd');
      if (label.includes('finished')) break;
    }
    // 3. quiz (Explorer has 3 questions), then the "new girl at lunch" moment
    for (let i = 0; i < DAVID.live.quiz.explorer.length; i++) {
      await page.locator('.choice').first().click();
      await page.click('#nx');
    }
    await expect(page.getByRole('heading', { name: 'The new girl at lunch' })).toBeVisible();
    await passMoments(page);
    // 4. memory verse: outward, then looks (a wrong word first)
    await page.locator('.bank button', { hasText: 'looks' }).click();
    await expect(page.locator('#msg')).toContainText('Not that one');
    await page.locator('.bank button', { hasText: 'outward' }).click();
    await page.locator('.bank button', { hasText: 'looks' }).click();
    await expect(page.getByText('You did it! Now say it out loud')).toBeVisible();
    await page.click('#nx');                                                   // saves the verse step, which completes the map-marker requirements
    await expect(page.locator('#toasts')).toContainText('Map Marker');
    await passMoments(page);                                                    // "When could I use this verse?"

    // 5. you belong in this story
    for (;;) {
      const label = await page.locator('#fwd').innerText();
      await page.click('#fwd');
      if (label.includes('mission')) break;
    }

    // 6. mission / reflect, with a grown-up confirming one badge
    await page.locator('.choice').first().click();
    await page.getByRole('button', { name: 'We did the mission' }).click();
    await expect(page.locator('#toasts')).toContainText('Helping Hands');
    await page.click('#nx');
    await expect(page.getByRole('heading', { name: 'You did it!' })).toBeVisible();
    await expect(page.locator('.cardface .who')).toHaveText('David');

    const s = await db(page);
    expect(s.t.progress.map((p) => p.step_key).sort()).toEqual(['belong', 'mystery', 'quiz', 'reflect', 'story', 'verse']);
    expect(s.t.progress.find((p) => p.step_key === 'mystery').detail.solved).toBe(true);
    expect(s.t.awards.map((a) => a.badge_key).sort()).toEqual(['helping-hands', 'map-marker', 'story-detective']);
    // free-text is never collected: reflection is one of the fixed choices
    expect(DAVID.postClass.reflection.choices).toContain(s.t.progress.find((p) => p.step_key === 'reflect').detail.choice);

    await page.getByRole('link', { name: 'Back to my adventures' }).click();
    await expect(page.locator('.stop.open')).toContainText('David');
    await expect(page.locator('.stop.open')).toContainText('Kings');
    await expect(page.locator('.shelf .bdg:not(.locked)')).toHaveCount(3);
    await expect(page.locator('.shelf .bdg.locked')).toHaveCount(BADGES.length - 3);
    await expect(page.getByRole('link', { name: 'Play again' })).toBeVisible();
    errs.assertNoErrors();
  });

  test('a Trailblazer gets the longer story, the verse quotes and four quiz questions', async ({ page }) => {
    const s = seed(); s.t.children[0].age_band = 'trailblazer'; s.t.children[0].class_id = 'class-trb';
    await setup(page, s);
    await page.goto(`${BASE}/play/lesson.html?lesson=david-01&child=kid1`);
    await page.locator('.choice', { hasText: 'David' }).click();
    await page.click('#go');
    let quotes = 0;
    for (;;) {
      if (await page.locator('blockquote.quote').count()) quotes++;
      const label = await page.locator('#fwd').innerText();
      await page.click('#fwd');
      if (label.includes('finished')) break;
    }
    expect(quotes).toBe(3);                                                    // 16:7, 17:37, 17:45
    for (let i = 0; i < DAVID.live.quiz.trailblazer.length; i++) { await page.locator('.choice').first().click(); await page.click('#nx'); }
    await expect(page.getByRole('heading', { name: 'More than a mark' })).toBeVisible();   // the Trailblazer quiz moment
    await passMoments(page);
    await expect(page.locator('.bank button')).toHaveCount(3);                 // 3 gaps for the older band
  });

  test('the class warm-up plays only the mystery, then returns to the family page', async ({ page }) => {
    await setup(page, seed());
    await page.goto(`${BASE}/class/join.html?session=sess-open`);
    await page.getByRole('link', { name: /Kofi’s mystery/ }).click();
    await page.locator('.choice', { hasText: 'David' }).click();
    await page.click('#go');
    await expect(page.getByRole('heading', { name: 'Great warm-up!' })).toBeVisible();
    expect((await db(page)).t.progress.map((p) => p.step_key)).toEqual(['mystery']);
  });

  test('progress resumes at the first unfinished step', async ({ page }) => {
    const s = seed();
    s.t.progress = ['mystery', 'story'].map((k) => ({ id: k, child_id: 'kid1', lesson_id: 'lesson-david', step_key: k, detail: {} }));
    await setup(page, s);
    await page.goto(`${BASE}/play/lesson.html?lesson=david-01&child=kid1`);
    await expect(page.locator('.q-count')).toContainText('Question 1');
  });

  test('practice mode (no account) works and saves nothing', async ({ page }) => {
    const errs = await setup(page, seed({ signedIn: false }));
    await page.goto(`${BASE}/play/lesson.html?lesson=david-01`);
    await expect(page.getByText('Practice mode: nothing is saved.')).toBeVisible();
    await page.locator('.choice', { hasText: 'David' }).click();
    await expect(page.locator('#msg')).toContainText('It was David');
    const s = await db(page);
    expect(s.t.progress).toHaveLength(0);
    expect(s.t.awards).toHaveLength(0);
    errs.assertNoErrors();
  });

  test('an unsafe lesson slug is rejected', async ({ page }) => {
    await setup(page, seed());
    await page.goto(`${BASE}/play/lesson.html?lesson=${encodeURIComponent('../../etc/passwd')}&child=kid1`);
    await expect(page.getByRole('heading', { name: 'Which adventure?' })).toBeVisible();
  });
});
