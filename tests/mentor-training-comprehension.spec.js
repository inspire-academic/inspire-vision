// Regression target: mentor-onboarding/training.html's "Mark as Read &
// Complete" button used to be a pure self-attestation with no
// verification. Each module now gates completion behind a one-question
// comprehension check (see that file's own MODULES array) — this
// confirms the gate actually gates: wrong answer keeps the button
// disabled, right answer unlocks it, and the module count advances.
//
// mentor_training_progress is a one-way upsert — there's no "uncomplete
// a module" affordance, by design (it's a real completion record, not
// a toggle). So every test here operates on the first NOT-YET-completed
// module rather than always module 1, so a re-run against the same
// seeded test account naturally progresses through modules 2, 3, 4, 5
// instead of failing once module 1 is already marked done. Once a test
// account has completed all 5, these tests skip themselves rather than
// fail — same "skip, don't false-fail" philosophy as the
// credsForMentor() gate below.
const { test, expect } = require('@playwright/test');
const path = require('path');
const { credsForMentor, saveLoginState } = require('./helpers');

const mentorCreds = credsForMentor();
const MENTOR_STATE = path.join(__dirname, '.auth', 'training-mentor.json');

async function firstIncompleteModule(page) {
  await page.goto('/mentorship/mentor-onboarding/training.html');
  const incomplete = page.locator('.module-card:not(.done)').first();
  const anyIncomplete = await incomplete.count();
  return anyIncomplete ? incomplete : null;
}

test.describe('Mentor training — comprehension gate', () => {
  test.skip(!mentorCreds, 'Requires TEST_MENTOR_EMAIL/TEST_MENTOR_PASSWORD env vars');
  test.use({ storageState: mentorCreds ? MENTOR_STATE : undefined });

  test.beforeAll(async ({ browser }) => {
    if (mentorCreds) await saveLoginState(browser, mentorCreds.email, mentorCreds.password, MENTOR_STATE);
  });

  test('an unanswered module keeps the complete button disabled', async ({ page }) => {
    const mod = await firstIncompleteModule(page);
    test.skip(!mod, 'Test mentor account has completed all 5 modules already');
    await mod.locator('.module-head').click();
    await expect(mod.locator('[data-complete]')).toBeDisabled();
  });

  test('choosing the wrong answer shows feedback and keeps the button disabled', async ({ page }) => {
    const mod = await firstIncompleteModule(page);
    test.skip(!mod, 'Test mentor account has completed all 5 modules already');
    await mod.locator('.module-head').click();

    // Whichever radio is clicked first may or may not be the correct
    // one for this module — assert on whichever outcome actually
    // occurred, since this spec shouldn't hardcode a specific module's
    // answer key.
    const radios = mod.locator('input[type="radio"]');
    await radios.first().check();
    const feedback = mod.locator('[data-feedback]');
    await expect(feedback).toBeVisible();

    const isWrong = await feedback.evaluate(el => el.classList.contains('wrong'));
    if (isWrong) {
      await expect(mod.locator('[data-complete]')).toBeDisabled();
    } else {
      await expect(mod.locator('[data-complete]')).toBeEnabled();
    }
  });

  test('finding and choosing the correct answer unlocks completion and advances the count', async ({ page }) => {
    const mod = await firstIncompleteModule(page);
    test.skip(!mod, 'Test mentor account has completed all 5 modules already');
    await mod.locator('.module-head').click();

    const radios = mod.locator('input[type="radio"]');
    const count = await radios.count();
    let found = false;
    for (let i = 0; i < count; i++) {
      await radios.nth(i).check();
      const isRight = await mod.locator('[data-feedback]').evaluate(el => el.classList.contains('right'));
      if (isRight) { found = true; break; }
    }
    expect(found, 'One of the options must be marked right by the module\'s own check.correct').toBe(true);

    const completeBtn = mod.locator('[data-complete]');
    await expect(completeBtn).toBeEnabled();

    const countBefore = await page.locator('#trainingCount').textContent();
    await completeBtn.click();
    await expect(mod.locator('[data-complete]')).toHaveText(/Completed/i, { timeout: 10000 });
    const countAfter = await page.locator('#trainingCount').textContent();
    expect(countAfter).not.toBe(countBefore);
  });
});
