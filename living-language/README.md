# The Living Language Project — Krobo First

Module README. For the founding concept, policy and tone authority, see the
handoff pack (`Krobo_Living_Language_CC_Handoff_Pack`, not part of this
repo) — this file only documents what was actually built and how it fits
into the Inspire Vision codebase.

## What this is

A new, fifth Inspire Vision initiative (not one of the four cardinals —
see the root `CLAUDE.md`), built as a self-contained module at
`/living-language/`. First implementation targets Krobo, within the wider
Dangme language tradition, centred on the Somanya ↔ Odumase-Krobo
corridor.

## Routes

Flat-file structure, matching `mentorship/`'s top-level pattern:

```
living-language/
├── index.html          Landing page
├── 100-voices.html     100 Voices of Krobo — speaker gallery
├── family-voices.html    Family Voices — private archive concept
├── preserve.html           Preserve a Voice — 12-step intake wizard
├── about.html                 Cultural Covenant, hierarchy of authority
├── get-involved.html            Join the movement
├── admin/index.html               Internal corpus/review prototype (noindex'd)
├── learn/
│   ├── index.html                   Learn Klo dashboard — mode toggle, level progress, 9 lesson cards
│   ├── lesson.html                    Generic lesson player, reads a hash slug (#alphabet, #things-in-my-home, ...)
│   └── CONTENT-GAP-REPORT.md            What the human team still needs to supply, lesson by lesson
├── css/living-language.css          Module design system (incl. Learn Klo components)
└── js/
    ├── data.js                      Archive schema + seed/demo content (Speaker/Recording/LanguageEntry/...)
    ├── learn-data.js                 Learn Klo schema + seed content (AlphabetItem/VocabularyItem/Lesson)
    ├── learn-engine.js                Reusable lesson engine — one player, five lesson types
    └── store.js                        Mock persistence (Preserve submissions, learner mode, lesson progress)
```

`living-language/learn.html` (the original single sample lesson) was
retired in favour of the full Learn Klo section below — a
`netlify.toml` redirect sends the old URL to `learn/index.html`.

Linked from the main site nav (`index.html`) and footer as "Living
Language" / "The Living Language Project" — deliberately not folded into
the "Our Pillars" cardinal dropdown, since this isn't a cardinal.

## Design system

Own visual identity in `css/living-language.css` — deep heritage green,
warm gold, parchment/cream, restrained terracotta — same pattern
`faith/css/faith.css` uses relative to the rest of the site (see that
file's header comment). Shares the main site's Fraunces + Plus Jakarta
Sans type pairing to stay recognisably Inspire Vision, but every colour
token is its own (`--ll-*`), not read from `/assets/css/tokens.css`.

Photographic assets: the 9 approved handoff-pack images, resized and
compressed (JPEG, ~85% quality) into `/assets/images/living-language/`
— originals were 2–2.8MB PNGs; shipped versions are all under ~520KB.

## Content model

Defined in `js/data.js`, matching the founding architecture brief's
schema: `Speaker`, `Recording`, `LanguageEntry`, `Story`, `Lesson`,
`FamilyArchive`. Kept as plain JS objects with JSDoc typedefs (no build
step in this repo), deliberately separated from page markup so a real
backend can replace the seed arrays later without touching any page.

**Verification states:** `VERIFIED`, `VALID_COMMUNITY_VARIANT`,
`HISTORICAL_OR_SPECIALIST`, `PENDING_REVIEW`, `REJECTED`. Nothing reaches
`VERIFIED` without a human decision — the admin prototype's Review Queue
buttons are that decision, never automatic.

**Access levels:** `PUBLIC`, `COMMUNITY`, `FAMILY_ONLY`,
`RESEARCH_WITH_PERMISSION`, `ARCHIVE_ONLY`.

## Permission model

Four independent booleans per the brief — never one vague consent
checkbox: `technology_training_permitted`, `synthetic_voice_permitted`,
`commercial_reuse_permitted`, `research_reuse_permitted`. The Preserve a
Voice flow (`preserve.html`) presents synthetic-voice permission as its
own step, separate from the other three, and off by default — see
non-negotiable #6 in the project README/CLAUDE.md.

## Language-verification discipline (important)

Only one Krobo sentence is used anywhere in this build:
`Wɔ tsuo wa ngɛ saminya ngɛ Mawu biɛm.` — explicitly supplied and
confirmed at project founding. Its English meaning is deliberately **not**
stated anywhere in this codebase; every place it appears says the meaning
is withheld pending Krobo Language and Culture Council review.

**Earlier build mistake, corrected:** an early version of `learn.html`
and `js/data.js` used an invented phrase ("Medan wo akye" / "I welcome
you") as lesson content, marked "pending verification." That was wrong —
a pending badge on fabricated word-for-word Krobo still presents
invented content as if it were an unverified recording, which violates
"do not invent translations." It was replaced: the sample lesson now
builds three honest exercises entirely from the one real supplied
sentence (listen; spot which of ɔ/ŋ/ʒ actually appears in the text;
reorder the real 8 words) — no invented vocabulary, no guessed meaning.
If you extend the corpus, hold this same line: real supplied/verified
text only, or an unmistakable structural placeholder — never a
plausible-sounding invented phrase, pending badge or not.

## Learn Klo (added as the project's next stage, per the Krobo Learn handoff brief)

A full lesson system living at `living-language/learn/`, distinct from
(and superseding) the original single sample lesson. One generic player
(`lesson.html`) drives five reusable lesson types — `alphabet`,
`see_and_say`, `listen_and_find`, `conversation`, `verified_phrase` —
against content defined in `js/learn-data.js`, per the brief's own
instruction to build "a small number of excellent reusable lesson
types" rather than one-off pages per lesson.

**Content honesty, stricter here than anywhere else in the module:** the
Learn Klo handoff brief's own planning notes floated two Krobo words
("Chimi" for calabash, "Kopo" for cup) and explicitly said not to
publish them as fact. Given the mistake already made and corrected once
on this project (see "Language-verification discipline" above), none of
that is in `learn-data.js` — not even as a marked-draft form. The 44
seeded vocabulary items carry an English concept and nothing else;
`kloWrittenForm`, `audioNatural`, and every other Krobo-content field
stay empty until a real collection pass happens. Where a lesson can't
show real content, it shows an honest **"being prepared"** state (see
`learn-engine.js`'s `audioButtonHtml` and `renderPreparedShell`) — never
synthetic speech, never an invented-but-plausible word.

**What's genuinely real vs. a wired shell**, per lesson:

| Lesson | Status |
|---|---|
| The Founding Phrase | Fully real — migrated from the original sample lesson, only verified content |
| Meet the Krobo Alphabet | Real, interactive letter grid using the brief's supplied letter shapes; names/sounds/audio honestly "being prepared" |
| Things in My Home / My Family / Food / Numbers & Colours / Greetings | Real, working See & Say engine; every item shows "Krobo written form not yet available" since none is collected yet |
| Listen & Find / My First Krobo Conversation | Real, fully wired UI in preview mode — blocked entirely on native audio, disclosed as such |

Learner mode (Young/Adult) and per-lesson progress (started/completed,
items seen) persist via `LivingLanguageStore` (localStorage), extending
the same mock-persistence pattern as Preserve a Voice submissions — see
`js/store.js`.

A reusable local-only **practice recording widget** (mic permission
requested only on click, playback, re-record, never uploaded) is wired
into the Alphabet lesson, per the brief's §41 privacy requirements.

See `living-language/learn/CONTENT-GAP-REPORT.md` for the exact,
field-by-field checklist of what the human team needs to collect before
each lesson can go from "wired" to "live."

**Known test-environment note:** the step-transition animations (e.g.
"correct answer → advance after 700ms") use `setTimeout`, which some
browsers throttle heavily on backgrounded/hidden tabs — this showed up
during automated testing in this session (confirmed via
`document.visibilityState`/`hasFocus()`, reproduced even on a fresh
tab) and is not a code defect; a normal foregrounded browser tab is
unaffected.

## Backend / persistence

No new Supabase schema was created for this MVP. The repo already runs a
live Supabase project for other modules (`mentorship.*`, `vision.*` — see
root `CLAUDE.md`), but standing up `living_language.*` tables + RLS is a
bigger, higher-blast-radius step than a first vertical slice needs.

Instead, `js/store.js` implements a small mock persistence service layer:
`Preserve a Voice` submissions are written to `localStorage` behind the
same call shape a real backend insert would use
(`LivingLanguageStore.submit(...)`). The admin Review Queue reads from
the same store, so the full submit → review → verify/reject loop is
real and interactive — it just isn't durable across browsers/devices yet.
Swapping this for a real Supabase table is a contained change (one file).

The "Join the Movement" form on `get-involved.html` is a static
placeholder — it doesn't submit anywhere yet.

## What's genuinely working vs. placeholder

| Surface | Status |
|---|---|
| Landing page, all sections | Real, responsive, matches approved reference |
| 100 Voices gallery | Real, filterable, permissions-aware (family-only speaker renders locked) |
| Learn Klo dashboard + engine | Real — mode toggle, progress, 9 lessons; see the per-lesson table above for content status |
| Family Voices | Real concept page, demo data only (as specified) |
| Preserve a Voice | Real 12-step wizard, writes to local mock store |
| Admin/corpus prototype | Real read views + a real, working review-queue action loop |
| Recording/audio capture | Placeholder only — no media pipeline yet |
| Join the Movement form | Placeholder — does not submit anywhere |
| Homepage nav/footer links | Real |

## Open verification items / next steps

- English meaning of the founding phrase — awaiting Language Council sign-off before any public copy states it.
- Real audio recording/upload pipeline (Preserve a Voice step 4 is currently a described placeholder).
- Admin auth gate — `admin/index.html` is `noindex`'d and unlinked, but has no server-side session check yet (unlike mentorship's `requireAdmin()`-gated functions). Needed before this goes beyond a local demo.
- Real Supabase schema for `living_language.*`, once the vertical slice is validated — swap `js/store.js`'s `localStorage` calls for real inserts.
- "Join the Movement" form needs a real destination (e.g. `vision.subscribers` or a dedicated table).
- 100-Voices gallery, Learn pathway and corpus admin should all grow from real reviewed 100 Voices recordings as those come in — nothing here should be treated as a template for inventing more Krobo content.
- Learn Klo content collection — see `living-language/learn/CONTENT-GAP-REPORT.md` for the full checklist. Highest-leverage first pass: alphabet letter names/sounds, then Greetings (smallest vocabulary set), then Home and Family.
- Learn Klo's admin/editing workflow — vocabulary and alphabet content currently lives in `js/learn-data.js` as code, not an editable table. The brief calls for eventual non-technical editing (§33); that should ride along with the real Supabase migration above, alongside the existing archive admin.
