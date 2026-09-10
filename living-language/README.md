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
├── community/
│   ├── index.html                    Community Voices hub — links to the four category pages below
│   ├── muo-ni.html                     Muo ni — funny sayings & wit
│   ├── proverbs.html                     Abɛ — proverbs (spelling pending Council confirmation)
│   ├── folk-songs.html                     Folk Songs, Dirges & Chants (English label + naming callout)
│   └── folk-tales.html                       Folk Tales (English label + naming callout)
├── learn/
│   ├── index.html                   Learn Klo dashboard — mode toggle, level progress, 9 lesson cards
│   ├── lesson.html                    Generic lesson player, reads a hash slug (#alphabet, #things-in-my-home, ...)
│   └── CONTENT-GAP-REPORT.md            What the human team still needs to supply, lesson by lesson
├── css/living-language.css          Module design system (incl. Learn Klo components)
└── js/
    ├── data.js                      Archive schema + seed/demo content (Speaker/Recording/LanguageEntry/...)
    ├── learn-data.js                 Learn Klo schema + seed content (AlphabetItem/VocabularyItem/Lesson)
    ├── learn-engine.js                Reusable lesson engine — one player, five lesson types
    ├── community.js                    Community corpus renderer — gallery + naming-callout, shared by community/*.html
    └── store.js                        Mock persistence (Preserve submissions, learner mode, lesson progress, naming suggestions)
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

## Community Voices — Muo ni, Abɛ, Folk Songs & Chants, Folk Tales

A fourth destination alongside 100 Voices, Family Voices and Learn Klo,
added at Eric's request: shared communal spaces organized around
*cultural forms* rather than individual speakers, living at
`living-language/community/`.

**Architecture — one pipeline, reused, not four bespoke wizards.** The
existing Preserve a Voice wizard (`preserve.html`) already asked for a
content type; its checkbox list (`CONTENT_TYPES` in that file's script)
now includes `Funny saying (Muo ni)`, `Proverb (Abɛ)`, `Song / Dirge /
Chant`, and `Folk tale` alongside the pre-existing Word/Phrase/Story/
Prayer/Memory/Cultural explanation/Other. Each community page's
"Contribute" button deep-links to `preserve.html?type=<contentType>`,
which pre-checks that content type so a visitor doesn't have to
re-answer "what kind of content" — same submission flow, same review
queue, no duplicated intake logic.

**The round trip, newly added.** Previously an approved Preserve a
Voice submission never appeared anywhere public — it just sat in
`LivingLanguageStore`'s review queue forever. `store.js` now exposes
`listApprovedByContentType(type)`, which the four community pages (via
the shared `js/community.js` renderer) use to actually show what the
community has contributed once an admin approves it in the Review
Queue — respecting each submission's own `accessLevel`, never bypassing
FAMILY_ONLY/etc. This is the genuinely "communal" part of the feature:
members can see each other's contributions, not just submit into a void.

**Krobo-name authority, per category — do not casually change these:**
- **Muo ni** — supplied directly by the founder, no caveat.
- **Abɛ** — supplied by the founder, but the exact spelling is
  explicitly *pending* confirmation from the Krobo Language & Culture
  Council. Every place "Abɛ" appears (hero, hub tile, wizard hint) must
  keep the pending-spelling note next to it. Do not remove that note
  just because the term looks confident in context — see the founding
  "Language-verification discipline" section above; this is the exact
  same discipline applied to a new term.
- **Folk Songs, Dirges & Chants** and **Folk Tales** — no Krobo term was
  supplied for either. Both ship in English only, each with a small
  "help us name this in Krobo" callout (`js/community.js`'s
  `renderNamingCallout`) inviting the community to suggest one as a
  first contribution. Suggestions land in their own localStorage bucket
  (`LivingLanguageStore.listNamingSuggestions()`), separate from content
  submissions, and surface in the admin's "Naming Suggestions" view —
  never auto-adopted as a section's real name; a human decision (same
  discipline as VERIFIED status) is still required before any of these
  suggestions gets promoted into page copy.

**What this explicitly does not do, by design:** no invented Krobo
proverbs, sayings, song lyrics or tale text anywhere — every category
page launches with zero seed entries and only fills from real reviewed
submissions, same "being prepared" honesty as Learn Klo. No new
Supabase schema (reuses the existing mock store). No login/auth gating
(public-with-review, matching Preserve a Voice). Peer "vouching" on a
submission's authenticity and an events-calendar tie-in for in-person
collection sessions are good next ideas, not built in this pass.

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
| Admin/corpus prototype | Real read views + a real, working review-queue action loop, incl. Naming Suggestions |
| Community Voices (Muo ni, Abɛ, Folk Songs & Chants, Folk Tales) | Real — submit → review → public-gallery round trip works end to end; zero seed content by design |
| Recording/audio capture | Placeholder only — no media pipeline yet |
| Join the Movement form | Placeholder — does not submit anywhere |
| Homepage nav/footer links | Real |

## Open verification items / next steps

- "Abɛ" spelling — pending Krobo Language & Culture Council confirmation; do not drop the pending note anywhere it appears.
- Krobo names for "Folk Songs, Dirges & Chants" and "Folk Tales" — not yet supplied; watch the admin's Naming Suggestions view for community-proposed terms, but a human decision is still required before promoting any of them into page copy.
- Peer "vouching"/corroboration on community-corpus submissions, and an events-calendar tie-in on `get-involved.html` for in-person collection sessions — good next ideas, not built in this pass.
- English meaning of the founding phrase — awaiting Language Council sign-off before any public copy states it.
- Real audio recording/upload pipeline (Preserve a Voice step 4 is currently a described placeholder).
- Admin auth gate — `admin/index.html` is `noindex`'d and unlinked, but has no server-side session check yet (unlike mentorship's `requireAdmin()`-gated functions). Needed before this goes beyond a local demo.
- Real Supabase schema for `living_language.*`, once the vertical slice is validated — swap `js/store.js`'s `localStorage` calls for real inserts.
- "Join the Movement" form needs a real destination (e.g. `vision.subscribers` or a dedicated table).
- 100-Voices gallery, Learn pathway and corpus admin should all grow from real reviewed 100 Voices recordings as those come in — nothing here should be treated as a template for inventing more Krobo content.
- Learn Klo content collection — see `living-language/learn/CONTENT-GAP-REPORT.md` for the full checklist. Highest-leverage first pass: alphabet letter names/sounds, then Greetings (smallest vocabulary set), then Home and Family.
- Learn Klo's admin/editing workflow — vocabulary and alphabet content currently lives in `js/learn-data.js` as code, not an editable table. The brief calls for eventual non-technical editing (§33); that should ride along with the real Supabase migration above, alongside the existing archive admin.
