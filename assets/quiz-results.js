/* quiz-results.js — Results screen and Cheatsheet viewer */

(function () {
  'use strict';

  var els = {};
  function cacheDom() {
    els.resultsScreen = document.getElementById('results-screen');
    els.cheatsheetScreen = document.getElementById('cheatsheet-screen');
    
    // Results
    els.resultsStudentName = document.getElementById('results-student-name');
    els.gaugeFill = document.getElementById('gauge-fill');
    els.scorePercentage = document.getElementById('score-percentage');
    els.scoreTotal = document.getElementById('score-total');
    els.statCorrect = document.getElementById('stat-correct');
    els.statWrong = document.getElementById('stat-wrong');
    els.statSkipped = document.getElementById('stat-skipped');
    els.statTime = document.getElementById('stat-time');
    els.reviewList = document.getElementById('review-list');
    
    els.btnNextStudent = document.getElementById('btn-results-next');
    els.btnViewCheatsheet = document.getElementById('btn-view-cheatsheet');
    els.btnBackHome = document.getElementById('btn-back-home');
    
    // Cheatsheet
    els.btnCloseCheatsheet = document.getElementById('btn-close-cheatsheet');
    els.cheatsheetClassBadge = document.getElementById('cheatsheet-class-badge');
    els.cheatsheetTabs = document.getElementById('cheatsheet-tabs');
    els.cheatsheetContent = document.getElementById('cheatsheet-content');
  }

  var currentConfig = null;
  var allDataRef = null;
  var allResults = null;
  var currentResultIndex = 0;

  // --- Results Screen ---

  function showResults(resultsArray, config, allData) {
    if (!els.resultsScreen) cacheDom();
    currentConfig = config;
    allDataRef = allData;
    allResults = resultsArray;
    currentResultIndex = 0;
    
    renderResult(allResults[currentResultIndex]);
    els.resultsScreen.classList.remove('hidden');
    
    bindEvents();
  }

  function renderResult(res) {
    els.resultsStudentName.textContent = res.student + "'s Results";
    
    // Calculate max possible score (+3 per question)
    var totalQuestions = res.history.length;
    var maxPossible = totalQuestions * 3;
    var pct = maxPossible > 0 ? Math.max(0, Math.round((res.score / maxPossible) * 100)) : 0;
    
    els.scorePercentage.textContent = pct + '%';
    els.scoreTotal.textContent = res.score + ' / ' + maxPossible + ' pts';
    
    els.statCorrect.textContent = res.correct;
    els.statWrong.textContent = res.wrong;
    els.statSkipped.textContent = res.skipped;
    
    var m = Math.floor(res.time / 60);
    var s = res.time % 60;
    els.statTime.textContent = m + 'm ' + s + 's';
    
    // Animate gauge
    setTimeout(function() {
      // circle length is 283. 0 is full, 283 is empty.
      var offset = 283 - (283 * (pct / 100));
      els.gaugeFill.style.strokeDashoffset = offset;
    }, 100);
    
    renderReview(res.history);
    
    // Multi-student logic for Results
    if (currentResultIndex + 1 < allResults.length) {
      els.btnNextStudent.textContent = 'View ' + allResults[currentResultIndex + 1].student + "'s Results";
      els.btnNextStudent.classList.remove('hidden');
    } else {
      els.btnNextStudent.classList.add('hidden');
    }
  }

  /** label + value, built as text rather than innerHTML. */
  function detailRow(label, value) {
    var row = document.createElement('div');
    row.className = 'review-detail-row';
    var l = document.createElement('span');
    l.className = 'review-label';
    l.textContent = label + ': ';
    row.appendChild(l);
    row.appendChild(document.createTextNode(value));
    return row;
  }

  /** One line per language the student chose, skipping duplicates. */
  function appendLocalized(container, localized) {
    var langs = (currentConfig && currentConfig.languages) || ['en'];
    var seen = [];
    ['en', 'te', 'hi'].forEach(function (lang) {
      if (lang !== 'en' && langs.indexOf(lang) === -1) return;
      var text = localized[lang];
      if (!text || seen.indexOf(text) !== -1) return;
      seen.push(text);
      var div = document.createElement('div');
      if (lang !== 'en') {
        div.style.fontSize = '0.9rem';
        div.style.color = 'var(--text-muted)';
      }
      div.textContent = text;
      container.appendChild(div);
    });
  }

  /** Human-readable correct answer for any question type. */
  function correctAnswerText(q) {
    var o = q.options || {};
    var a = q.correctAnswer;
    try {
      if (q.type === 'mcq') return o.en[a];
      if (q.type === 'flip-card') return o.choices.en[a];
      if (q.type === 'true-false') return a ? (o.en[0] || 'True') : (o.en[1] || 'False');
      if (q.type === 'drag-drop') {
        if (o.target && o.target.en) return o.target.en;
        return a.map(function (i) { return o.tokens.en[i]; }).join(' ');
      }
      if (q.type === 'match-pairs') {
        return a.map(function (pair) {
          return o.left.en[pair[0]] + ' → ' + o.right.en[pair[1]];
        }).join(';  ');
      }
    } catch (e) { /* malformed question — fall through */ }
    return '';
  }

  function renderReview(history) {
    els.reviewList.innerHTML = '';
    
    history.forEach(function(item, i) {
      var q = item.question;
      var el = document.createElement('div');
      el.className = 'review-item';
      
      var header = document.createElement('div');
      header.className = 'review-header';
      
      var qText = document.createElement('div');
      qText.className = 'review-qtext';
      qText.textContent = (i + 1) + '. ' + (q.text.en || 'Question');
      
      var icon = document.createElement('div');
      if (item.isCorrect) {
        icon.className = 'review-icon correct';
        icon.textContent = '✓';
      } else if (item.skipped) {
        icon.className = 'review-icon skipped';
        icon.textContent = '—';
      } else {
        icon.className = 'review-icon wrong';
        icon.textContent = '✗';
      }
      
      header.appendChild(qText);
      header.appendChild(icon);
      
      var body = document.createElement('div');
      body.className = 'review-body hidden';
      
      body.appendChild(detailRow('Type', q.type));

      // The whole point of a review is finding out what you should have put.
      var answer = correctAnswerText(q);
      if (answer) body.appendChild(detailRow('Correct answer', answer));

      if (q.explanation) {
        var expRow = document.createElement('div');
        expRow.className = 'review-detail-row';
        var expLabel = document.createElement('span');
        expLabel.className = 'review-label';
        expLabel.textContent = 'Explanation: ';
        expRow.appendChild(expLabel);
        appendLocalized(expRow, q.explanation);
        body.appendChild(expRow);
      }
      
      header.addEventListener('click', function() {
        body.classList.toggle('hidden');
      });
      
      el.appendChild(header);
      el.appendChild(body);
      els.reviewList.appendChild(el);
    });
  }

  function bindEvents() {
    // Only bind once
    if (els.btnNextStudent.dataset.bound) return;
    els.btnNextStudent.dataset.bound = "true";
    
    els.btnNextStudent.addEventListener('click', function() {
      currentResultIndex++;
      if (currentResultIndex < allResults.length) {
        // Reset gauge for animation
        els.gaugeFill.style.strokeDashoffset = 283;
        renderResult(allResults[currentResultIndex]);
        window.scrollTo(0,0);
      }
    });
    
    els.btnBackHome.addEventListener('click', function() {
      window.location.href = 'index.html';
    });
    
    els.btnViewCheatsheet.addEventListener('click', function() {
      els.resultsScreen.classList.add('hidden');
      openCheatsheet();
    });
    
    els.btnCloseCheatsheet.addEventListener('click', function() {
      els.cheatsheetScreen.classList.add('hidden');
      els.resultsScreen.classList.remove('hidden');
    });
  }

  // --- Cheatsheet Viewer ---

  function openCheatsheet() {
    els.cheatsheetClassBadge.textContent = currentConfig.class;
    
    var csData = allDataRef.cheatsheet;
    if (!csData || !csData.sheets) {
      els.cheatsheetContent.innerHTML = '<p>Cheatsheet data not found.</p>';
      els.cheatsheetScreen.classList.remove('hidden');
      return;
    }
    
    var sheet = csData.sheets.find(function(s) { return s.class === currentConfig.class; });
    if (!sheet) {
      els.cheatsheetContent.innerHTML = '<p>No cheatsheet available for Class ' + currentConfig.class + '.</p>';
      els.cheatsheetScreen.classList.remove('hidden');
      return;
    }
    
    renderCheatsheet(sheet);
    els.cheatsheetScreen.classList.remove('hidden');
  }

  function renderCheatsheet(sheet) {
    // Rendering lives in assets/cheatsheet.js so cheatsheet.html can reuse it.
    if (!window.Cheatsheet) {
      els.cheatsheetContent.innerHTML = '<p>Cheatsheet viewer failed to load.</p>';
      return;
    }
    window.Cheatsheet.render(sheet, els.cheatsheetTabs, els.cheatsheetContent);
  }

  window.QuizResults = {
    show: showResults
  };

})();
