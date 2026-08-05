/* QuizMaster homepage — session setup.
 *
 * Framework-free. Reads the Phase 1 data files to drive the category, tag and
 * class controls, and falls back to a baked-in snapshot when they cannot be
 * fetched (opening this file straight off disk blocks fetch in most browsers).
 *
 * Phase 3 hook: replace handOffToQuizEngine() at the bottom of this file.
 */
(function () {
  'use strict';

  // ───────────────────────────────── Config ─────────────────────────────────

  var STORAGE_KEY = 'quizSessionConfig';
  var CONFIG_VERSION = '1.0.0';

  var SCHEMA_URL = 'schemas/common.schema.json';
  var DATA_URLS = [
    'data/en-te-hi-questions.json',
    'data/en-te-hi-vocabulary-dictionary.json',
    'data/en-te-hi-synonyms.json',
    'data/en-te-hi-antonyms.json',
    'data/en-te-hi-proverbs.json',
    'data/en-te-hi-phrases.json',
    'data/en-te-hi-cheatsheet.json'
  ];

  var LANGUAGES = [
    { code: 'en', label: 'English', native: 'English' },
    { code: 'te', label: 'Telugu', native: 'తెలుగు' },
    { code: 'hi', label: 'Hindi', native: 'हिन्दी' }
  ];

  // Mirrors common.schema.json#/$defs/category — used only when the fetch fails.
  var FALLBACK_CATEGORIES = [
    'Vocabulary Building', 'Sentence Formation', 'Grammar', 'Phrase Learning',
    'Idioms & Expressions', 'Reading Comprehension', 'Conversation Understanding',
    'Response Formation', 'Fluency Practice (Written)', 'Speaking Patterns',
    'Question Formation', 'Error Correction', 'Paraphrasing', 'Story Completion',
    'Situational English', 'Formal vs Informal English', 'Pronunciation Awareness'
  ];

  var FALLBACK_TAGS = [
    'adjectives', 'advanced', 'agreement', 'antonyms', 'beginner', 'completion',
    'conversation', 'daily', 'emotions', 'family', 'generated', 'history', 'idioms',
    'intermediate', 'matching', 'nature', 'phrases', 'politeness', 'pronouns',
    'proverbs', 'quick-check', 'recall', 'register', 'reverse', 'school',
    'silent-letters', 'situational', 'speaking', 'spelling', 'sports', 'synonyms',
    'tenses', 'travel', 'values', 'verbs', 'vocabulary', 'voice', 'word-order',
    'work', 'writing'
  ];

  var DIFFICULTY_TAGS = ['beginner', 'intermediate', 'advanced'];

  // One definition drives rendering, validation and the saved payload. Flip
  // `required` here to change what blocks the Start button.
  var STUDENT_FIELDS = [
    {
      key: 'name', label: 'Full name', type: 'text', required: true,
      autocomplete: 'name', placeholder: 'e.g. Ananya Rao', maxLength: 60,
      validate: function (v) {
        if (v.length < 2) return 'Enter at least 2 characters.';
        if (!/^[\p{L}\p{M}][\p{L}\p{M}\s.'-]*$/u.test(v)) return 'Letters, spaces, . - and \' only.';
        return '';
      }
    },
    {
      key: 'section', label: 'Section', type: 'text', required: false,
      placeholder: 'e.g. A', maxLength: 12,
      validate: function (v) {
        return /^[\p{L}\p{N}\s-]{1,12}$/u.test(v) ? '' : 'Letters and numbers only.';
      }
    },
    {
      key: 'rollNumber', label: 'Roll number', type: 'text', required: true,
      placeholder: 'e.g. 17', maxLength: 20,
      validate: function (v) {
        return /^[\p{L}\p{N}/-]{1,20}$/u.test(v) ? '' : 'Letters, numbers, - and / only.';
      }
    },
    {
      key: 'admissionNumber', label: 'Admission number', type: 'text', required: false,
      placeholder: 'e.g. ADM-2024-118', maxLength: 24,
      validate: function (v) {
        return /^[\p{L}\p{N}/-]{1,24}$/u.test(v) ? '' : 'Letters, numbers, - and / only.';
      }
    },
    {
      key: 'parentPhone', label: 'Parent phone', type: 'tel', required: false,
      autocomplete: 'tel', placeholder: 'e.g. 98765 43210', inputMode: 'tel', maxLength: 18,
      // Stored normalised to bare digits; spaces, +91 and a leading 0 are accepted.
      normalize: function (v) {
        var d = v.replace(/\D/g, '');
        if (d.length === 12 && d.slice(0, 2) === '91') d = d.slice(2);
        if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
        return d;
      },
      validate: function (v, field) {
        var d = field.normalize(v);
        return /^[6-9]\d{9}$/.test(d) ? '' : 'Enter a 10-digit mobile number.';
      }
    }
  ];

  // ────────────────────────────── Runtime state ─────────────────────────────

  var state = {
    categories: FALLBACK_CATEGORIES.slice(),
    tags: FALLBACK_TAGS.slice(),
    customTags: [],
    questionCountByClass: {},   // { 5: 12, 8: 9 } — drives the "no data yet" note
    dataLoaded: false,
    studentSeq: 0
  };

  var el = {};

  function $(id) { return document.getElementById(id); }

  function cacheElements() {
    ['sourceNote', 'restoreBanner', 'restoreBannerText', 'restoreBtn', 'dismissRestoreBtn',
     'sessionForm', 'classSelect', 'languageChips', 'languageError', 'categoryGrid',
     'difficultyChips', 'topicChips', 'customChips', 'customTagInput', 'addTagBtn',
     'customTagError', 'studentList', 'studentsError', 'studentModeHint', 'addStudentBtn',
     'summary', 'startBtn', 'resetBtn', 'handoffPanel', 'handoffJson', 'closeHandoffBtn',
     'studentTemplate', 'cheatsheetLink'].forEach(function (id) { el[id] = $(id); });
  }

  // ────────────────────────────── Data loading ──────────────────────────────

  function fetchJson(url) {
    if (window.location.protocol === 'file:') return Promise.reject(new Error('fetch blocked on file://'));
    return fetch(url, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error(url + ' → HTTP ' + res.status);
      return res.json();
    });
  }

  /* Collect every `tags` / `addTags` array anywhere in a parsed document, and
     count questions per class. Walking the tree keeps this working across all
     seven file shapes without hard-coding each one. */
  function harvest(doc, tagSet) {
    (function walk(node) {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (!node || typeof node !== 'object') return;

      ['tags', 'addTags'].forEach(function (key) {
        if (Array.isArray(node[key])) {
          node[key].forEach(function (t) { if (typeof t === 'string') tagSet.add(t); });
        }
      });

      if (typeof node.class === 'number') {
        state.questionCountByClass[node.class] = (state.questionCountByClass[node.class] || 0) + 1;
      }
      if (Array.isArray(node.classes)) {
        node.classes.forEach(function (c) {
          if (typeof c === 'number') {
            state.questionCountByClass[c] = (state.questionCountByClass[c] || 0) + 1;
          }
        });
      }
      Object.keys(node).forEach(function (k) { walk(node[k]); });
    })(doc);
  }

  function loadData() {
    var tagSet = new Set();

    var schemaP = fetchJson(SCHEMA_URL).then(function (schema) {
      var enumList = schema && schema.$defs && schema.$defs.category && schema.$defs.category.enum;
      if (Array.isArray(enumList) && enumList.length) state.categories = enumList.slice();
      return true;
    });

    var dataP = Promise.all(DATA_URLS.map(function (url) {
      return fetchJson(url).then(function (doc) { harvest(doc, tagSet); return true; });
    }));

    return Promise.all([schemaP, dataP]).then(function () {
      if (tagSet.size) state.tags = Array.from(tagSet).sort();
      state.dataLoaded = true;
      note('Loaded ' + state.categories.length + ' categories and ' + state.tags.length +
           ' tags from the data files.', false);
    }).catch(function (err) {
      // Most likely file:// — fetch is blocked, which is not an error worth shouting about.
      state.dataLoaded = false;
      note('Using built-in defaults. Serve this folder over http:// to read data/ directly.', true);
      if (window.console) console.info('[QuizMaster] data fetch failed, using fallbacks:', err.message);
    });
  }

  function note(text, isFallback) {
    el.sourceNote.textContent = (isFallback ? '⚠ ' : '✓ ') + text;
  }

  // ─────────────────────────────── Rendering ────────────────────────────────

  function renderClasses() {
    var frag = document.createDocumentFragment();
    for (var c = 1; c <= 10; c++) {
      var opt = document.createElement('option');
      opt.value = String(c);
      var count = state.questionCountByClass[c] || 0;
      opt.textContent = 'Class ' + c + (state.dataLoaded && !count ? ' · no content yet' : '');
      frag.appendChild(opt);
    }
    el.classSelect.innerHTML = '';
    el.classSelect.appendChild(frag);

    // Prefer a class that actually has content in the sample data.
    var withData = Object.keys(state.questionCountByClass)
      .map(Number).filter(function (c) { return c >= 1 && c <= 10; }).sort(function (a, b) { return a - b; });
    el.classSelect.value = String(withData.length ? withData[0] : 5);
  }

  function makeChip(opts) {
    var label = document.createElement('label');
    label.className = 'chip';

    var input = document.createElement('input');
    input.type = 'checkbox';
    input.value = opts.value;
    input.name = opts.name;
    if (opts.checked) input.checked = true;

    var span = document.createElement('span');
    span.appendChild(document.createTextNode(opts.label));
    if (opts.native) {
      var nat = document.createElement('span');
      nat.className = 'native';
      nat.textContent = opts.native;
      span.appendChild(nat);
    }
    if (opts.onRemove) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip-remove';
      btn.setAttribute('aria-label', 'Remove tag ' + opts.value);
      btn.textContent = '×';
      btn.addEventListener('click', function (e) { e.preventDefault(); opts.onRemove(); });
      span.appendChild(btn);
    }

    label.appendChild(input);
    label.appendChild(span);
    return label;
  }

  function renderLanguages() {
    el.languageChips.innerHTML = '';
    LANGUAGES.forEach(function (lang) {
      el.languageChips.appendChild(makeChip({
        value: lang.code, name: 'language', label: lang.label,
        native: lang.code === 'en' ? '' : lang.native,
        checked: true
      }));
    });
  }

  function renderCategories() {
    el.categoryGrid.innerHTML = '';
    state.categories.forEach(function (cat) {
      var label = document.createElement('label');
      label.className = 'check';
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'category';
      input.value = cat;
      label.appendChild(input);
      label.appendChild(document.createTextNode(cat));
      el.categoryGrid.appendChild(label);
    });
  }

  function renderTags() {
    el.difficultyChips.innerHTML = '';
    el.topicChips.innerHTML = '';

    state.tags.forEach(function (tag) {
      var chip = makeChip({ value: tag, name: 'tag', label: tag });
      (DIFFICULTY_TAGS.indexOf(tag) !== -1 ? el.difficultyChips : el.topicChips).appendChild(chip);
    });

    if (!el.difficultyChips.children.length) {
      el.difficultyChips.innerHTML = '<p class="hint" style="margin:0">No difficulty tags found.</p>';
    }
    renderCustomTags();
  }

  function renderCustomTags() {
    el.customChips.innerHTML = '';
    state.customTags.forEach(function (tag) {
      el.customChips.appendChild(makeChip({
        value: tag, name: 'tag', label: tag, checked: true,
        onRemove: function () {
          state.customTags = state.customTags.filter(function (t) { return t !== tag; });
          renderCustomTags();
          update();
        }
      }));
    });
  }

  // ──────────────────────────────── Students ────────────────────────────────

  function addStudent(values) {
    var index = el.studentList.children.length + 1;
    var uid = 'st' + (++state.studentSeq);

    var node = el.studentTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.uid = uid;
    node.querySelector('[data-role="index"]').textContent = String(index);

    var fieldsWrap = node.querySelector('[data-role="fields"]');
    STUDENT_FIELDS.forEach(function (field) {
      var inputId = uid + '-' + field.key;

      var wrap = document.createElement('div');
      wrap.className = 'field';

      var label = document.createElement('label');
      label.setAttribute('for', inputId);
      label.appendChild(document.createTextNode(field.label + ' '));
      if (field.required) {
        var star = document.createElement('span');
        star.className = 'req';
        star.setAttribute('aria-hidden', 'true');
        star.textContent = '*';
        label.appendChild(star);
      }

      var input = document.createElement('input');
      input.type = field.type || 'text';
      input.id = inputId;
      input.dataset.key = field.key;
      input.placeholder = field.placeholder || '';
      if (field.maxLength) input.maxLength = field.maxLength;
      if (field.autocomplete) input.autocomplete = field.autocomplete;
      if (field.inputMode) input.inputMode = field.inputMode;
      if (field.required) input.required = true;
      if (values && values[field.key]) input.value = values[field.key];

      var err = document.createElement('p');
      err.className = 'field-error';
      err.id = inputId + '-error';
      input.setAttribute('aria-describedby', err.id);

      wrap.appendChild(label);
      wrap.appendChild(input);
      wrap.appendChild(err);
      fieldsWrap.appendChild(wrap);
    });

    node.querySelector('[data-role="remove"]').addEventListener('click', function () {
      node.remove();
      renumberStudents();
      update();
    });

    el.studentList.appendChild(node);
    renumberStudents();
    return node;
  }

  function renumberStudents() {
    var cards = el.studentList.querySelectorAll('[data-student]');
    cards.forEach(function (card, i) {
      card.querySelector('[data-role="index"]').textContent = String(i + 1);
      // Never let the last student be removed — a session needs at least one.
      card.querySelector('[data-role="remove"]').disabled = cards.length === 1;
    });
    el.studentModeHint.textContent = cards.length === 1
      ? 'One student on this device. Add more if a group is sharing it.'
      : cards.length + ' students will share this device and take the quiz in turn.';
  }

  /* Reads the cards and validates. Returns { students, errors } where `errors`
     is empty only when every required field passes. */
  function collectStudents(showErrors) {
    var students = [];
    var errors = [];
    var rollSeen = Object.create(null);

    el.studentList.querySelectorAll('[data-student]').forEach(function (card, i) {
      var record = { id: card.dataset.uid };
      var cardOk = true;

      STUDENT_FIELDS.forEach(function (field) {
        var input = card.querySelector('[data-key="' + field.key + '"]');
        var errBox = document.getElementById(input.id + '-error');
        var raw = input.value.trim();
        var message = '';

        if (!raw) {
          if (field.required) message = field.label + ' is required.';
        } else if (field.validate) {
          message = field.validate(raw, field) || '';
        }

        // Duplicate roll numbers inside one session are almost always a typo.
        if (!message && field.key === 'rollNumber' && raw) {
          var key = raw.toLowerCase();
          if (rollSeen[key]) {
            message = 'Roll number already used by student ' + rollSeen[key] + '.';
          } else {
            rollSeen[key] = i + 1;
          }
        }

        if (message) {
          cardOk = false;
          errors.push('Student ' + (i + 1) + ': ' + message);
        }

        if (showErrors) {
          errBox.textContent = message;
          input.setAttribute('aria-invalid', message ? 'true' : 'false');
        }

        record[field.key] = raw && field.normalize ? field.normalize(raw) : raw;
      });

      if (cardOk) students.push(record);
    });

    return { students: students, errors: errors };
  }

  // ─────────────────────────────── Validation ───────────────────────────────

  function checkedValues(name) {
    return Array.from(el.sessionForm.querySelectorAll('input[name="' + name + '"]:checked'))
      .map(function (input) { return input.value; });
  }

  function buildConfig() {
    var languages = checkedValues('language');
    // Custom tags live outside the fetched list but share the `tag` checkbox name.
    var tags = Array.from(new Set(checkedValues('tag')));

    return {
      configVersion: CONFIG_VERSION,
      createdAt: new Date().toISOString(),
      class: Number(el.classSelect.value),
      languages: LANGUAGES.map(function (l) { return l.code; })
        .filter(function (c) { return languages.indexOf(c) !== -1; }),   // stable en/te/hi order
      categories: checkedValues('category'),   // [] means: no category filter
      tags: tags,                               // [] means: no tag filter
      students: [],
      deviceMode: 'shared'
    };
  }

  function validate(showErrors) {
    var problems = [];
    var languages = checkedValues('language');

    if (!languages.length) problems.push('Pick at least one language.');
    if (showErrors) {
      el.languageError.textContent = languages.length ? '' : 'Pick at least one language.';
      el.languageError.hidden = !!languages.length;
    }

    var result = collectStudents(showErrors);
    var cardCount = el.studentList.querySelectorAll('[data-student]').length;

    if (!cardCount) problems.push('Add at least one student.');
    problems = problems.concat(result.errors);

    if (showErrors) {
      var n = result.errors.length;
      var msg = n ? (n === 1 ? '1 field needs attention.' : n + ' fields need attention.') : '';
      el.studentsError.textContent = msg;
      el.studentsError.hidden = !msg;
    }

    return { ok: problems.length === 0, problems: problems, students: result.students };
  }

  function update() {
    var check = validate(false);
    el.startBtn.disabled = !check.ok;

    // Cheatsheet is browsable without starting a quiz; keep it on the chosen class.
    if (el.cheatsheetLink) {
      el.cheatsheetLink.href = 'cheatsheet.html?class=' + el.classSelect.value;
    }

    var langs = checkedValues('language').length;
    var cats = checkedValues('category').length;
    var tags = Array.from(new Set(checkedValues('tag'))).length;
    var students = el.studentList.querySelectorAll('[data-student]').length;

    var parts = [
      '<strong>Class ' + el.classSelect.value + '</strong>',
      langs + ' language' + (langs === 1 ? '' : 's'),
      (cats || 'all') + ' categor' + (cats === 1 ? 'y' : 'ies'),
      (tags || 'all') + ' tag' + (tags === 1 ? '' : 's'),
      students + ' student' + (students === 1 ? '' : 's')
    ];

    var status = check.ok
      ? '<span class="ready">Ready to start</span>'
      : '<span class="blocked">' + check.problems.length + ' item' +
        (check.problems.length === 1 ? '' : 's') + ' to fix</span>';

    el.summary.innerHTML = parts.join(' · ') + ' — ' + status;
  }

  // ────────────────────────────── Custom tags ───────────────────────────────

  function addCustomTag() {
    var raw = el.customTagInput.value.trim().toLowerCase();
    var message = '';

    if (!raw) {
      message = 'Type a tag first.';
    } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(raw)) {
      message = 'Use lowercase letters, numbers and hyphens (e.g. revision-week).';
    } else if (state.tags.indexOf(raw) !== -1) {
      message = '"' + raw + '" is already in the list above — tick it there.';
    } else if (state.customTags.indexOf(raw) !== -1) {
      message = '"' + raw + '" has already been added.';
    }

    el.customTagError.textContent = message;
    el.customTagError.hidden = !message;
    if (message) return;

    state.customTags.push(raw);
    el.customTagInput.value = '';
    renderCustomTags();
    update();
  }

  // ─────────────────────────── Save / restore / reset ───────────────────────

  function readSaved() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function showRestoreBanner() {
    var saved = readSaved();
    if (!saved || !saved.students) return;

    var when = saved.createdAt ? new Date(saved.createdAt) : null;
    var stamp = when && !isNaN(when) ? when.toLocaleString() : 'earlier';
    el.restoreBannerText.textContent =
      'Found a saved setup from ' + stamp + ' — Class ' + saved.class + ', ' +
      saved.students.length + ' student' + (saved.students.length === 1 ? '' : 's') + '.';
    el.restoreBanner.hidden = false;
  }

  function applyConfig(cfg) {
    if (!cfg) return;

    if (cfg.class) el.classSelect.value = String(cfg.class);

    setChecked('language', cfg.languages || []);
    setChecked('category', cfg.categories || []);

    // Any saved tag not in the fetched list is restored as a custom chip.
    var known = [];
    var custom = [];
    (cfg.tags || []).forEach(function (t) {
      (state.tags.indexOf(t) !== -1 ? known : custom).push(t);
    });
    state.customTags = custom;
    renderCustomTags();
    setChecked('tag', known.concat(custom));

    el.studentList.innerHTML = '';
    var list = (cfg.students && cfg.students.length) ? cfg.students : [null];
    list.forEach(function (s) { addStudent(s); });

    update();
  }

  function setChecked(name, values) {
    el.sessionForm.querySelectorAll('input[name="' + name + '"]').forEach(function (input) {
      input.checked = values.indexOf(input.value) !== -1;
    });
  }

  function resetForm() {
    el.sessionForm.querySelectorAll('input[name="category"], input[name="tag"]')
      .forEach(function (i) { i.checked = false; });
    setChecked('language', ['en', 'te', 'hi']);
    state.customTags = [];
    renderCustomTags();
    renderClasses();
    el.studentList.innerHTML = '';
    addStudent();
    el.handoffPanel.hidden = true;
    el.languageError.hidden = true;
    el.studentsError.hidden = true;
    el.customTagError.hidden = true;
    update();
  }

  // ──────────────────────────────── Submit ──────────────────────────────────

  function onSubmit(event) {
    event.preventDefault();

    var check = validate(true);
    if (!check.ok) {
      update();
      var firstBad = el.sessionForm.querySelector('[aria-invalid="true"]');
      if (firstBad) firstBad.focus();
      return;
    }

    var config = buildConfig();
    config.students = check.students;
    config.deviceMode = check.students.length > 1 ? 'shared' : 'single';

    var stored = true;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (err) {
      stored = false;
      if (window.console) console.error('[QuizMaster] could not write localStorage:', err);
    }

    el.handoffJson.textContent = JSON.stringify(config, null, 2);
    el.handoffPanel.hidden = false;
    if (!stored) {
      el.handoffJson.textContent =
        '/* localStorage unavailable — config not persisted */\n\n' + el.handoffJson.textContent;
    }
    el.handoffPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    handOffToQuizEngine(config);
  }

  /* ── Phase 3 hook ────────────────────────────────────────────────────────
     Replace the body of this function with the quiz engine launch. The config
     is already persisted at localStorage["quizSessionConfig"] by the time this
     runs, so the engine can equally well read it from there on a fresh page. */
  function handOffToQuizEngine(config) {
    // Config is already saved in localStorage by startQuiz().
    // Navigate to the standalone quiz page.
    window.location.href = 'quiz.html';
  }

  // ───────────────────────────────── Wiring ─────────────────────────────────

  function bindEvents() {
    el.sessionForm.addEventListener('submit', onSubmit);

    // Re-validate as the user types, but only show field errors once they leave.
    el.sessionForm.addEventListener('input', function (e) {
      if (e.target.matches('[data-key]')) {
        var err = document.getElementById(e.target.id + '-error');
        if (err && err.textContent) { err.textContent = ''; e.target.setAttribute('aria-invalid', 'false'); }
      }
      update();
    });
    el.sessionForm.addEventListener('change', update);
    el.sessionForm.addEventListener('focusout', function (e) {
      if (e.target.matches('[data-key]')) validate(true);
    });

    el.addStudentBtn.addEventListener('click', function () {
      var card = addStudent();
      update();
      var first = card.querySelector('input');
      if (first) first.focus();
    });

    el.addTagBtn.addEventListener('click', addCustomTag);
    el.customTagInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); }
    });

    document.querySelectorAll('[data-bulk]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name = btn.dataset.bulk === 'categories' ? 'category' : 'tag';
        var on = btn.dataset.action === 'all';
        el.sessionForm.querySelectorAll('input[name="' + name + '"]')
          .forEach(function (i) { i.checked = on; });
        update();
      });
    });

    el.resetBtn.addEventListener('click', resetForm);
    el.closeHandoffBtn.addEventListener('click', function () { el.handoffPanel.hidden = true; });

    el.restoreBtn.addEventListener('click', function () {
      applyConfig(readSaved());
      el.restoreBanner.hidden = true;
    });
    el.dismissRestoreBtn.addEventListener('click', function () { el.restoreBanner.hidden = true; });
  }

  function init() {
    cacheElements();
    renderLanguages();
    renderCategories();
    renderTags();
    renderClasses();
    addStudent();
    bindEvents();
    update();

    loadData().then(function () {
      renderCategories();
      renderTags();
      renderClasses();
      update();
      showRestoreBanner();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Small surface for Phase 3 / manual testing.
  window.QuizHome = {
    STORAGE_KEY: STORAGE_KEY,
    getSavedConfig: readSaved,
    addStudent: addStudent,
    validate: function () { return validate(false); }
  };
})();
