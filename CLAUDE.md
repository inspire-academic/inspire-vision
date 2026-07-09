# CLAUDE.md — Inspire Vision Platform Context

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
No CLAUDE.md existed in this repo before this file. It was created
2026-07-09 during the Phase 4 Mentorship module build, scoped to what's
actually known and built so far — not a full governance document like
inspire-academic's CLAUDE.md. Extend it as more of the platform is
built out, rather than treating this as complete.
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
| Mentorship & Formation™ | **This build** — `mentorship/` module, live folder structure as of 2026-07-09 |
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

## TARGET FILE STRUCTURE — Mentorship module

Built 2026-07-09. Everything below exists; pages marked "stub" render
the generic coming-soon template (see `mentorship/css/mentorship.css`'s
sibling stub pages) rather than real content.

```
mentorship/
├── index.html              ← public landing (stub)
├── join.html                ← become a mentee (stub)
├── mentors.html              ← become a mentor (stub)
├── parents.html               ← parent/guardian info (stub)
├── journey.html                ← mentee journey (stub)
├── philosophy.html              ← why mentorship matters (stub)
├── stories.html                  ← testimonies (stub)
├── resources.html                 ← public resources (stub)
│
├── onboarding/
│   ├── welcome.html         ← stub
│   ├── know-me.html          ← stub
│   ├── strengths.html         ← stub
│   ├── life-wheel.html         ← stub
│   └── goals.html               ← stub
│
├── dashboard/
│   ├── index.html            ← THE MAIN DASHBOARD — real, built, wired
│   ├── goals.html              ← stub
│   ├── check-in.html            ← stub
│   ├── journal.html              ← stub
│   ├── mentor.html                ← stub
│   ├── prayer-support.html         ← stub
│   └── growth-compass.html          ← stub
│
├── mentor-portal/
│   ├── index.html            ← stub
│   ├── mentees.html            ← stub
│   ├── session-notes.html       ← stub
│   └── resources.html             ← stub
│
├── admin/
│   ├── index.html            ← stub
│   ├── mentees.html            ← stub
│   ├── mentors.html              ← stub
│   ├── matching.html               ← stub
│   ├── safeguarding.html            ← stub
│   └── reports.html                  ← stub
│
└── css/
    └── mentorship.css       ← module styles; see design-system conflict note above
```

Image assets live at root level (not under `mentorship/`), per the
same pattern the rest of this repo uses:

```
assets/images/mentorship/
├── hero/          ← hero banners (empty, .gitkeep — no real photography yet)
├── portraits/      ← mentor photos (empty, .gitkeep)
├── sections/        ← section images (empty, .gitkeep)
└── icons/             ← module icons (empty, .gitkeep)
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
  `vision.registrations`, `vision.partners`. **No `mentorship.*` tables
  exist yet** — the dashboard's goals/sessions/tasks data is still
  hardcoded with `TODO Phase 4` comments marking where real queries go.
- No `manifest.json` exists yet — the dashboard links to `/manifest.json`
  per the Academic repo's PWA pattern, but the file itself still needs
  creating.

## BRANCHING

Same as inspire-academic: `staging` → preview, `main` → production
(`inspirevision.org`). Land everything on `staging` first.
