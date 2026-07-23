// Every private page in the module (student dashboard, mentor-portal, admin
// tools) is gated by a client-side check that redirects an unauthenticated
// visitor to login.html. This is the actual security boundary for the admin
// pages specifically (server-side ADMIN_EMAILS is the real gate — see
// netlify/functions/_lib/adminAuth.js — but a broken client-side redirect
// would mean an unauthenticated visitor briefly sees the page shell before
// any data loads). Regression target: a future edit accidentally removing
// or short-circuiting one of these checks.
const { test, expect } = require('@playwright/test');

const privatePages = [
  '/mentorship/dashboard/',
  '/mentorship/dashboard/goals.html',
  '/mentorship/dashboard/check-in.html',
  '/mentorship/dashboard/journal.html',
  '/mentorship/dashboard/mentor.html',
  '/mentorship/dashboard/growth-compass.html',
  '/mentorship/dashboard/prayer-support.html',
  '/mentorship/journey.html',
  '/mentorship/resources.html',
  '/mentorship/stories.html',
  '/mentorship/mentor-portal/',
  '/mentorship/mentor-portal/mentees.html',
  '/mentorship/mentor-portal/sessions.html',
  '/mentorship/mentor-portal/session-notes.html',
  '/mentorship/mentor-portal/resources.html',
  '/mentorship/admin/',
  '/mentorship/admin/mentors.html',
  '/mentorship/admin/matching.html',
  '/mentorship/admin/mentees.html',
  '/mentorship/admin/safeguarding.html',
  '/mentorship/admin/reports.html',
];

test.describe('Unauthenticated visitors are redirected to login', () => {
  for (const path of privatePages) {
    test(`${path} redirects to login.html`, async ({ page }) => {
      await page.goto(path);
      // The redirect depends on a real network round-trip to Supabase's
      // auth endpoint (getUser()/getSession()) before the page decides
      // there's no session — not a cached/local check — so this needs
      // real margin, especially with several tests hitting the same
      // endpoint in parallel. 15s observed comfortable in practice;
      // 5s produced intermittent false failures during development.
      await page.waitForURL('**/mentorship/login.html', { timeout: 15000 });
      expect(page.url()).toContain('/mentorship/login.html');
    });
  }
});
