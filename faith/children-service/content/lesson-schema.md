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

## Top-level fields

| Field | Purpose |
|---|---|
| `id`, `schemaVersion`, `status` | `status`: `sample` (placeholder), `draft`, or `published` |
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

## Validation

`content/validate-lessons.mjs` checks each lesson: parses, run-sheet minutes
add up, every `activities.<key>` reference exists, every quiz `answer` is a
valid option index, and no free-text reflection is enabled.
Run: `node faith/children-service/content/validate-lessons.mjs`
