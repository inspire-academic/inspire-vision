# CLAUDE.md — Inspire Vision Platform Context

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
No CLAUDE.md existed in this repo before this file. It was created
2026-07-09 during the Phase 4 Mentorship module build, scoped to what's
actually known and built so far — not a full governance document like
inspire-academic's CLAUDE.md. Extend it as more of the platform is
built out, rather than treating this as complete.

Refreshed 2026-07-25: the Mentorship module went from mostly stub pages
to fully built out between 2026-07-09 and 2026-07-23 (see git log). The
file structure and status notes below now reflect that. For the
detailed, finding-by-finding assessment of what's real vs. what still
has gaps, see `docs/mentorship/FOUNDER-E2E-ROUND-TRIP-REPORT.md` — this
file only tracks the high-level shape of the repo.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## THIS REPOSITORY

**Repo:** inspire-vision (github.com/inspire-academic/inspire-vision)
**Local path:** C:\Deploy_Inspire_Vision
**Deployed via:** Netlify — `main` = production, `staging` = preview
**Sibling repo:** inspire-academic (C:\Deploy_Inspire_Academic) — the
Academic cardinal's own repo. Shares the same Supabase project
(`ygtsrdwoikqnrbexjrtl`) but each repo owns its own schema namespace
(Academic uses `public.*`, Vision uses `vision.*`, `mentorship.*`, etc.).

## THE FOUR CARDINALS

This site (inspirevision.org) hosts three of the four Inspire Vision
cardinals as in-repo modules (Academic has graduated to its own
domain/repo, inspireacademic.org):

| Cardinal | Status here |
|---|---|
| Inspire Academic™ | Own repo/domain — `academic.html` here just links out |
| Mentorship & Formation™ | **This build** — `mentorship/` module, fully built out as of 2026-07-25 (no stub pages remain — public site, onboarding, student dashboard, mentor-portal, and admin are all real and wired to live Supabase). See `docs/mentorship/FOUNDER-E2E-ROUND-TRIP-REPORT.md` for known gaps and open decisions. |
| Health & Wellbeing™ | Not yet built — homepage links to `coming-soon.html` |
| Faith & Spiritual Formation™ | Partially built — `pages/inspire-faith.html`, `admin/faith-admin.html` exist; homepage nav/footer still link to `coming-soon.html` |

## DESIGN-SYSTEM COLOUR — resolved 2026-07-09

`assets/css/tokens.css` is this platform's single source of truth for
colour tokens and assigns Mentorship its cardinal colour:
`--clr-mentorship: #B85C1A` (terracotta/ochre), with
`--clr-mentorship-mid: #D97706` as the bright/active variant.

The Mentorship dashboard (`mentorship/dashboard/index.html`) was
originally supplied with its own internal navy/gold palette
(`#0d1b2a` / `#c9a84c`) — matching Academic's site-wide brand, not
Vision's per-cardinal colour assignment. **Eric's call: use the
canonical tokens.css scheme, not the dashboard's original colours.**
The dashboard's own `:root` block now extends `var(--clr-mentorship)` /
`var(--clr-navy)` etc. directly (with literal-value fallbacks in case
tokens.css fails to load), and `mentorship/css/mentorship.css`'s
`--mentorship-gold` / `--mentorship-navy` / `--mentorship-accent`
aliases do the same. All 29 stub pages' inline colours were updated to
match. If you're building new Mentorship UI, use `var(--clr-mentorship)`
(or the `--mentorship-*` aliases) — don't reintroduce the old gold.

## CURRENT FILE STRUCTURE — Mentorship module

As of 2026-07-25, every page below is real and wired to live Supabase —
none of them are the generic coming-soon stub template anymore. (The
"stub" annotations below are gone deliberately; if you're looking for
a snapshot of what was still a stub and when, `git log` on the
individual file or the Founder E2E report's superseded "Journey
Coverage" tables have that history.)

```
mentorship/
├── index.html              ← public landing
├── login.html                ← shared sign-in, redirectForRole() branches on role/status
├── join.html                   ← mentee signup (auth.signUp)
├── mentors.html                  ← mentor application (mentor_status: pending_review)
├── parents.html                    ← parent/guardian info
├── journey.html                      ← mentee journey (auth-gated — see open decisions)
├── philosophy.html                     ← why mentorship matters
├── stories.html                          ← testimonies (auth-gated — see open decisions)
├── resources.html                          ← public resources (auth-gated — see open decisions)
│
├── onboarding/
│   ├── welcome.html
│   ├── know-me.html
│   ├── strengths.html
│   ├── life-wheel.html
│   └── goals.html          ← last step, real insert into mentorship.goals
│
├── dashboard/
│   ├── index.html            ← THE MAIN DASHBOARD
│   ├── goals.html
│   ├── check-in.html
│   ├── journal.html
│   ├── mentor.html
│   ├── prayer-support.html
│   └── growth-compass.html
│
├── mentor-portal/
│   ├── index.html
│   ├── mentees.html
│   ├── mentee-detail.html   ← mentor-side view into a mentee's progress (the round-trip)
│   ├── sessions.html          ← create/edit mentorship.sessions rows
│   ├── session-notes.html       ← re-verifies the assignment exists before allowing a note
│   └── resources.html
│
├── admin/
│   ├── index.html
│   ├── mentees.html
│   ├── mentors.html            ← approval queue, requireAdmin() server-gated
│   ├── matching.html             ← assign/end pairings, sources approval from mentor_applications
│   ├── safeguarding.html           ← in-app queue for help_requests
│   └── reports.html
│
└── css/
    └── mentorship.css       ← module + dashboard-shell styles (incl. light/dark theme)
```

Supabase schema lives in `supabase/mentorship_schema*.sql` (v1 through
v5 — v4 added the mentor↔student round trip, v5 added the
`mentor_applications` table as the non-spoofable source of truth for
mentor approval status). Netlify Functions in `netlify/functions/`:
`admin-mentors.js`, `admin-matching.js`, `admin-reports.js`,
`admin-help-requests.js`, `notify-help-request.js` — all but
`notify-help-request.js` are `requireAdmin()`-gated.

Image assets live at root level (not under `mentorship/`), per the
same pattern the rest of this repo uses:

```
assets/images/mentorship/
├── hero/          ← hero banners (empty, .gitkeep — no real photography yet)
├── portraits/      ← mentor photos (empty, .gitkeep)
├── sections/        ← section images (empty, .gitkeep)
└── icons/             ← icon.svg (brand mark, added 2026-07-25 for manifest.json)
```

## SHARED INFRASTRUCTURE (pre-existing, not part of this build)

- `assets/css/tokens.css` — design tokens, single source of truth (see conflict note above)
- `assets/styles.css` — legacy-name → token-name compatibility bridge. There is
  no `assets/css/global.css` yet — new pages should link `tokens.css` +
  `styles.css` until one exists.
- `assets/supabase.js` — shared Supabase client. Loads the client async onto
  `window.inspireDB`; use `await getDB()` to get it, not a synchronous
  `createClient()` call (different pattern from inspire-academic's
  `assets/js/supabase.js`, which is synchronous — don't mix the two up
  if you're used to the Academic repo's convention).
- `assets/nav.js` — shared marketing-site nav renderer (used by public pages
  like `index.html`; the dashboard has its own separate sidebar, not this).
- `supabase/vision_schema.sql` — defines `vision.subscribers`,
  `vision.registrations`, `vision.partners`. `mentorship.*` is a
  separate, now fully-populated schema (`supabase/mentorship_schema*.sql`,
  v1-v5) — 8 RLS-enabled tables, all live-wired, no hardcoded/TODO data
  left in the module.
- `manifest.json` exists at repo root (added 2026-07-25), referencing
  `assets/images/mentorship/icons/icon.svg` as a scalable brand-mark
  icon — no raster PNG icon set exists yet (unlike inspire-academic's
  `/icons/icon-192.png` + `icon-512.png` pattern), so add one if a
  raster fallback is ever needed for a platform that doesn't support
  SVG manifest icons.

## BRANCHING

Same as inspire-academic: `staging` → preview, `main` → production
(`inspirevision.org`). Land everything on `staging` first.
