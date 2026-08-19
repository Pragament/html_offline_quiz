# en-te-hi data schemas

Seven data files, seven JSON Schemas, one validator.

```
data/       the actual content - load these at runtime
schemas/    Draft 2020-12 schemas, one per data file plus common.schema.json
tools/      validate_data.py
```

Validate everything:

```bash
py -3 tools/validate_data.py
```

Sample coverage: **Class 5 and Class 8**, 6–8 entries per source file, 10 questions covering
all five types in both classes, 10 cheatsheet sections. Some entries also carry class 6 or 9
so that multi-class tagging is exercised.

---

## Core conventions

**`localizedText`** — `{ "en": …, "te": …, "hi": … }`. All three keys are required everywhere,
so the renderer never needs a fallback path.

**`localizedList`** — `{ "en": [...], "te": [...], "hi": [...] }`. The three arrays must be the
same length, and **index `i` must be the same item in every language**. Every answer index in
the file points into this shared index space. JSON Schema cannot check the equal-length rule;
`validate_data.py` does.

**When the option text stays English.** For Error Correction, Pronunciation Awareness and
Formal vs Informal English, the thing being judged *is* an English string. Translating it would
destroy the exercise, so `te` and `hi` repeat the English verbatim. This is deliberate, not
missing data — see `q-c8-001`.

**Class tagging.** Questions carry a single `class` (1–10). Source entries carry `classes: [5, 6]`,
because one word can legitimately serve several grades. Generators filter with
`entry.classes.includes(selectedClass)`.

**Encoding.** UTF-8, **no BOM**. `JSON.parse` rejects a BOM outright; the validator fails the
build if one appears.

---

## `correctAnswer` by question type

This is the one table worth memorising — the whole question schema is a discriminated union on `type`.

| `type` | `options` | `correctAnswer` |
|---|---|---|
| `mcq` | `localizedList`, 2–6 choices | integer index |
| `flip-card` | `{ front: localizedText, choices: localizedList }` | integer index into `choices` |
| `true-false` | `localizedList`, exactly 2 (the button labels) | **boolean** |
| `drag-drop` | `{ tokens: localizedList, target: localizedText, taskLanguage }` | array of token indices in correct order |
| `match-pairs` | `{ left: localizedList, right: localizedList }` | array of `[leftIndex, rightIndex]` pairs |

Notes:

- `drag-drop` and `match-pairs` are authored **pre-scrambled**, so the raw JSON is not an answer
  key and the renderer's own shuffle is the only thing standing between the student and the answer.
- `match-pairs` allows `right` to be longer than `left`; the extras are distractors.

### The one real constraint worth knowing about

**`drag-drop` ordering is English-only.** Telugu and Hindi put time and place *before* the verb,
English puts them after, so a single index order cannot be correct in all three languages. The
schema therefore declares `taskLanguage: "en"`: `correctAnswer` describes the English order, and
the `te`/`hi` token strings are **glosses shown under each English token**, not independently
draggable orderings. `options.target` holds the natural sentence in all three languages so the
student still sees correct Telugu and Hindi in the feedback. If you later want a Telugu word-order
drill, that is a new question type, not a new value of this field.

---

## Runtime generation

The five source files each hold `generators` (declarative recipes) and `entries` (pure data).
Adding a new style of generated question is a data edit, not a code change.

A generator produces question objects **identical in shape to `en-te-hi-questions.json`**, so the
static bank and the generated bank concatenate directly. Generated ids are
`<idPrefix>-<generator.id>-<entry.id>`, which keeps them stable and de-duplicable across sessions.

```jsonc
{
  "id": "meaning-mcq",
  "questionType": "mcq",
  "category": "Vocabulary Building",   // from the fixed taxonomy
  "addTags": ["generated", "vocabulary"],
  "prompt": { "en": "What is the meaning of \"{{word.en}}\"?", "te": …, "hi": … },
  "answer": { "path": "meaning" },
  "distractors": { "count": 3, "from": { "path": "meaning" },
                   "scope": "siblings", "pool": "same-class", "poolFallback": "widen" }
}
```

**Template tokens** are `{{field.lang}}` — `{{word.en}}`, `{{headword.te}}`, `{{cloze.en}}`.
`{{answer}}` resolves to the correct option text in the column being rendered. Double braces
never collide with Telugu or Hindi text. The validator checks that every token names a real
entry field and a real language.

**`fieldSelector.display`** maps each *display column* to the *source language* read from the
entry. Default is identity. Set all three to `"en"` when the option must stay English — that is
how `reverse-word-mcq` asks "which English word means ఆపిల్?" and keeps English in all columns.

**`requires`** gates which entries can be the *subject* of a question, letting a generator depend
on optional fields (`cloze`, `situation`, `formalEquivalent`) without making them mandatory for
every entry. It deliberately does **not** restrict distractors — a distractor only needs the field
named by `distractors.from.path`.

**`aggregate`** builds one `match-pairs` question from several entries instead of one question per
entry, which is how a source file can feed a type that isn't one-entry-shaped.

### Thin pools: the thing to know before Phase 2

A file of 6–8 entries split across grades cannot supply 3 same-class distractors for every entry.
This is a property of the sample size, not a data error, and the schema handles it explicitly
rather than letting the generator emit a two-option MCQ:

> `poolFallback: "widen"` walks **same-class → adjacent class (±1) → any class in the file**,
> stopping as soon as enough distractors exist. `"strict"` never widens and the generator skips
> the entry instead. Either way a generator **must not** emit a question with fewer than
> `count + 1` options.

The validator reports which generators will need to widen (13 notes on the current sample) and
only *fails* when even the whole file cannot supply enough — the signal that a file genuinely
needs more entries. **Roughly 8–10 entries per class per file** makes the widening stop.

Aggregate generators degrade the same way, shrinking from `count` pairs down to `minCount`
before giving up.

---

## Cheatsheet

`sheets[]` → `sections[]`, discriminated on section `type`:

| `type` | payload |
|---|---|
| `rules` | `items[].rule` + optional `examples[]`, `note` |
| `vocab-list` | `items[].term` + optional `partOfSpeech`, `example` |
| `phrase-list` | `items[].phrase` + `meaning`, optional `register` |
| `table` | `columns[]` + `rows[][]` (row length must equal column count) |
| `tips` | `items[].tip` |

Two fields are carried for the app to use, but **neither is wired up yet**:

- **`quizLink: { category, tags }`** — intended to drive a "Quiz me on this" button that hands
  these straight to the question-bank filter. The data carries it; no UI reads it.
- **`sourceId`** — points at the matching entry in the vocabulary or phrases file so the two stay
  in step. The validator fails on a `sourceId` that resolves to nothing, but the app ignores it.

---

## Migrating `index.html`

The current app has this data inline with different names. The loader will need this mapping:

| index.html | these files |
|---|---|
| `type: 'truefalse' \| 'flipcard' \| 'dragdrop' \| 'matchpairs'` | `'true-false' \| 'flip-card' \| 'drag-drop' \| 'match-pairs'` |
| `question` | `text` |
| `correct` (always an index) | `correctAnswer` (index, boolean, or array — see the table above) |
| `class: 5` on dictionary entries | `classes: [5, 6]` |
| `category: 'Vocabulary'`, `'Phrases & Collocations'` | taxonomy values: `'Vocabulary Building'`, `'Phrase Learning'` |
| `CHEATSHEET_DATA` keyed by class number | `sheets[]` array with a `class` field |

Two behavioural gaps, not just renames:

1. **`dragdrop` and `matchpairs` are currently MCQs in disguise** — both render from a flat
   `options` array and score on a single index. The new shapes are real: an ordered token
   permutation and a set of index pairs. Those two renderers and their scoring need rewriting,
   not remapping.
2. **`renderFlipCard` hard-codes "Tap to reveal options"** in English. `options.front` now carries
   that string in all three languages.
