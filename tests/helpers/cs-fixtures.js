// Shared setup for the Children's Service Playwright specs: an in-memory database seed, the
// interception that swaps the Supabase SDK for tests/helpers/fake-supabase.mjs, and a few
// helpers. The page code under test is unchanged; only the network edge is faked.
const { expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { trackConsoleErrors } = require('../helpers');

const BASE = '/faith/children-service';
const FAKE = fs.readFileSync(path.join(__dirname, 'fake-supabase.mjs'), 'utf8');
const DAVID = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'faith', 'children-service', 'content', 'lessons', 'david-01.json'), 'utf8'));
const SECRET = 'https://zoom.example/j/SECRET-LINK-123';

const iso = (minFromNow) => new Date(Date.now() + minFromNow * 60000).toISOString();
const BADGES = [
  ['camp-fire-friend', 'Camp Fire Friend', 'system'], ['catch-up-champion', 'Catch-Up Champion', 'system'],
  ['story-detective', 'Story Detective', 'system'], ['map-marker', 'Map Marker', 'system'],
  ['verse-keeper', 'Verse Keeper', 'leader'], ['brave-like-david', 'Brave Like David', 'leader'],
  ['helping-hands', 'Helping Hands', 'parent'], ['table-talkers', 'Table Talkers', 'parent']
].map(([key, title, awarded_by]) => ({ key, title, description: title + ' description', awarded_by }));

function seed({ signedIn = true, member = 'active', consent = true, kid = true } = {}) {
  const user = { id: 'parent1', email: 'ama@example.com', password: 'password1', user_metadata: { full_name: 'Ama' } };
  return {
    auth: { users: [user], session: signedIn ? { access_token: 'tok-test', user: { id: user.id, email: user.email, user_metadata: user.user_metadata } } : null },
    t: {
      churches: [{ id: 'church1', slug: 'inspire', name: 'Inspire (our own church)', open_enrolment: true }],
      classes: [
        { id: 'class-exp', church_id: 'church1', name: 'Explorers', age_band: 'explorer', active: true },
        { id: 'class-trb', church_id: 'church1', name: 'Trailblazers', age_band: 'trailblazer', active: true }
      ],
      church_members: member ? [{ id: 'm1', church_id: 'church1', user_id: 'parent1', role: 'parent', status: member }] : [],
      consents: consent ? ['data_processing', 'safeguarding_policy'].map((type) => ({ id: type, parent_id: 'parent1', child_id: null, type, given: true, created_at: iso(-1000) })) : [],
      children: [
        ...(kid ? [{ id: 'kid1', church_id: 'church1', parent_id: 'parent1', display_name: 'Kofi', age_band: 'explorer', avatar: { skin: 2, hair: 1 }, class_id: 'class-exp', created_at: iso(-500) }] : []),
        { id: 'kid-other', church_id: 'church1', parent_id: 'parent2', display_name: 'Esi', age_band: 'explorer', avatar: {}, class_id: 'class-exp', created_at: iso(-400) }
      ],
      lessons: [{ id: 'lesson-david', slug: 'david-01', status: 'published', character_name: 'David', sequence: 1, content: DAVID }],
      badges: BADGES,
      sessions: [
        { id: 'sess-open', church_id: 'church1', class_id: 'class-exp', lesson_id: 'lesson-david', starts_at: iso(10), duration_min: 28, status: 'scheduled', platform: 'zoom' },
        { id: 'sess-early', church_id: 'church1', class_id: 'class-exp', lesson_id: 'lesson-david', starts_at: iso(300), duration_min: 28, status: 'scheduled', platform: 'zoom' },
        // scheduled end was 5 minutes ago (inside the 10-minute grace) / 22 minutes ago (outside it)
        { id: 'sess-just-ended', church_id: 'church1', class_id: 'class-exp', lesson_id: 'lesson-david', starts_at: iso(-33), duration_min: 28, status: 'scheduled', platform: 'zoom' },
        { id: 'sess-long-over', church_id: 'church1', class_id: 'class-exp', lesson_id: 'lesson-david', starts_at: iso(-50), duration_min: 28, status: 'scheduled', platform: 'zoom' }
      ],
      session_join_details: [
        { session_id: 'sess-open', join_url: SECRET, meeting_id: '111 222 333', passcode: 'pw-open' },
        { session_id: 'sess-early', join_url: SECRET + '-EARLY', meeting_id: '444', passcode: 'pw-early' },
        { session_id: 'sess-just-ended', join_url: SECRET + '-JUSTENDED', meeting_id: '555', passcode: 'pw-just' },
        { session_id: 'sess-long-over', join_url: SECRET + '-OVER', meeting_id: '666', passcode: 'pw-over' }
      ],
      attendance: [], progress: [], awards: []
    }
  };
}

async function setup(page, s) {
  const errs = await trackConsoleErrors(page);
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm', (r) =>
    r.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: FAKE }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('https://fonts.gstatic.com/**', (r) => r.fulfill({ status: 200, body: '' }));
  await page.addInitScript((data) => { if (!localStorage.getItem('fakedb')) localStorage.setItem('fakedb', JSON.stringify(data)); }, s);
  return errs;
}
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('fakedb')));

// Click through any "Think about it" moment cards that follow the quiz / verse steps,
// tapping a choice on each (which must reveal a reply) before carrying on.
async function passMoments(page) {
  while (await page.locator('.q-count .moment-tag:not(.belong)').count()) {
    await page.locator('#stage .choice').first().click();
    await expect(page.locator('#mresp')).not.toBeEmpty();
    await page.click('#nx');
  }
}

module.exports = { BASE, FAKE, DAVID, SECRET, iso, BADGES, seed, setup, db, passMoments };
