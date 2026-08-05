/* quiz-generator.js — Runtime question generator for QuizMaster.
 *
 * Reads source files (vocabulary, synonyms, antonyms, proverbs, phrases) and
 * their declarative generator specs to produce question objects identical in
 * shape to en-te-hi-questions.json.
 *
 * All randomness is seeded (no Math.random()) so the same data always produces
 * the same question set, which keeps multi-student results comparable.
 *
 * Depends on: nothing (pure logic, no DOM).
 * Loaded before: quiz-engine.js
 *
 * Public API:
 *   QuizGenerator.generateAll(data, selectedClass) → Question[]
 *     data = { vocabulary, synonyms, antonyms, proverbs, phrases }
 */
(function () {
  'use strict';

  var LANGS = ['en', 'te', 'hi'];

  /* Standard labels used by every generated true-false question. */
  var TF_OPTIONS = {
    en: ['True', 'False'],
    te: ['నిజం', 'అబద్ధం'],
    hi: ['सही', 'ग़लत']
  };

  /* Generic flip-card front text. */
  var FLIP_FRONT = {
    en: 'Think of an answer, then tap to reveal.',
    te: 'సమాధానం ఆలోచించండి, తర్వాత చూడటానికి నొక్కండి.',
    hi: 'उत्तर सोचिए, फिर देखने के लिए टैप कीजिए।'
  };

  // ─── Seeded PRNG (mulberry32) ──────────────────────────────────────────

  function hashStr(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h |= 0;
    }
    return h;
  }

  function mulberry32(seed) {
    var s = seed | 0;
    return function () {
      s |= 0;
      s = s + 0x6D2B79F5 | 0;
      var t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function createRng(seedStr) {
    return mulberry32(hashStr(seedStr));
  }

  function seededShuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = (rng() * (i + 1)) | 0;
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // ─── Field resolution ─────────────────────────────────────────────────

  /**
   * Resolve a field for ALL languages, returning { values: {en,te,hi}, index }.
   *
   * For localizedList fields, a single index is picked (using `pick`) and
   * reused across all languages so the parallel arrays stay aligned.
   *
   * @param {Object}   entry     Source entry
   * @param {Object}   selector  { path, pick?, display?, index? }
   * @param {Function} rng       Seeded random number generator
   * @returns {{values: Object, index: number|null}} or null if field missing
   */
  function resolveAllLangs(entry, selector, rng) {
    var field = entry[selector.path];
    if (!field) return null;

    var result = {};
    var pickedIndex = null;

    // Determine if the field value is a list by sampling the English column
    // (all language arrays have the same length — guaranteed by the validator)
    var sampleLang = 'en';
    if (selector.display && selector.display.en) sampleLang = selector.display.en;
    var sample = field[sampleLang];
    if (sample === undefined || sample === null) return null;

    if (Array.isArray(sample)) {
      if (sample.length === 0) return null;
      var pick = selector.pick || 'value';
      switch (pick) {
        case 'first':  pickedIndex = 0; break;
        case 'random': pickedIndex = (rng() * sample.length) | 0; break;
        case 'index':  pickedIndex = (selector.index != null) ? selector.index : 0; break;
        default:       pickedIndex = 0; break; // 'value' on a list → first item
      }
    }

    LANGS.forEach(function (lang) {
      var srcLang = lang;
      if (selector.display && selector.display[lang]) srcLang = selector.display[lang];
      var v = field[srcLang];
      if (v === undefined || v === null) {
        result[lang] = '';
      } else if (Array.isArray(v)) {
        result[lang] = (pickedIndex != null && v[pickedIndex] != null) ? v[pickedIndex] : (v[0] || '');
      } else {
        result[lang] = v;
      }
    });

    return { values: result, index: pickedIndex };
  }

  // ─── Template expansion ───────────────────────────────────────────────

  /**
   * Expand {{field.lang}} and {{answer}} tokens in a localizedText template.
   *
   * @param {Object}      template      { en, te, hi } strings with tokens
   * @param {Object|null} entry         Source entry (for {{field.lang}} lookups)
   * @param {Object|null} answerValues  { en, te, hi } of resolved answer text
   * @returns {Object} { en, te, hi } with tokens replaced
   */
  function expandTemplate(template, entry, answerValues) {
    if (!template) return null;
    var result = {};
    LANGS.forEach(function (lang) {
      var text = template[lang] || '';
      // Replace {{answer}} with the answer text in this language
      if (answerValues) {
        text = text.replace(/\{\{answer\}\}/g, answerValues[lang] || '');
      }
      // Replace {{field.lang}} with entry field values
      if (entry) {
        text = text.replace(/\{\{(\w+)\.(\w+)\}\}/g, function (match, fieldName, fieldLang) {
          var f = entry[fieldName];
          if (!f) return match;
          var v = f[fieldLang];
          if (v === undefined || v === null) return match;
          if (Array.isArray(v)) return v[0] || match;
          return v;
        });
      }
      result[lang] = text;
    });
    return result;
  }

  // ─── Pool widening (distractor gathering) ─────────────────────────────

  function uniqueById(entries) {
    var seen = {};
    return entries.filter(function (e) {
      if (seen[e.id]) return false;
      seen[e.id] = true;
      return true;
    });
  }

  /**
   * Gather distractor entries for a subject entry.
   *
   * Pool widening strategy:
   *   same-class → adjacent classes ±1 → any class in the file
   *
   * Only entries that have the field named by spec.from.path are eligible.
   *
   * @returns {Array|null}  Array of distractor entries, or null if insufficient.
   */
  function gatherDistractorEntries(subject, allEntries, spec, selectedClass) {
    var count    = spec.count;
    var fromPath = spec.from.path;
    var fallback = spec.poolFallback || 'widen';

    // All entries except the subject that have the required field
    var eligible = allEntries.filter(function (e) {
      if (e.id === subject.id) return false;
      var f = e[fromPath];
      return f !== undefined && f !== null;
    });

    // Tier 1: same class
    var sameClass = eligible.filter(function (e) {
      return e.classes && e.classes.indexOf(selectedClass) !== -1;
    });
    if (sameClass.length >= count) return sameClass;

    if (fallback === 'strict') return null;

    // Tier 2: adjacent classes ±1
    var adjacent = eligible.filter(function (e) {
      if (!e.classes) return false;
      return e.classes.indexOf(selectedClass - 1) !== -1 ||
             e.classes.indexOf(selectedClass + 1) !== -1;
    });
    var wider = uniqueById(sameClass.concat(adjacent));
    if (wider.length >= count) return wider;

    // Tier 3: any class in the file
    if (eligible.length >= count) return eligible;

    // Not enough even with the whole file
    return null;
  }

  // ─── Option building ──────────────────────────────────────────────────

  /**
   * Build a localizedList of options (answer + distractors), shuffled.
   *
   * @param {Object}   answerValues       { en, te, hi } of the correct answer
   * @param {Array}    distractorEntries  Entries whose fields become wrong options
   * @param {Object}   fromSelector       fieldSelector for distractors' field
   * @param {Function} rng                Seeded PRNG
   * @returns {{options: Object, correctAnswer: number}}
   */
  function buildOptions(answerValues, distractorEntries, fromSelector, rng) {
    var items = [{ values: answerValues, isAnswer: true }];

    distractorEntries.forEach(function (entry) {
      var resolved = resolveAllLangs(entry, fromSelector, rng);
      if (resolved) {
        items.push({ values: resolved.values, isAnswer: false });
      }
    });

    // Shuffle the combined list
    var shuffled = seededShuffle(items, rng);

    var correctAnswer = -1;
    var options = { en: [], te: [], hi: [] };
    shuffled.forEach(function (item, i) {
      if (item.isAnswer) correctAnswer = i;
      LANGS.forEach(function (lang) {
        options[lang].push(item.values[lang] || '');
      });
    });

    return { options: options, correctAnswer: correctAnswer };
  }

  // ─── Per-entry generator ──────────────────────────────────────────────

  /**
   * Generate questions for one entry using one per-entry generator.
   * Returns an array (may contain 0, 1, or 2 questions for true-false).
   */
  function generatePerEntry(gen, entry, allEntries, sourceFile, selectedClass) {
    var idPrefix = sourceFile.idPrefix || 'gen';
    var baseId   = idPrefix + '-' + gen.id + '-' + entry.id;
    var seedStr  = baseId + '-class' + selectedClass;
    var rng      = createRng(seedStr);

    // Gate: skip entries that lack required fields
    if (gen.requires) {
      for (var i = 0; i < gen.requires.length; i++) {
        var reqField = entry[gen.requires[i]];
        if (reqField === undefined || reqField === null) return [];
      }
    }

    var questions = [];

    // ── true-false: emit BOTH true and false variants ──────────────────
    if (gen.questionType === 'true-false') {
      var answerResolved = resolveAllLangs(entry, gen.answer, rng);
      if (!answerResolved) return [];

      // TRUE variant: use the normal prompt with the real answer
      var trueText = expandTemplate(gen.prompt, entry, answerResolved.values);
      var explanation = gen.explanation
        ? expandTemplate(gen.explanation, entry, answerResolved.values) : null;

      questions.push({
        id:            baseId + '-true',
        class:         selectedClass,
        type:          'true-false',
        category:      gen.category,
        tags:          (gen.addTags || []).slice(),
        text:          trueText,
        options:       { en: TF_OPTIONS.en.slice(), te: TF_OPTIONS.te.slice(), hi: TF_OPTIONS.hi.slice() },
        correctAnswer: true,
        explanation:   explanation,
        source:        { kind: 'generated', generator: gen.id, entry: entry.id }
      });

      // FALSE variant: use falseStatement (if present) with correctAnswer = false
      if (gen.falseStatement) {
        var falseText = expandTemplate(gen.falseStatement, entry, answerResolved.values);
        questions.push({
          id:            baseId + '-false',
          class:         selectedClass,
          type:          'true-false',
          category:      gen.category,
          tags:          (gen.addTags || []).slice(),
          text:          falseText,
          options:       { en: TF_OPTIONS.en.slice(), te: TF_OPTIONS.te.slice(), hi: TF_OPTIONS.hi.slice() },
          correctAnswer: false,
          explanation:   explanation,
          source:        { kind: 'generated', generator: gen.id, entry: entry.id }
        });
      }

      return questions;
    }

    // ── mcq / flip-card: need answer + distractors ─────────────────────
    if (!gen.distractors) return [];

    var answerResolved = resolveAllLangs(entry, gen.answer, rng);
    if (!answerResolved) return [];

    var pool = gatherDistractorEntries(entry, allEntries, gen.distractors, selectedClass);
    if (!pool) return [];

    // Shuffle pool and take exactly `count`
    var picked = seededShuffle(pool, rng).slice(0, gen.distractors.count);
    if (picked.length < gen.distractors.count) return [];

    var optResult = buildOptions(answerResolved.values, picked, gen.distractors.from, rng);

    var text        = expandTemplate(gen.prompt, entry, answerResolved.values);
    var explanation = gen.explanation
      ? expandTemplate(gen.explanation, entry, answerResolved.values) : null;

    var question = {
      id:            baseId,
      class:         selectedClass,
      type:          gen.questionType,
      category:      gen.category,
      tags:          (gen.addTags || []).slice(),
      text:          text,
      correctAnswer: optResult.correctAnswer,
      explanation:   explanation,
      source:        { kind: 'generated', generator: gen.id, entry: entry.id }
    };

    if (gen.questionType === 'flip-card') {
      question.options = {
        front:   { en: FLIP_FRONT.en, te: FLIP_FRONT.te, hi: FLIP_FRONT.hi },
        choices: optResult.options
      };
    } else {
      question.options = optResult.options;
    }

    questions.push(question);
    return questions;
  }

  // ─── Aggregate generator (match-pairs) ────────────────────────────────

  /**
   * Generate one aggregate question (match-pairs) from multiple entries.
   * Returns an array of 0 or 1 questions.
   */
  function generateAggregate(gen, allEntries, sourceFile, selectedClass) {
    var idPrefix  = sourceFile.idPrefix || 'gen';
    var agg       = gen.aggregate;
    var count     = agg.count;
    var minCount  = agg.minCount || 3;
    var seedStr   = idPrefix + '-' + gen.id + '-class' + selectedClass;
    var rng       = createRng(seedStr);

    // Filter: entries must have left+right fields and satisfy `requires`
    var eligible = allEntries.filter(function (entry) {
      if (gen.requires) {
        for (var i = 0; i < gen.requires.length; i++) {
          if (entry[gen.requires[i]] === undefined) return false;
        }
      }
      if (!entry[agg.left.path] || !entry[agg.right.path]) return false;
      return true;
    });

    // Pool widening
    var sameClass = eligible.filter(function (e) {
      return e.classes && e.classes.indexOf(selectedClass) !== -1;
    });

    var pool;
    if (sameClass.length >= count) {
      pool = sameClass;
    } else {
      var adjacent = eligible.filter(function (e) {
        if (!e.classes) return false;
        return e.classes.indexOf(selectedClass - 1) !== -1 ||
               e.classes.indexOf(selectedClass + 1) !== -1;
      });
      pool = uniqueById(sameClass.concat(adjacent));
      if (pool.length < minCount) {
        pool = eligible; // widen to any class
      }
    }

    // Degrade from count to minCount
    var actual = Math.min(count, pool.length);
    if (actual < minCount) return [];

    // Pick entries
    var picked = seededShuffle(pool, rng).slice(0, actual);

    // Build left and right columns (parallel arrays)
    var leftOpts  = { en: [], te: [], hi: [] };
    var rightOpts = { en: [], te: [], hi: [] };

    picked.forEach(function (entry) {
      var leftRes  = resolveAllLangs(entry, agg.left, rng);
      var rightRes = resolveAllLangs(entry, agg.right, rng);
      if (leftRes && rightRes) {
        LANGS.forEach(function (lang) {
          leftOpts[lang].push(leftRes.values[lang] || '');
          rightOpts[lang].push(rightRes.values[lang] || '');
        });
      }
    });

    var pairCount = leftOpts.en.length;
    if (pairCount < minCount) return [];

    // Shuffle right column — same permutation applied to all three language arrays
    var rightIndices = [];
    for (var i = 0; i < pairCount; i++) rightIndices.push(i);
    var shuffledRightIndices = seededShuffle(rightIndices, rng);

    var shuffledRight = { en: [], te: [], hi: [] };
    shuffledRightIndices.forEach(function (origIdx) {
      LANGS.forEach(function (lang) {
        shuffledRight[lang].push(rightOpts[lang][origIdx]);
      });
    });

    // Compute correctAnswer: for each left[i], where did its right partner end up?
    // shuffledRightIndices[newPos] === origIdx
    // So left[i]'s partner (originally at right[i]) is now at newPos where
    // shuffledRightIndices[newPos] === i
    var correctAnswer = [];
    for (var li = 0; li < pairCount; li++) {
      for (var ni = 0; ni < shuffledRightIndices.length; ni++) {
        if (shuffledRightIndices[ni] === li) {
          correctAnswer.push([li, ni]);
          break;
        }
      }
    }

    // Text — aggregate prompts have no entry-specific tokens
    var textResult = {};
    LANGS.forEach(function (lang) {
      textResult[lang] = gen.prompt[lang] || '';
    });

    var entryIds = picked.map(function (e) { return e.id; });

    return [{
      id:            idPrefix + '-' + gen.id + '-class' + selectedClass,
      class:         selectedClass,
      type:          gen.questionType,
      category:      gen.category,
      tags:          (gen.addTags || []).slice(),
      text:          textResult,
      options:       { left: leftOpts, right: shuffledRight },
      correctAnswer: correctAnswer,
      explanation:   null,
      source:        { kind: 'generated', generator: gen.id, entries: entryIds }
    }];
  }

  // ─── Main entry points ────────────────────────────────────────────────

  /**
   * Run every generator in one source file.
   */
  function generateFromSource(sourceFile, selectedClass) {
    if (!sourceFile || !sourceFile.generators || !sourceFile.entries) return [];

    var allEntries   = sourceFile.entries;
    var classEntries = allEntries.filter(function (e) {
      return e.classes && e.classes.indexOf(selectedClass) !== -1;
    });

    if (classEntries.length === 0) return [];

    var questions = [];

    sourceFile.generators.forEach(function (gen) {
      if (gen.aggregate) {
        // Aggregate generator — builds from multiple entries
        questions = questions.concat(
          generateAggregate(gen, allEntries, sourceFile, selectedClass)
        );
      } else {
        // Per-entry generator — one question per qualifying entry
        classEntries.forEach(function (entry) {
          questions = questions.concat(
            generatePerEntry(gen, entry, allEntries, sourceFile, selectedClass)
          );
        });
      }
    });

    return questions;
  }

  /**
   * Generate questions from ALL five source files.
   *
   * @param {Object} data  { vocabulary, synonyms, antonyms, proverbs, phrases }
   * @param {number} selectedClass  e.g. 5 or 8
   * @returns {Array} Array of question objects
   */
  function generateAll(data, selectedClass) {
    var sourceKeys = ['vocabulary', 'synonyms', 'antonyms', 'proverbs', 'phrases'];
    var all = [];

    sourceKeys.forEach(function (key) {
      if (data[key]) {
        all = all.concat(generateFromSource(data[key], selectedClass));
      }
    });

    return all;
  }

  // ─── Public API ───────────────────────────────────────────────────────

  window.QuizGenerator = {
    generateAll:        generateAll,
    generateFromSource: generateFromSource,
    // Exposed for testing / diagnostics only
    _createRng:      createRng,
    _seededShuffle:  seededShuffle,
    _expandTemplate: expandTemplate,
    _resolveAllLangs: resolveAllLangs
  };
})();
