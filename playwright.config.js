// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// Serves the static site (index.html, mentorship/*, etc.) exactly as Netlify
// would, minus the serverless functions — every test here is read-only and
// none of them need a function to invoke, so a plain static server is
// sufficient. assets/supabase.js still points at the real Supabase project
// either way (it's a hardcoded anon key, same as production), so auth/RLS
// behavior is real even though the server is local.
module.exports = defineConfig({
  testDir: './tests',
  // Every page here loads assets/supabase.js, which dynamically imports the
  // Supabase SDK from a CDN (jsdelivr) at runtime — there's no local/mocked
  // backend, by design (see the comment above). Running this suite at any
  // meaningful parallelism (tried both the Playwright default and an
  // explicit worker cap) causes enough simultaneous CDN fetches + real
  // auth-endpoint calls that some redirects intermittently exceed even a
  // 15s timeout. Fully serial isn't a compromise here — confirmed at
  // 21/21 passing in ~16s — so there's no real reason to parallelize.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx serve -c tests/serve.json -l 4173 .',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
