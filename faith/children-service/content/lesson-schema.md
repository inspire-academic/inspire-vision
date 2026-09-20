# Children's Service — lesson format (schemaVersion 1)

One JSON file per character-study lesson, stored in `content/lessons/`.
`david-01.json` is the worked example. It is a **placeholder** written to
prove the format; replace it with the real material when it is supplied.
When the database is live, the same JSON goes into
`children_service.lessons.content` (see `supabase/children_service_schema.sql`).

## Rules that make a lesson safe to publish

- **Scripture text is public domain only.** Default translation is the World
  English Bible (`WEB`). Quote a verse only by copying it from the source;
  otherwise give the reference alone. Do not paste NIrV/NLT/ICB/CEV text
  without checking the publisher's licence.
- **Every lesson names its passages** (`scripture.passages`). Retelling is
  the author's own words; anything imagined is not put in a `quoted` block.
- **No free text from a child, ever.** Reflection is `choices` with
  `freeText: false`. Nothing a child types is shown to other children.
- **Hard stories carry a `sensitivity` note** and, where needed, a separate
  younger-band version (`explorerVersion`).
- **No leaderboards, scores or speed.** Quiz answers are for the child's own
  feedback and are not ranked or displayed to others.

- **Every lesson is more than history.** It must include life-application
  `apply.moments` (a live one for each age band) and a `belonging` spotlight
  ("who else is in this story?"). The validator enforces both.
- **Nothing reaches children unreviewed.** `contentReview.status` starts as
  `draft`. Only Pastor Eric or the designated lead teacher can move it to
  `approved` (filling in `reviewer` and `reviewedOn`). The seed generator
  writes an unapproved lesson to the database as `draft`, which children
  cannot see. Review by opening the play page **without** a child selected
  (practice mode reads the file directly), and use the Explorer / Trailblazer
  toggle to read both versions.
- **Names are used sparingly, alternate in heritage, and never point at a
  real child.** Scenarios use placeholders such as `{boy1}` and `{girl2}`,
  filled from the lesson's own `names` pool, which has an `african` and an
  `other` list for each gender. Characters ALTERNATE, in the order they appear:
  a non-African name, then an African one, then a non-African one, and so on.
  The app never uses the child's own name for a character, and picks the same
  names for the same child each time. A given name may appear at most 3 times
  in a lesson.
- **Scripture quotes are checked, not trusted.** Run
  `node faith/children-service/content/verify-quotes.mjs` (needs internet) to
  confirm every quoted verse is in the World English Bible.
- **Belonging is for every heritage, and woven in, not bolted on.** Do not
  single out one continent or people in a card of its own; show that God's
  story is for every family through the people the Bible itself names. Do not
  claim a modern country (such as Ghana) is in the Bible.

## Top-level fields

| Field | Purpose |
|---|---|
| `id`, `schemaVersion`, `status` | `status`: `sample` (placeholder), `draft`, or `published` |
| `contentReview` | `status` (`draft` / `approved`), `note`, `reviewer`, `reviewedOn`. An approved lesson must name its reviewer and date |
| `names` | Names scenarios draw from: `boy` and `girl`, each with `african` and `other` lists (at least 2 in each), plus a note. Edit it to fit your congregation |
| `apply` | Life-application moments; see below |
| `belonging` | The "who else is in this story?" spotlight; see below |
| `character` | name, era, `places`, `trait`, `cardTagline` for the collectible card, and `mapStop`: which stop on the Bible map this lesson unlocks (`creation`, `abraham`, `exodus`, `judges`, `kings`, `exile`, `jesus`, `church`) |
| `translation` | id, name, licence, notes |
| `scripture` | `passages` and per-band `ageNotes` |
| `bigIdea` | One sentence. The thing a child should be able to say afterwards |
| `sensitivity` | `level` (`gentle` / `moderate` / `heavy`) and leader guidance |
| `preClass` | Teaser and "Who Am I?" mystery (`clues`, `answer`, `options`) |
| `live` | Everything for the Zoom session; see below |
| `postClass` | `mission` (parent-confirmed), `familyQuestions`, `reflection` |
| `review` | Flip-cards and spaced-review `intervalsDays` |
| `rewards` | Which badge keys the lesson can lead to, and on what condition |
| `doctrine` | `themes` and `flags` so a church can swap or hide sensitive content |

## `live`

- `roles`: two adults and a present parent are required, not optional.
- `story.part1` / `story.part2`: `retelling`, optional `explorerVersion`,
  `quoted` verse(s), a `prop`, and `soundCues`.
- `activities[]`: `key`, `type` (`movement`, `poll`, `hot_seat`,
  `find_the_verse`, `make`, `wonder`), `bands`, `minutes`, `prompt`.
- `runSheet.explorer` (ages 5-7, about 28 min) and `runSheet.trailblazer`
  (ages 8-11, about 42 min): ordered `blocks` whose `minutes` add up to
  `totalMinutes`. A block's `detail` may point at an activity as
  `activities.<key>`. Change the kind of activity every 4-8 minutes.
- `quiz.explorer` / `quiz.trailblazer`: multiple choice only.
- `memoryVerse`: reference, text (public domain), and actions.

## `apply` (life application)

`apply.moments[]`, each with:

- `key`, `after` (where it sits: `story.part1`, `story.part2`, `quiz` or
  `verse`), `bands`, `liveUse` (`yes` = run it in the live class; `home` =
  app / home only, e.g. anything that could single out a child in a group).
- `title`, `scenario`, `question`, and `choices[]` where **every** choice has
  a `text` and a kind `response`. No choice is "wrong".
- `grownUpTalk`: how it hands over to a grown-up. This is where the real
  conversation happens, because children never type in the app.
- `leaderPrompt` (required when `liveUse` is `yes`): what the leader asks
  aloud. Live discussion is the main way these are taught; the app is
  reinforcement. Never ask a child to speak for their culture or family.

Nothing a child taps on a moment is stored.

## `belonging`

- `spotlight`: `who`, `from`, `why`, `ref`. Vary it lesson to lesson (for
  example Ruth, Joseph in Egypt, the Ethiopian official, Simon of Cyrene).
- `cards[]`: `key`, `bands`, `title`, `text`, optional `quote` (`ref`, `text`).
  At least two cards per band.
- `leaderPrompt`, and a `belonging` block in each run-sheet.

## Validation

`content/validate-lessons.mjs` checks each lesson: parses, run-sheet minutes
add up, every `activities.<key>` and `apply.<key>` reference exists, live
blocks only use `liveUse: "yes"` moments for the right band, every quiz
`answer` is a valid option index, no free-text reflection is enabled, moments
are complete (a reply for every choice, a grown-up hand-over), `belonging` is
present, the review gate is well-formed, and names are used sparingly.
Run: `node faith/children-service/content/validate-lessons.mjs`
