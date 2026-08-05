/* quiz-engine.js — Core orchestration for QuizMaster runtime */

(function () {
  'use strict';

  // State
  var config = null;
  var allData = {};
  var questionBank = [];
  var currentStudentIndex = 0;
  var currentQuestionIndex = 0;
  var timerInterval = null;
  var elapsedSeconds = 0;
  var isAnswering = false;

  // Student results: array of { student, score, correct, wrong, skipped, time, history: [] }
  var sessionResults = [];

  // DOM Elements
  var els = {};
  function cacheDom() {
    els.loaderScreen = document.getElementById('loader-screen');
    els.errorScreen = document.getElementById('error-screen');
    els.handoffScreen = document.getElementById('handoff-screen');
    els.quizInterface = document.getElementById('quiz-interface');
    els.resultsScreen = document.getElementById('results-screen');
    
    els.currentStudentName = document.getElementById('current-student-name');
    els.currentScore = document.getElementById('current-score');
    els.currentTime = document.getElementById('current-time');
    els.progressText = document.getElementById('progress-text');
    els.progressCategory = document.getElementById('progress-category');
    els.progressBarFill = document.getElementById('progress-bar-fill');
    
    els.questionTags = document.getElementById('question-tags');
    els.questionText = document.getElementById('question-text');
    els.questionInteractive = document.getElementById('question-interactive');
    els.questionFeedback = document.getElementById('question-feedback');
    els.feedbackIcon = document.getElementById('feedback-icon');
    els.feedbackTitle = document.getElementById('feedback-title');
    els.feedbackExplanation = document.getElementById('feedback-explanation');
    
    els.btnSkip = document.getElementById('btn-skip');
    els.btnNext = document.getElementById('btn-next');
    els.btnEndEarly = document.getElementById('btn-end-early');
    els.btnStartTurn = document.getElementById('btn-start-turn');
  }

  // --- Initialization ---

  function init() {
    cacheDom();
    bindEvents();
    
    // Load config from localStorage
    try {
      var configStr = localStorage.getItem('quizSessionConfig');
      if (configStr) {
        config = JSON.parse(configStr);
      }
    } catch (e) {
      console.error('Failed to parse quizSessionConfig:', e);
    }
    
    if (!config || !config.class) {
      showError(['Session configuration not found. Please start from the setup page.']);
      return;
    }
    
    // One id per session so repeated saves overwrite rather than pile up.
    sessionStartedAt = new Date().toISOString();
    sessionId = 'qs-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

    // Initialize results array
    config.students.forEach(function (studentObj) {
      sessionResults.push({
        student: studentObj.name,
        score: 0,
        correct: 0,
        wrong: 0,
        skipped: 0,
        time: 0,
        history: []
      });
    });

    // Load data
    DataLoader.loadAll('').then(function (result) {
      if (!result.ok) {
        showError(result.errors);
        return;
      }
      allData = result.data;
      startTurn(0);
    }).catch(function (err) {
      showError([err.message || String(err)]);
    });
  }

  function bindEvents() {
    els.btnSkip.addEventListener('click', skipQuestion);
    els.btnNext.addEventListener('click', nextQuestion);
    els.btnEndEarly.addEventListener('click', endQuiz);
    els.btnStartTurn.addEventListener('click', function() {
      els.handoffScreen.classList.add('hidden');
      els.quizInterface.classList.remove('hidden');
      startTimer();
      renderCurrentQuestion();
    });
  }

  function showError(errors) {
    els.loaderScreen.classList.add('hidden');
    els.quizInterface.classList.add('hidden');
    els.errorScreen.classList.remove('hidden');
    var list = document.getElementById('error-messages');
    list.innerHTML = '';
    errors.forEach(function (err) {
      var div = document.createElement('div');
      div.className = 'error-message';
      div.textContent = '• ' + err;
      list.appendChild(div);
    });
  }

  // --- Bank Building & Shuffling ---

  function buildQuestionBank(studentIndex) {
    var cls = config.class;
    var allQuestions = [];
    
    // 1. Static questions (en-te-hi-questions.json)
    // NOTE: the questions file uses `questions` + a singular `class`. Only the five
    // generator SOURCE files use `entries` + a `classes` array — see DATA-SCHEMA.md.
    if (allData.questions && allData.questions.questions) {
      allData.questions.questions.forEach(function(q) {
        if (q.class === cls) {
          allQuestions.push(q);
        }
      });
    }
    
    // 2. Generated questions
    var genData = {
      vocabulary: allData.vocabulary,
      synonyms: allData.synonyms,
      antonyms: allData.antonyms,
      proverbs: allData.proverbs,
      phrases: allData.phrases
    };
    if (window.QuizGenerator) {
      allQuestions = allQuestions.concat(QuizGenerator.generateAll(genData, cls));
    }
    
    // 3. Deduplicate by ID
    var seen = {};
    var unique = [];
    allQuestions.forEach(function(q) {
      if (!seen[q.id]) {
        seen[q.id] = true;
        unique.push(q);
      }
    });
    
    // 4. Apply Filters (Categories & Tags)
    var filtered = unique.filter(function(q) {
      if (config.categories.length > 0 && config.categories.indexOf(q.category) === -1) {
        return false;
      }
      if (config.tags.length > 0) {
        var hasMatch = false;
        var qTags = q.tags || [];
        for (var i = 0; i < config.tags.length; i++) {
          if (qTags.indexOf(config.tags[i]) !== -1) {
            hasMatch = true;
            break;
          }
        }
        if (!hasMatch) return false;
      }
      return true;
    });

    // 5. Shuffle differently for each student (use student index as part of seed)
    var seedStr = 'quiz-' + cls + '-' + studentIndex;
    var rng = window.QuizGenerator ? window.QuizGenerator._createRng(seedStr) : Math.random;
    var shuffled = window.QuizGenerator ? window.QuizGenerator._seededShuffle(filtered, rng) : filtered.sort(function() { return 0.5 - Math.random(); });
    
    // 6. Limit to maxQuestions
    if (config.maxQuestions > 0 && shuffled.length > config.maxQuestions) {
      shuffled = shuffled.slice(0, config.maxQuestions);
    }
    
    return shuffled;
  }


  // --- Turn Management ---

  function startTurn(studentIndex) {
    currentStudentIndex = studentIndex;
    currentQuestionIndex = 0;
    elapsedSeconds = 0;
    isAnswering = false;
    
    questionBank = buildQuestionBank(studentIndex);
    
    els.loaderScreen.classList.add('hidden');
    
    if (questionBank.length === 0) {
      showError(['No questions available for Class ' + config.class + ' with the selected filters.']);
      return;
    }
    
    els.currentStudentName.textContent = config.students[studentIndex].name;
    updateScoreDisplay();
    updateTimeDisplay();
    
    // If multi-student and not the first student, show handoff
    if (config.deviceMode === 'shared' && studentIndex > 0) {
      els.quizInterface.classList.add('hidden');
      els.handoffScreen.classList.remove('hidden');
      document.getElementById('handoff-next-student').textContent = config.students[studentIndex].name;
    } else {
      // First student or single student
      els.quizInterface.classList.remove('hidden');
      startTimer();
      renderCurrentQuestion();
    }
  }

  function startTimer() {
    stopTimer();
    timerInterval = setInterval(function() {
      elapsedSeconds++;
      updateTimeDisplay();
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function updateTimeDisplay() {
    var m = Math.floor(elapsedSeconds / 60);
    var s = elapsedSeconds % 60;
    els.currentTime.textContent = (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
  }

  function updateScoreDisplay() {
    els.currentScore.textContent = sessionResults[currentStudentIndex].score;
  }

  function updateProgress() {
    var current = currentQuestionIndex + 1;
    var total = questionBank.length;
    els.progressText.textContent = 'Question ' + current + ' of ' + total;
    var pct = (current / total) * 100;
    els.progressBarFill.style.width = pct + '%';
  }

  // --- Rendering ---

  function renderCurrentQuestion() {
    isAnswering = false;
    var q = questionBank[currentQuestionIndex];
    
    updateProgress();
    els.progressCategory.textContent = q.category;
    
    // Tags
    els.questionTags.innerHTML = '';
    (q.tags || []).forEach(function(tag) {
      var span = document.createElement('span');
      span.className = 'tag-badge';
      span.textContent = '#' + tag;
      els.questionTags.appendChild(span);
    });
    
    // Text
    var langs = config.languages;
    els.questionText.innerHTML = '';
    
    var divEn = document.createElement('div');
    divEn.className = 'text-en';
    divEn.textContent = q.text.en || '';
    els.questionText.appendChild(divEn);
    
    if (langs.indexOf('te') !== -1 && q.text.te) {
      var divTe = document.createElement('div');
      divTe.className = 'text-te';
      divTe.textContent = q.text.te;
      els.questionText.appendChild(divTe);
    }
    
    if (langs.indexOf('hi') !== -1 && q.text.hi) {
      var divHi = document.createElement('div');
      divHi.className = 'text-hi';
      divHi.textContent = q.text.hi;
      els.questionText.appendChild(divHi);
    }

    // Reset feedback and action buttons
    els.questionFeedback.classList.add('hidden');
    els.questionFeedback.className = 'question-feedback hidden';
    els.questionInteractive.innerHTML = '';
    els.btnSkip.classList.remove('hidden');
    els.btnNext.classList.add('hidden');
    
    // Call appropriate renderer
    if (!window.QuizRenderers || !window.QuizRenderers[q.type]) {
      els.questionInteractive.innerHTML = '<div style="color:red">Renderer not found for type: ' + q.type + '</div>';
      return;
    }
    
    window.QuizRenderers[q.type](q, langs, els.questionInteractive, handleAnswer);
  }

  // --- Answering & Scoring ---

  function handleAnswer(userAnswerData, isCorrect) {
    if (isAnswering) return; // Prevent double-submit
    isAnswering = true;
    
    var q = questionBank[currentQuestionIndex];
    var res = sessionResults[currentStudentIndex];
    
    if (isCorrect) {
      res.score += 3;
      res.correct++;
      showFeedback('correct', 'Correct! +3', q);
    } else {
      res.score -= 1;
      res.wrong++;
      showFeedback('wrong', 'Incorrect -1', q);
    }
    
    updateScoreDisplay();
    recordHistory(q, userAnswerData, isCorrect, false);
    
    els.btnSkip.classList.add('hidden');
    els.btnNext.classList.remove('hidden');
    els.btnNext.focus();
  }

  function skipQuestion() {
    if (isAnswering) return;
    isAnswering = true;
    
    var q = questionBank[currentQuestionIndex];
    var res = sessionResults[currentStudentIndex];
    
    res.score += 0;
    res.skipped++;
    
    showFeedback('skipped', 'Skipped +0', q);
    recordHistory(q, null, false, true);
    
    els.btnSkip.classList.add('hidden');
    els.btnNext.classList.remove('hidden');
    els.btnNext.focus();
  }

  function showFeedback(type, title, q) {
    els.questionFeedback.className = 'question-feedback ' + type;
    
    var icon = '';
    if (type === 'correct') icon = '✅';
    else if (type === 'wrong') icon = '❌';
    else icon = '⏭️';
    
    els.feedbackIcon.textContent = icon;
    els.feedbackTitle.textContent = title;
    
    els.feedbackExplanation.innerHTML = '';
    if (q.explanation && q.explanation.en) {
      els.feedbackExplanation.textContent = '💡 ' + q.explanation.en;
    }
    
    // For Match Pairs and Drag Drop, show correct answer text if missed/skipped
    if ((type === 'wrong' || type === 'skipped') && q.options) {
        if (q.type === 'drag-drop' && q.options.target && q.options.target.en) {
             var div = document.createElement('div');
             div.style.marginTop = '8px';
             div.innerHTML = '<strong>Correct:</strong> ' + q.options.target.en;
             els.feedbackExplanation.appendChild(div);
        }
        else if (q.type === 'match-pairs' && q.options.left && q.options.right) {
             // simplified feedback for match pairs just indicating they missed it. 
             // detailed review is in the results screen
             var div2 = document.createElement('div');
             div2.style.marginTop = '8px';
             div2.innerHTML = 'Review the correct pairs in the results screen.';
             els.feedbackExplanation.appendChild(div2);
        }
    }
    
    els.questionFeedback.classList.remove('hidden');
  }

  function recordHistory(q, userAnswerData, isCorrect, skipped) {
    sessionResults[currentStudentIndex].history.push({
      question: q,
      userAnswer: userAnswerData,
      isCorrect: isCorrect,
      skipped: skipped
    });
    // Save after every question so closing the tab mid-quiz does not lose the turn.
    persistResults(false);
  }

  // ─── Results persistence ────────────────────────────────────────────────
  // quizSessionResults  → the current session, full per-question detail.
  // quizResultsHistory  → summaries of the last HISTORY_LIMIT completed sessions.
  // The split keeps a shared classroom device from filling its localStorage quota:
  // only one session ever holds per-question records.

  var RESULTS_KEY = 'quizSessionResults';
  var HISTORY_KEY = 'quizResultsHistory';
  var HISTORY_LIMIT = 20;

  var sessionId = null;
  var sessionStartedAt = null;
  var persistFailed = false;

  function slimAnswer(entry) {
    var q = entry.question || {};
    return {
      questionId: q.id || null,
      type: q.type || null,
      category: q.category || null,
      // English stem only — enough for a teacher to read the review back.
      stem: (q.text && q.text.en) ? String(q.text.en).slice(0, 140) : '',
      result: entry.skipped ? 'skipped' : (entry.isCorrect ? 'correct' : 'wrong')
    };
  }

  function buildResultsRecord(completed) {
    return {
      resultsVersion: '1.0.0',
      sessionId: sessionId,
      startedAt: sessionStartedAt,
      updatedAt: new Date().toISOString(),
      completedAt: completed ? new Date().toISOString() : null,
      class: config.class,
      languages: config.languages,
      categories: config.categories,
      tags: config.tags,
      students: sessionResults.map(function (res, i) {
        var s = (config.students && config.students[i]) || {};
        return {
          name: res.student,
          section: s.section || '',
          rollNumber: s.rollNumber || '',
          admissionNumber: s.admissionNumber || '',
          parentPhone: s.parentPhone || '',
          score: res.score,
          correct: res.correct,
          wrong: res.wrong,
          skipped: res.skipped,
          timeSeconds: res.time,
          questionCount: res.history.length,
          maxScore: res.history.length * 3,
          answers: res.history.map(slimAnswer)
        };
      })
    };
  }

  function persistResults(completed) {
    if (!config || !sessionId) return;

    var record = buildResultsRecord(completed);
    try {
      localStorage.setItem(RESULTS_KEY, JSON.stringify(record));
      persistFailed = false;
    } catch (err) {
      // Quota or private-browsing failure must never interrupt the quiz.
      if (!persistFailed) {
        persistFailed = true;
        if (window.console) console.error('[QuizMaster] could not save results:', err);
      }
      return;
    }

    if (completed) appendToHistory(record);
  }

  function appendToHistory(record) {
    var summary = {
      sessionId: record.sessionId,
      completedAt: record.completedAt,
      class: record.class,
      studentCount: record.students.length,
      students: record.students.map(function (s) {
        return {
          name: s.name,
          rollNumber: s.rollNumber,
          score: s.score,
          correct: s.correct,
          wrong: s.wrong,
          skipped: s.skipped,
          timeSeconds: s.timeSeconds,
          maxScore: s.maxScore
        };
      })
    };

    var list = readJson(HISTORY_KEY);
    if (!Array.isArray(list)) list = [];
    // Replace any earlier write for this same session rather than duplicating it.
    list = list.filter(function (r) { return r && r.sessionId !== summary.sessionId; });
    list.unshift(summary);
    if (list.length > HISTORY_LIMIT) list = list.slice(0, HISTORY_LIMIT);

    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch (err) {
      if (window.console) console.error('[QuizMaster] could not save results history:', err);
    }
  }

  function readJson(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function nextQuestion() {
    currentQuestionIndex++;
    if (currentQuestionIndex < questionBank.length) {
      renderCurrentQuestion();
    } else {
      endTurn();
    }
  }

  function endQuiz() {
    if (confirm('Are you sure you want to end the quiz early? Unanswered questions will be counted as skipped.')) {
      // Mark remaining as skipped. `isAnswering` is still true when the current
      // question has already been answered or skipped but "Next" was not pressed —
      // starting the loop at currentQuestionIndex would count that one twice.
      var res = sessionResults[currentStudentIndex];
      var firstUnanswered = isAnswering ? currentQuestionIndex + 1 : currentQuestionIndex;
      for (var i = firstUnanswered; i < questionBank.length; i++) {
        res.skipped++;
        recordHistory(questionBank[i], null, false, true);
      }
      endTurn();
    }
  }

  function endTurn() {
    stopTimer();
    sessionResults[currentStudentIndex].time = elapsedSeconds;

    var isLastStudent = currentStudentIndex + 1 >= config.students.length;
    // Persist before handing over: startTurn() resets the timer and index.
    persistResults(isLastStudent);

    if (!isLastStudent) {
      // Pass to next student
      startTurn(currentStudentIndex + 1);
    } else {
      // All students finished
      els.quizInterface.classList.add('hidden');
      if (window.QuizResults) {
        window.QuizResults.show(sessionResults, config, allData);
      } else {
        showError(['QuizResults module not found.']);
      }
    }
  }

  // Kickoff
  document.addEventListener('DOMContentLoaded', init);

  // Read-only surface for later phases (reports, exports) and for debugging.
  window.QuizEngine = {
    RESULTS_KEY: RESULTS_KEY,
    HISTORY_KEY: HISTORY_KEY,
    getSavedResults: function () { return readJson(RESULTS_KEY); },
    getResultsHistory: function () { return readJson(HISTORY_KEY) || []; }
  };

})();
