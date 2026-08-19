# 🎓 QuizMaster — Student Quiz App

A responsive, framework-free quiz app for students in classes 1–10.
It serves one random question at a time in **English, Telugu and Hindi**, scores
**+3** for a correct answer, **−1** for a wrong one and **0** for a skip, and works
offline in the browser.

Questions come from a hand-written bank plus questions generated at runtime from
vocabulary, synonym, antonym, proverb and phrase dictionaries.

---

## 🚀 Features

- **One question at a time**, drawn from a shuffled per-student bank.
- **Scoring** — +3 correct, −1 wrong, 0 skip. End the quiz at any question and see results.
- **Timer** — elapsed time per student, shown live and recorded in the results.
- **Five question types** — MCQ, Flip Card, Drag & Drop (tap-to-place), Match Pairs
  (tap-to-link, with connector lines), True/False.
- **Trilingual** — every question shows the languages you selected; pick any subset.
- **Filtering** — class (1–10), languages, categories and tags. Leave categories or
  tags empty to mean "all".
- **Multiple students on one device** — register any number, each gets their own
  question order, timer and score, with a "pass the device" screen between turns.
- **Cheatsheet** — a browsable class reference sheet (grammar rules, tables,
  vocabulary, phrases, pronunciation tips), reachable before *and* after a quiz.
- **Runtime question generation** — declarative generators in each source file turn
  dictionary entries into questions; adding content needs no code changes.
- **Endless mode** (optional) — keeps generating fresh questions until the student
  stops, instead of a fixed-length bank. Leave it off for a comparable test.
- **Saved locally** — session setup and results persist in `localStorage`, written
  after every question so a closed tab doesn't lose a turn.
- **Responsive** — verified with no horizontal scrolling down to 360 px.

---

## 📦 Getting Started

### Project layout

| Path | What it is |
|---|---|
| `index.html` | Session setup: class, languages, categories, tags, students. |
| `quiz.html` | The quiz runtime and results screen. |
| `cheatsheet.html` | Standalone class reference sheet. |
| `assets/` | CSS and the framework-free JS modules (see below). |
| `data/` | Question bank, generator sources, cheatsheet content. |
| `schemas/` | JSON Schemas for every data file. |
| `tools/` | `server.py` (dev server), `validate_data.py` (data checks), `build_offline.py` (offline build), plus small `check_*.py` helpers. |
| `test/generators-test.html` | Dev harness: previews what each generator produces. |
| `test_home.html` | Dev harness: catches JS errors thrown by the setup page. |
| `legacy/quizmaster-v1.html` | The original single-file prototype, kept for reference. |

JS modules in `assets/`:

| File | Role |
|---|---|
| `home.js` | Setup form, validation, writes `quizSessionConfig`. |
| `data-loader.js` | Loads the seven data files: fetch → embedded → cached. |
| `quiz-generator.js` | Runs the declarative generators in the source files. |
| `quiz-engine.js` | Bank assembly, turn/timer/score state, results persistence. |
| `quiz-renderers.js` | One renderer per question type. |
| `quiz-results.js` | Results screen and per-question review. |
| `cheatsheet.js` | Cheatsheet viewer, shared by `quiz.html` and `cheatsheet.html`. |

### Running it

**Just open `index.html`.** Each page embeds a copy of the JSON it needs, so the app
works straight off disk with no server — that is what makes it usable offline.

For development, serving the folder is preferable, because then the pages read
`data/` live instead of the embedded copies:

```bash
py -3 tools/server.py
```

That serves the project root on <http://localhost:8000> and opens your browser at
it. Stop it with Ctrl+C. It can be run from any directory — it resolves the project
root from its own location — so `py -3 tools/server.py` works the same from the repo
root or from inside `tools/`.

Any static server does the job if you prefer, e.g. `py -3 -m http.server 8000` from
the project root. Either way, the header badge on the setup page tells you whether it
read `data/` or fell back to the embedded copies.

### Using it

1. Pick class, languages, categories and tags.
2. Choose the quiz length: leave **Endless mode** off for a fixed bank where every
   student answers the same number, or turn it on for practice that never runs out.
3. Add one student, or several if a group is sharing the device.
4. **Start Quiz** — or **Cheatsheet** to browse the reference sheet first.
5. Answer, skip, or end the quiz early at any point to see results.

### After editing anything in `data/`

The offline copies are generated, not hand-maintained. Re-run the build so the
pages pick up your changes when opened off disk:

```bash
py -3 tools/build_offline.py
```

This rewrites the `<script type="application/json" data-file="…">` blocks in
`index.html`, `quiz.html`, `cheatsheet.html` and the generator test page. Skipping
it means a served copy shows your edits but the offline copy still shows the old
content — a confusing mismatch, so make it a habit.

### Validating the data

```bash
py -3 tools/validate_data.py
```

Checks what JSON Schema cannot: parallel-array lengths across languages, answer
indices in range, drag-drop orders being real permutations, generator template
tokens resolving, cross-file `sourceId` references, and UTF-8 BOMs.

---

## 🧭 How it works

**Setup → quiz.** `index.html` writes the session to `localStorage["quizSessionConfig"]`
and navigates to `quiz.html`, which reads it back. The quiz page never needs the form.

**Building the bank.** For the selected class, `quiz-engine.js` combines hand-written
questions from `en-te-hi-questions.json` with questions produced by the generators in
the five source files, de-duplicates by id, applies the category and tag filters, then
shuffles with a seed derived from the student index — so each student on a shared
device gets a different order. Class 5 currently yields 110 questions (5 hand-written,
105 generated).

**Endless mode.** Each generator is seeded from its entry id, so it normally yields one
fixed question per entry. Endless mode re-runs the generators with an incrementing
`variant` folded into that seed, producing different distractors and (where `pick` is
`random`) a different correct answer. New questions are appended when the bank drops to
five remaining.

Two things stop it feeling repetitive. A content fingerprint blocks an identical
question returning at all, and — more importantly — top-ups track the **subject** behind
each question: which generator ran over which entry. A first pass accepts only subjects
the student has not met, so every word, phrase and proverb in the class is covered
before any of them comes round again. Without that, re-rolling a variant produced the
same stem with new distractors, which passes the fingerprint test but reads as the same
question to a student.

Aggregate generators (match-pairs) pick a random set of entries per variant, so they
count as one subject per generator rather than one per draw — otherwise the same
"Match each …" prompt returns on every top-up.

**Storage keys.**

| Key | Contents |
|---|---|
| `quizSessionConfig` | The setup form's output. |
| `quizSessionResults` | Current session in full, including a per-question record. |
| `quizResultsHistory` | Summaries of the last 20 completed sessions (no per-question detail). |
| `qm-data:<path>` | Cached copies of the data files. |

The split keeps a shared classroom device inside its storage quota: only one session
ever holds question-level detail. A 2-student × 50-question session is about 18 KB.

---

## 📁 Data & schemas

Data lives in `data/` as seven JSON files, each with a matching schema in `schemas/`.
**[DATA-SCHEMA.md](DATA-SCHEMA.md)** is the reference: it documents the shape of every
file, the `correctAnswer` rules per question type, and the generator contract.

| File | Purpose |
|---|---|
| `en-te-hi-questions.json` | Hand-written questions. |
| `en-te-hi-vocabulary-dictionary.json` | Words → vocabulary questions. |
| `en-te-hi-synonyms.json` | Synonym sets → synonym questions. |
| `en-te-hi-antonyms.json` | Opposite sets → antonym questions. |
| `en-te-hi-proverbs.json` | Proverbs → meaning, completion and matching questions. |
| `en-te-hi-phrases.json` | Phrases → meaning, situational and register questions. |
| `en-te-hi-cheatsheet.json` | Class reference sheets. |

Two shapes, easy to confuse:

- `en-te-hi-questions.json` holds `questions[]`, each with a **singular `class`**.
- The five source files hold `entries[]`, each with a **`classes[]` array**, so one
  entry can serve several grades.

---

## 📊 Current status

**Working and verified** by an end-to-end audit: the full setup → quiz → results →
cheatsheet flow; all five question types interactive, with `+3` / `−1` / `0` confirmed
for each and no scoring discrepancies over ~90 answered questions; the timer;
category, tag and language filtering; endless mode checked class by class (classes 1–5
and 8 serve 50 distinct questions before anything repeats; 6 and 9 repeat sooner only
because they have 22 and 3 subjects); multi-student turns with separate
banks, scores and timers; results persistence across a reload; all 10 cheatsheet
sections on both classes; the empty-class and zero-answer edge cases; and no
horizontal scrolling at 360 px in either colour scheme.

A static check also runs over the project — duplicate ids, JS referencing DOM ids that
do not exist on the page, undefined CSS variables, embedded offline data drifting from
`data/`, and broken links — all currently clean.

**Known gaps:**

- **Class coverage is uneven.** Classes 1–5 and 8 are usable. Classes 6 and 9 have
  only a handful of entries, and 7 and 10 have none — those two show
  "No questions available" and cannot be quizzed at all. Filling them needs no code,
  only data.

  | Class | Distinct subjects | Endless usable? |
  |---|---|---|
  | 1 | 78 | yes |
  | 2 | 79 | yes |
  | 3 | 63 | yes |
  | 4 | 63 | yes |
  | 5 | 112 | yes |
  | 6 | 22 | thin |
  | 7 | 0 | no content |
  | 8 | 55 | yes |
  | 9 | 3 | unusable — one vocabulary entry |
  | 10 | 0 | no content |

  Synonyms, antonyms and proverbs still only cover classes 5, 6 and 8; the cheatsheet
  only classes 5 and 8.
- **Endless mode gives variety, not unlimited new content.** Once a class's subjects are
  exhausted the same material returns with different wrong options. For classes 1–5 and
  8 the first 50 questions are all distinct, so a normal session never repeats. Classes 6
  and 9 run out sooner — after 22 and 3 questions respectively — because that is all the
  content they have. More entries is the only real fix.
- **Results are not exportable.** They persist locally but there is no CSV/JSON
  download, and starting a new session overwrites the previous session's
  question-level detail (its summary survives in the history).
- **The cheatsheet is deliberately not reachable during a quiz**, since it lists the
  very words the questions ask about.
- **Only MCQ questions are keyboard-accessible.** MCQ options are real `<button>`
  elements, but flip-card, true-false, drag-drop and match-pairs are `<div>`s with
  click handlers — no `tabindex`, no `role`, not in the tab order. A keyboard-only or
  screen-reader user can answer roughly half a bank and cannot operate the rest. Fixing
  it means swapping those elements for buttons (or adding `tabindex` + `role` + an
  Enter/Space handler) in `assets/quiz-renderers.js`.

---

## 🛠️ Customization

**Add questions** — append to `data/en-te-hi-questions.json` with a unique `id` and the
right `class`. Run the validator afterwards.

**Add generated questions** — add entries to any of the five source files. The
`generators` array in each file describes how entries become questions, so new content
flows through with no code change. Tag an entry `"classes": [3]` to populate Class 3.

**Add a generator** — add an object to a file's `generators` array: a `prompt` with
`{{field.lang}}` tokens, an `answer` selector and a `distractors` rule.

**Change scoring** — the `+3` / `−1` / `0` values are in `handleAnswer()` and
`skipQuestion()` in `assets/quiz-engine.js`.

**Change which student fields are required** — flip `required` in the `STUDENT_FIELDS`
array at the top of `assets/home.js`. Name and roll number are required by default;
section, admission number and parent phone are optional but format-checked.

**Categories** are fixed by the taxonomy in `schemas/common.schema.json`; the setup
form reads them from there, and the validator rejects anything outside it.

---

## 🎨 Styling

**`assets/home.css` owns the theme.** It defines every colour, radius and shadow as a
custom property on `:root`, with a `prefers-color-scheme: dark` block overriding the
same names. Every page loads it first, then adds a page-specific sheet:

```html
<link rel="stylesheet" href="assets/home.css">   <!-- theme, always first -->
<link rel="stylesheet" href="assets/quiz.css">   <!-- quiz + cheatsheet -->
```

`quiz.css` was written against a different set of names (`--bg-body`, `--text-main`,
`--primary-color`, …) which never existed, so its rules were silently invalid and the
quiz page ignored the theme entirely. Those names are now **aliases** declared in
`home.css` and pointing at the real tokens, so both pages share one palette and dark
mode works everywhere.

When adding styles, use the semantic tokens — `--bg`, `--surface`, `--text`,
`--border`, `--primary`, `--success`, `--danger`, `--warning-soft` — rather than raw
hex, or the rule will not follow dark mode. `--brand-1` / `--brand-2` are the header
gradient and deliberately stay the same in both schemes, since that banner is what
makes the pages read as one app.

No web fonts: the type stack is `system-ui` with Telugu and Devanagari fallbacks, so
nothing is fetched over the network and the pages look the same offline.

## 🧠 Technologies

HTML5, CSS3 (custom properties, grid/flex, light and dark), vanilla ES5-compatible
JavaScript, `localStorage`. No frameworks and no runtime dependencies; the only
build step is the Python script that refreshes the offline data copies.

---

<details>
<summary>📜 Legacy prototype (<code>legacy/quizmaster-v1.html</code>)</summary>

The original version was a single HTML file with all data embedded as JavaScript
variables. It still runs standalone and is kept for reference, but its field names
differ from the current schemas — see the migration table at the end of
[DATA-SCHEMA.md](DATA-SCHEMA.md).

Its embedded structures were `STATIC_QUESTIONS`, `VOCAB_DICT`, `SYNONYMS`, `ANTONYMS`,
`PROVERBS`, `PHRASES` and `CHEATSHEET_DATA`. Notable differences from the current data:

| Legacy | Current |
|---|---|
| `type: 'truefalse' \| 'flipcard' \| 'dragdrop' \| 'matchpairs'` | `'true-false' \| 'flip-card' \| 'drag-drop' \| 'match-pairs'` |
| `question` | `text` |
| `correct` (always an index) | `correctAnswer` (index, boolean, or array) |
| `class: 5` on dictionary entries | `classes: [5, 6]` |
| `category: 'Vocabulary'` | `category: 'Vocabulary Building'` |
| `CHEATSHEET_DATA` keyed by class | `sheets[]` with a `class` field |

</details>

---

## 🤝 Contributing

Contributions are welcome — new question types, more class content, or UI
improvements. Please run `py -3 tools/validate_data.py` before opening a pull request.

## 📧 Support

Open an issue in the project repository.

**Happy Quizzing!** 🎉
