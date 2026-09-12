# Learn Klo — Content Gap Report

Generated as part of the Phase 1 build, per the Krobo Learn handoff
brief's Step 11/12 and §51. This lists exactly what the human team
(native speakers, orthography reviewers, the Krobo Language and Culture
Council) needs to supply before each lesson can go from "fully built and
wired" to "live with real content." Nothing in this list has been
invented to fill the gap — see `living-language/README.md` and
`living-language/js/learn-data.js`'s header comment for why that
discipline is non-negotiable on this project.

## What's already real vs. what's a wired shell

| Lesson | Engine status | Content status |
|---|---|---|
| The Founding Phrase | Fully real | Real — the one verified project phrase |
| Meet the Krobo Alphabet | Fully real | Letter **shapes** real (supplied in the handoff brief); names, sounds, audio all draft |
| Things in My Home | Fully real | English concepts only; no Krobo forms |
| My Family | Fully real | English concepts only; no Krobo forms |
| Food | Fully real | English concepts only; no Krobo forms |
| Numbers & Colours | Fully real | English concepts only; no Krobo forms |
| Greetings & Everyday Expressions | Fully real | English concepts only; no Krobo forms |
| Listen & Find | Fully real (preview mode) | Blocked entirely on native audio — no interaction is possible without it |
| My First Krobo Conversation | Fully real (preview mode) | Blocked entirely on verified dialogue |

"Fully real" means: the UI, navigation, progress tracking, and
interaction pattern work end to end today. It does not mean the Krobo
language content is real — per the brief, that's earned through the
verification workflow (draft → native-speaker checked → orthography
checked → approved), not assumed.

## Per-item collection checklist

For every vocabulary item (see `js/learn-data.js`'s `VOCABULARY` array —
44 items currently seeded as English concepts only):

| Field | Required | Status |
|---|---|---|
| English meaning | Yes | ✅ done |
| Krobo/Klo word | Yes | ❌ not collected |
| Standard written form | Yes | ❌ not collected |
| Native pronunciation (audio) | Yes | ❌ not collected |
| Slow pronunciation (audio) | Preferred | ❌ not collected |
| Speaker name/attribution | Yes | ❌ not collected |
| Speaker locality | Preferred | ❌ not collected |
| Photograph/image (culturally specific, not stock art) | Yes | ❌ not collected |
| Example sentence | Later | ❌ not collected |
| Example sentence audio | Later | ❌ not collected |
| Cultural note | Optional | ❌ not collected |
| Native speaker checked | Yes | ❌ pending |
| Orthography checked | Yes | ❌ pending |

For every alphabet item (30 letters/digraphs seeded — see `ALPHABET_SEQUENCE`):

| Field | Required | Status |
|---|---|---|
| Letter shape | Yes | ✅ done (from handoff brief) |
| Lowercase form | Yes | ✅ done |
| Letter name | Yes | ❌ not collected |
| Letter name audio | Yes | ❌ not collected |
| Sound description | Yes | ❌ not collected |
| Sound audio | Yes | ❌ not collected |
| Example word | Preferred | ❌ blocked on vocabulary collection above |
| Example image | Preferred | ❌ blocked on vocabulary collection above |
| Verification | Yes | ❌ pending — sequence itself still needs confirming against approved linguistic sources per the brief's own caveat |

## Two specific items flagged in the handoff brief itself

The brief's planning notes floated "Chimi" (calabash) and "Kopo" (cup)
as possible words, then explicitly said not to publish them as fact.
They are **not** in `learn-data.js` at all — not even as a marked-draft
`kloWrittenForm`. If these turn out to be correct after native-speaker
and orthography review, add them then; don't reintroduce them from
memory of this planning conversation.

## What unblocks each lesson

1. **Alphabet** → letter names + sounds + audio from a native speaker, reviewed by an orthography checker.
2. **Home / Family / Food / Numbers & Colours / Greetings** → the per-item checklist above, run through all four verification steps, for each of the 44 seeded concepts (or a first useful subset — the brief doesn't require all 44 before shipping any).
3. **Listen & Find** → at least 4 approved vocabulary items with audio, from any one category.
4. **My First Krobo Conversation** → a short recorded/verified exchange (2–3 turns) between two speakers, plus response-option translations.

## Recommended order

Given the brief's own Level 1 sequencing, the highest-leverage first
collection pass is: **Alphabet letter names/sounds**, then **Greetings**
(smallest vocabulary set, highest emotional payoff — matches the
project's "grandparent and grandchild" test), then **Home** and
**Family**.
