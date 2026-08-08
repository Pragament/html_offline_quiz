"""Validate the en-te-hi data files.

Checks the structural rules that JSON Schema cannot express (parallel-array
lengths, answer-index ranges, generator paths, cross-file id references) plus,
if the `jsonschema` package happens to be installed, the schemas themselves.

Run:  py -3 tools/validate_data.py
Exits non-zero if anything fails.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SCHEMAS = ROOT / "schemas"

LANGS = ("en", "te", "hi")

CATEGORIES = {
    "Vocabulary Building", "Sentence Formation", "Grammar", "Phrase Learning",
    "Idioms & Expressions", "Reading Comprehension", "Conversation Understanding",
    "Response Formation", "Fluency Practice (Written)", "Speaking Patterns",
    "Question Formation", "Error Correction", "Paraphrasing", "Story Completion",
    "Situational English", "Formal vs Informal English", "Pronunciation Awareness",
}

QUESTION_TYPES = {"mcq", "flip-card", "drag-drop", "match-pairs", "true-false"}

SOURCE_FILES = {
    "en-te-hi-vocabulary-dictionary.json": "vocabulary-dictionary",
    "en-te-hi-synonyms.json": "synonyms",
    "en-te-hi-antonyms.json": "antonyms",
    "en-te-hi-proverbs.json": "proverbs",
    "en-te-hi-phrases.json": "phrases",
}

TOKEN_RE = re.compile(r"\{\{([a-zA-Z0-9_.]+)\}\}")

errors = []
notes = []
checks = 0


def fail(where, msg):
    errors.append(f"{where}: {msg}")


def note(where, msg):
    notes.append(f"{where}: {msg}")


def note_thin_classes(where, pool, needed, fallback, label):
    """Per-class shortfalls are expected in a small file: the generator widens
    the pool (same-class -> adjacent -> any). Report them, but only fail when
    the generator has declared `strict` and therefore cannot widen."""
    by_class = {}
    for e in pool:
        for c in e["classes"]:
            by_class[c] = by_class.get(c, 0) + 1
    thin = {c: n for c, n in sorted(by_class.items()) if n < needed}
    if not thin:
        return
    detail = ", ".join(f"class {c} has {n}" for c, n in thin.items())
    msg = f"{label} needs {needed} entries per class; {detail}"
    if fallback == "strict":
        fail(where, msg + " - poolFallback is 'strict', so these classes generate nothing")
    else:
        note(where, msg + " - generator widens beyond the class")


def ok():
    global checks
    checks += 1


def load(path):
    # utf-8-sig tolerates a leading BOM, which Windows editors add readily.
    # Note the browser will NOT tolerate one: JSON.parse rejects a BOM, so the
    # committed files must stay BOM-free. check_no_bom() enforces that.
    with open(path, encoding="utf-8-sig") as fh:
        return json.load(fh)


def check_no_bom(path):
    ok()
    with open(path, "rb") as fh:
        if fh.read(3) == b"\xef\xbb\xbf":
            fail(path.name, "file starts with a UTF-8 BOM; JSON.parse in the "
                            "browser will reject it - save as UTF-8 without BOM")


def check_localized_text(node, where):
    ok()
    if not isinstance(node, dict):
        return fail(where, "expected a localizedText object")
    for lang in LANGS:
        if lang not in node:
            fail(where, f"missing language '{lang}'")
        elif not isinstance(node[lang], str) or not node[lang].strip():
            fail(where, f"language '{lang}' must be a non-empty string")
    for extra in set(node) - set(LANGS):
        fail(where, f"unexpected key '{extra}'")


def check_localized_list(node, where, min_items=1):
    """Parallel arrays must exist in all three languages and be the same length."""
    ok()
    if not isinstance(node, dict):
        return fail(where, "expected a localizedList object")
    lengths = {}
    for lang in LANGS:
        val = node.get(lang)
        if not isinstance(val, list):
            fail(where, f"language '{lang}' must be an array")
            continue
        if len(val) < min_items:
            fail(where, f"language '{lang}' needs at least {min_items} items")
        for i, item in enumerate(val):
            if not isinstance(item, str) or not item.strip():
                fail(where, f"{lang}[{i}] must be a non-empty string")
        lengths[lang] = len(val)
    if len(set(lengths.values())) > 1:
        fail(where, f"parallel arrays differ in length: {lengths}")
    return lengths.get("en", 0)


def check_envelope(doc, where, expected_type):
    ok()
    if doc.get("fileType") != expected_type:
        fail(where, f"fileType should be '{expected_type}', found {doc.get('fileType')!r}")
    if not re.fullmatch(r"\d+\.\d+\.\d+", str(doc.get("schemaVersion", ""))):
        fail(where, "schemaVersion must be semver")
    if doc.get("languages") != ["en", "te", "hi"]:
        fail(where, f"languages should be ['en','te','hi'], found {doc.get('languages')!r}")


# ---------------------------------------------------------------- questions

def validate_questions():
    path = DATA / "en-te-hi-questions.json"
    doc = load(path)
    where0 = path.name
    check_envelope(doc, where0, "questions")

    seen_ids = set()
    for q in doc["questions"]:
        qid = q.get("id", "<no id>")
        where = f"{where0}[{qid}]"
        ok()

        if qid in seen_ids:
            fail(where, "duplicate question id")
        seen_ids.add(qid)

        if not isinstance(q.get("class"), int) or not 1 <= q["class"] <= 10:
            fail(where, f"class must be an integer 1-10, found {q.get('class')!r}")
        if q.get("type") not in QUESTION_TYPES:
            fail(where, f"unknown type {q.get('type')!r}")
        if q.get("category") not in CATEGORIES:
            fail(where, f"category {q.get('category')!r} is not in the taxonomy")
        if not isinstance(q.get("tags"), list) or not q["tags"]:
            fail(where, "tags must be a non-empty array")

        check_localized_text(q.get("text"), f"{where}.text")
        if "explanation" in q:
            check_localized_text(q["explanation"], f"{where}.explanation")

        opts, answer, qtype = q.get("options"), q.get("correctAnswer"), q.get("type")

        if qtype in ("mcq", "true-false"):
            n = check_localized_list(opts, f"{where}.options", min_items=2)
            if qtype == "mcq":
                if not isinstance(answer, int) or isinstance(answer, bool):
                    fail(where, "mcq correctAnswer must be an integer index")
                elif not 0 <= answer < n:
                    fail(where, f"correctAnswer {answer} out of range (0..{n - 1})")
            else:
                if n != 2:
                    fail(where, f"true-false needs exactly 2 option labels, found {n}")
                if not isinstance(answer, bool):
                    fail(where, "true-false correctAnswer must be a boolean")

        elif qtype == "flip-card":
            check_localized_text(opts.get("front"), f"{where}.options.front")
            n = check_localized_list(opts.get("choices"), f"{where}.options.choices", min_items=2)
            if not isinstance(answer, int) or isinstance(answer, bool):
                fail(where, "flip-card correctAnswer must be an integer index")
            elif not 0 <= answer < n:
                fail(where, f"correctAnswer {answer} out of range (0..{n - 1})")

        elif qtype == "drag-drop":
            n = check_localized_list(opts.get("tokens"), f"{where}.options.tokens", min_items=2)
            check_localized_text(opts.get("target"), f"{where}.options.target")
            if opts.get("taskLanguage", "en") != "en":
                fail(where, "taskLanguage other than 'en' is not supported by the renderer")
            if not isinstance(answer, list):
                fail(where, "drag-drop correctAnswer must be an array of token indices")
            elif sorted(answer) != list(range(n)):
                fail(where, f"correctAnswer must be a permutation of 0..{n - 1}, found {answer}")

        elif qtype == "match-pairs":
            nl = check_localized_list(opts.get("left"), f"{where}.options.left", min_items=2)
            nr = check_localized_list(opts.get("right"), f"{where}.options.right", min_items=2)
            if not isinstance(answer, list):
                fail(where, "match-pairs correctAnswer must be an array of [left,right] pairs")
            else:
                if len(answer) != nl:
                    fail(where, f"expected {nl} pairs (one per left item), found {len(answer)}")
                lefts, rights = [], []
                for pair in answer:
                    if not (isinstance(pair, list) and len(pair) == 2):
                        fail(where, f"malformed pair {pair!r}")
                        continue
                    li, ri = pair
                    if not 0 <= li < nl:
                        fail(where, f"left index {li} out of range")
                    if not 0 <= ri < nr:
                        fail(where, f"right index {ri} out of range")
                    lefts.append(li)
                    rights.append(ri)
                if len(set(lefts)) != len(lefts):
                    fail(where, "a left item is matched more than once")
                if len(set(rights)) != len(rights):
                    fail(where, "a right item is used by more than one pair")

    classes = sorted({q["class"] for q in doc["questions"]})
    types = {q["type"] for q in doc["questions"]}
    print(f"  questions: {len(doc['questions'])} items, classes {classes}, "
          f"{len(types)}/{len(QUESTION_TYPES)} types covered")
    return doc


# ------------------------------------------------------------ source files

def entry_field(entry, path):
    return entry.get(path)


def validate_generator(gen, entries, where0, gid_seen):
    gid = gen.get("id", "<no id>")
    where = f"{where0}.generators[{gid}]"
    ok()

    if gid in gid_seen:
        fail(where, "duplicate generator id")
    gid_seen.add(gid)

    if gen.get("questionType") not in QUESTION_TYPES:
        fail(where, f"unknown questionType {gen.get('questionType')!r}")
    if gen.get("category") not in CATEGORIES:
        fail(where, f"category {gen.get('category')!r} is not in the taxonomy")
    check_localized_text(gen.get("prompt"), f"{where}.prompt")

    has_answer = "answer" in gen
    has_aggregate = "aggregate" in gen
    if has_answer == has_aggregate:
        fail(where, "exactly one of `answer` or `aggregate` must be present")

    required = set(gen.get("requires", []))
    eligible = [e for e in entries if required.issubset(e)]
    if not eligible:
        fail(where, f"no entry satisfies requires={sorted(required)}")

    selectors = []
    if has_answer:
        selectors.append(("answer", gen["answer"]))
        if gen["questionType"] in ("mcq", "flip-card"):
            if "distractors" not in gen:
                fail(where, f"{gen['questionType']} generator needs `distractors`")
            else:
                dis = gen["distractors"]
                selectors.append(("distractors.from", dis["from"]))
                count = dis["count"]
                # `requires` gates the SUBJECT of a question, not the distractors:
                # a distractor only needs the field named by distractors.from.path.
                pool = [e for e in entries if dis["from"]["path"] in e]
                if dis.get("scope", "siblings") == "siblings" and len(pool) - 1 < count:
                    fail(where, f"only {len(pool)} entries carry "
                                f"'{dis['from']['path']}'; {count + 1} needed to fill "
                                f"{count} distractors even after widening to the whole file")
                else:
                    note_thin_classes(where, pool, count + 1,
                                      dis.get("poolFallback", "widen"), "distractor pool")
        if gen["questionType"] == "true-false" and "falseStatement" in gen:
            check_localized_text(gen["falseStatement"], f"{where}.falseStatement")
    else:
        agg = gen["aggregate"]
        selectors.append(("aggregate.left", agg["left"]))
        selectors.append(("aggregate.right", agg["right"]))
        if gen["questionType"] != "match-pairs":
            fail(where, "aggregate generators are only defined for match-pairs")
        min_count = agg.get("minCount", 3)
        if min_count > agg["count"]:
            fail(where, f"minCount {min_count} exceeds count {agg['count']}")
        if len(eligible) < min_count:
            fail(where, f"only {len(eligible)} eligible entries in the whole file, "
                        f"fewer than minCount={min_count}")
        else:
            note_thin_classes(where, eligible, agg["count"], "widen", "pair pool")

    # every selector path must exist on every eligible entry
    for label, sel in selectors:
        path = sel["path"]
        for e in eligible:
            if path not in e:
                fail(where, f"{label}.path '{path}' missing on entry '{e['id']}'")
                break
        for lang, src in (sel.get("display") or {}).items():
            if lang not in LANGS or src not in LANGS:
                fail(where, f"{label}.display has an unknown language: {lang}->{src}")

    # template tokens must resolve against a real entry field + language
    for field in ("prompt", "explanation", "falseStatement"):
        node = gen.get(field)
        if not node:
            continue
        for lang in LANGS:
            for token in TOKEN_RE.findall(node.get(lang, "")):
                if token == "answer":
                    continue
                head, _, tail = token.partition(".")
                if tail and tail not in LANGS:
                    fail(where, f"{field}.{lang}: token {{{{{token}}}}} has unknown language '{tail}'")
                elif not any(head in e for e in eligible):
                    fail(where, f"{field}.{lang}: token {{{{{token}}}}} names no entry field")


def validate_source_file(filename, filetype):
    path = DATA / filename
    doc = load(path)
    where0 = path.name
    check_envelope(doc, where0, filetype)

    entries = doc["entries"]
    seen = set()
    for e in entries:
        eid = e.get("id", "<no id>")
        where = f"{where0}[{eid}]"
        ok()
        if eid in seen:
            fail(where, "duplicate entry id")
        seen.add(eid)

        if not isinstance(e.get("classes"), list) or not e["classes"]:
            fail(where, "classes must be a non-empty array")
        else:
            for c in e["classes"]:
                if not isinstance(c, int) or not 1 <= c <= 10:
                    fail(where, f"class {c!r} is not an integer 1-10")
        if e.get("categoryHint") not in CATEGORIES:
            fail(where, f"categoryHint {e.get('categoryHint')!r} is not in the taxonomy")
        if not isinstance(e.get("tags"), list) or not e["tags"]:
            fail(where, "tags must be a non-empty array")

        for key, val in e.items():
            if key in ("id", "classes", "tags", "categoryHint", "partOfSpeech",
                       "phraseType", "register"):
                continue
            if isinstance(val, dict) and any(isinstance(v, list) for v in val.values()):
                check_localized_list(val, f"{where}.{key}")
            else:
                check_localized_text(val, f"{where}.{key}")

        if "cloze" in e:
            for lang in LANGS:
                if "___" not in e["cloze"][lang]:
                    fail(where, f"cloze.{lang} has no ___ blank")
            if "blankWord" not in e:
                fail(where, "cloze without blankWord")

    gid_seen = set()
    for gen in doc["generators"]:
        validate_generator(gen, entries, where0, gid_seen)

    classes = sorted({c for e in entries for c in e["classes"]})
    print(f"  {filetype}: {len(entries)} entries, {len(doc['generators'])} generators, "
          f"classes {classes}")
    return doc


# --------------------------------------------------------------- cheatsheet

def validate_cheatsheet(source_ids):
    path = DATA / "en-te-hi-cheatsheet.json"
    doc = load(path)
    where0 = path.name
    check_envelope(doc, where0, "cheatsheet")

    section_count = 0
    for sheet in doc["sheets"]:
        cls = sheet.get("class")
        check_localized_text(sheet.get("title"), f"{where0}[class {cls}].title")
        seen = set()
        for sec in sheet["sections"]:
            sid = sec.get("id", "<no id>")
            where = f"{where0}[class {cls}][{sid}]"
            ok()
            section_count += 1

            if sid in seen:
                fail(where, "duplicate section id")
            seen.add(sid)
            if sec.get("category") not in CATEGORIES:
                fail(where, f"category {sec.get('category')!r} is not in the taxonomy")
            check_localized_text(sec.get("title"), f"{where}.title")
            if "summary" in sec:
                check_localized_text(sec["summary"], f"{where}.summary")
            link = sec.get("quizLink") or {}
            if "category" in link and link["category"] not in CATEGORIES:
                fail(where, f"quizLink.category {link['category']!r} is not in the taxonomy")

            stype = sec.get("type")
            if stype == "table":
                cols = sec.get("columns") or []
                for i, col in enumerate(cols):
                    check_localized_text(col, f"{where}.columns[{i}]")
                for r, row in enumerate(sec.get("rows") or []):
                    if len(row) != len(cols):
                        fail(where, f"row {r} has {len(row)} cells but there are {len(cols)} columns")
                    for c, cell in enumerate(row):
                        check_localized_text(cell, f"{where}.rows[{r}][{c}]")
            elif stype in ("rules", "vocab-list", "phrase-list", "tips"):
                required_keys = {
                    "rules": ["rule"],
                    "vocab-list": ["term"],
                    "phrase-list": ["phrase", "meaning"],
                    "tips": ["tip"],
                }[stype]
                for i, item in enumerate(sec.get("items") or []):
                    for key in required_keys:
                        if key not in item:
                            fail(where, f"items[{i}] missing '{key}'")
                        else:
                            check_localized_text(item[key], f"{where}.items[{i}].{key}")
                    for i2, ex in enumerate(item.get("examples") or []):
                        check_localized_text(ex, f"{where}.items[{i}].examples[{i2}]")
                    if "note" in item:
                        check_localized_text(item["note"], f"{where}.items[{i}].note")
                    if "example" in item:
                        check_localized_text(item["example"], f"{where}.items[{i}].example")
                    src = item.get("sourceId")
                    if src and src not in source_ids:
                        fail(where, f"items[{i}].sourceId '{src}' matches no entry in any source file")
            else:
                fail(where, f"unknown section type {stype!r}")

    print(f"  cheatsheet: {len(doc['sheets'])} sheets, {section_count} sections, "
          f"classes {[s['class'] for s in doc['sheets']]}")


# ------------------------------------------------------------- json schemas

def validate_schemas_parse():
    for p in sorted(SCHEMAS.glob("*.json")):
        ok()
        try:
            load(p)
        except json.JSONDecodeError as exc:
            fail(p.name, f"invalid JSON: {exc}")
    print(f"  schemas: {len(list(SCHEMAS.glob('*.json')))} files parsed")


def validate_against_schemas():
    try:
        from jsonschema import Draft202012Validator
        from referencing import Registry, Resource
    except ImportError:
        print("  (jsonschema not installed - skipping formal schema validation)")
        return

    resources = []
    for p in SCHEMAS.glob("*.json"):
        resources.append((p.name, Resource.from_contents(load(p))))
    registry = Registry().with_resources(resources)

    pairs = [("en-te-hi-questions.json", "questions.schema.json"),
             ("en-te-hi-cheatsheet.json", "cheatsheet.schema.json")]
    pairs += [(f, f"{t}.schema.json") for f, t in SOURCE_FILES.items()]

    for data_name, schema_name in pairs:
        ok()
        validator = Draft202012Validator(load(SCHEMAS / schema_name), registry=registry)
        for err in validator.iter_errors(load(DATA / data_name)):
            fail(data_name, f"schema: {'/'.join(str(p) for p in err.absolute_path)}: {err.message}")
    print(f"  formal JSON Schema validation ran on {len(pairs)} files")


def main():
    print("Validating en-te-hi data files\n")
    for p in sorted(DATA.glob("*.json")) + sorted(SCHEMAS.glob("*.json")):
        check_no_bom(p)
    validate_schemas_parse()
    validate_questions()

    source_ids = set()
    for filename, filetype in SOURCE_FILES.items():
        doc = validate_source_file(filename, filetype)
        source_ids.update(e["id"] for e in doc["entries"])

    validate_cheatsheet(source_ids)
    validate_against_schemas()

    print()
    if notes:
        print(f"{len(notes)} note(s) - expected with a small sample, no action needed:\n")
        for n in notes:
            print(f"  - {n}")
        print()
    if errors:
        print(f"FAILED - {len(errors)} problem(s):\n")
        for e in errors:
            print(f"  x {e}")
        return 1
    print(f"OK - {checks} checks passed, no problems found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
