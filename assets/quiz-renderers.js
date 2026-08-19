/* quiz-renderers.js — Renders the interactive UI for the 5 question types */

(function () {
  'use strict';

  function renderMCQ(q, langs, container, onAnswer) {
    var opts = q.options; // { en: [...], te: [...], hi: [...] }
    var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var wrap = document.createElement('div');
    wrap.className = 'mcq-options';

    var btns = [];
    opts.en.forEach(function(optTextEn, i) {
      var btn = document.createElement('button');
      btn.className = 'mcq-option';
      
      var letter = document.createElement('div');
      letter.className = 'mcq-letter';
      letter.textContent = letters[i];
      
      var textWrap = document.createElement('div');
      var enDiv = document.createElement('div');
      enDiv.textContent = optTextEn;
      textWrap.appendChild(enDiv);
      
      if (langs.indexOf('te') !== -1 && opts.te && opts.te[i] && opts.te[i] !== optTextEn) {
        var teDiv = document.createElement('div');
        teDiv.style.fontSize = '0.9rem';
        teDiv.style.color = 'var(--text-muted)';
        teDiv.textContent = opts.te[i];
        textWrap.appendChild(teDiv);
      }
      if (langs.indexOf('hi') !== -1 && opts.hi && opts.hi[i] && opts.hi[i] !== optTextEn && opts.hi[i] !== opts.te[i]) {
        var hiDiv = document.createElement('div');
        hiDiv.style.fontSize = '0.9rem';
        hiDiv.style.color = 'var(--text-muted)';
        hiDiv.textContent = opts.hi[i];
        textWrap.appendChild(hiDiv);
      }
      
      btn.appendChild(letter);
      btn.appendChild(textWrap);
      
      btn.addEventListener('click', function() {
        // Disable all
        btns.forEach(function(b) { b.disabled = true; });
        var isCorrect = (i === q.correctAnswer);
        if (isCorrect) {
          btn.classList.add('correct');
        } else {
          btn.classList.add('wrong');
          // highlight correct one
          btns[q.correctAnswer].classList.add('correct');
        }
        onAnswer(i, isCorrect);
      });
      
      btns.push(btn);
      wrap.appendChild(btn);
    });
    
    container.appendChild(wrap);
  }

  function renderTrueFalse(q, langs, container, onAnswer) {
    var wrap = document.createElement('div');
    wrap.className = 'tf-options';
    
    var tfVals = [true, false];
    // We expect q.options to have the localized labels for True and False at index 0 and 1
    // e.g. { en: ['True', 'False'], te: ['నిజం', 'అబద్ధం'] }
    var opts = q.options;

    var btns = [];
    tfVals.forEach(function(val, i) {
      var btn = document.createElement('button');
      btn.className = 'tf-option';
      
      var enText = opts.en[i] || (val ? 'True' : 'False');
      var enDiv = document.createElement('div');
      enDiv.textContent = enText;
      btn.appendChild(enDiv);
      
      if (langs.indexOf('te') !== -1 && opts.te && opts.te[i] && opts.te[i] !== enText) {
        var teDiv = document.createElement('div');
        teDiv.style.fontSize = '0.9rem';
        teDiv.style.color = 'var(--text-muted)';
        teDiv.style.marginTop = '4px';
        teDiv.textContent = opts.te[i];
        btn.appendChild(teDiv);
      }
      if (langs.indexOf('hi') !== -1 && opts.hi && opts.hi[i] && opts.hi[i] !== enText && opts.hi[i] !== opts.te[i]) {
        var hiDiv = document.createElement('div');
        hiDiv.style.fontSize = '0.9rem';
        hiDiv.style.color = 'var(--text-muted)';
        hiDiv.style.marginTop = '4px';
        hiDiv.textContent = opts.hi[i];
        btn.appendChild(hiDiv);
      }
      
      btn.addEventListener('click', function() {
        btns.forEach(function(b) { b.disabled = true; });
        var isCorrect = (val === q.correctAnswer);
        if (isCorrect) {
          btn.classList.add('correct');
        } else {
          btn.classList.add('wrong');
          var correctIdx = q.correctAnswer ? 0 : 1;
          btns[correctIdx].classList.add('correct');
        }
        onAnswer(val, isCorrect);
      });
      
      btns.push(btn);
      wrap.appendChild(btn);
    });
    
    container.appendChild(wrap);
  }

  function renderFlipCard(q, langs, container, onAnswer) {
    var scene = document.createElement('div');
    scene.className = 'flip-card-scene';
    
    var inner = document.createElement('div');
    inner.className = 'flip-card-inner';
    
    var front = document.createElement('div');
    front.className = 'flip-card-front';
    
    var icon = document.createElement('div');
    icon.className = 'flip-card-icon';
    icon.textContent = '💡';
    front.appendChild(icon);
    
    var promptEn = document.createElement('div');
    promptEn.textContent = q.options.front.en;
    front.appendChild(promptEn);
    
    ['te', 'hi'].forEach(function (lang) {
      if (langs.indexOf(lang) === -1) return;
      var text = q.options.front[lang];
      if (!text || text === q.options.front.en) return;
      var pt = document.createElement('div');
      pt.style.marginTop = '8px'; pt.style.color = 'var(--text-muted)';
      pt.textContent = text;
      front.appendChild(pt);
    });
    
    var back = document.createElement('div');
    back.className = 'flip-card-back';
    
    // Front click -> flip
    front.addEventListener('click', function() {
      scene.classList.add('is-flipped');
    });
    
    // The back is just an MCQ
    // We can reuse renderMCQ but we need to pass a sub-container
    var fakeQ = { options: q.options.choices, correctAnswer: q.correctAnswer };
    renderMCQ(fakeQ, langs, back, onAnswer);
    
    inner.appendChild(front);
    inner.appendChild(back);
    scene.appendChild(inner);
    container.appendChild(scene);
  }

  function renderDragDrop(q, langs, container, onAnswer) {
    // English only interaction, translations are shown as glosses if provided
    var wrap = document.createElement('div');
    wrap.className = 'dd-container';
    
    var sourceZone = document.createElement('div');
    sourceZone.className = 'dd-source';
    
    var targetZone = document.createElement('div');
    targetZone.className = 'dd-target';
    
    var tokens = q.options.tokens.en;
    
    var slots = []; // state: array of token indices
    var slotEls = [];
    var tokenEls = [];
    
    // Setup target slots
    for (var i = 0; i < tokens.length; i++) {
      slots.push(null);
      var s = document.createElement('div');
      s.className = 'dd-slot';
      s.textContent = (i + 1);
      s.dataset.idx = i;
      targetZone.appendChild(s);
      slotEls.push(s);
    }
    
    // Setup source tokens
    tokens.forEach(function(tok, i) {
      var t = document.createElement('div');
      t.className = 'dd-token';
      t.dataset.idx = i;
      t.textContent = tok;
      
      // Tap interaction (Mobile & Desktop)
      t.addEventListener('click', function() {
        if (t.classList.contains('used')) return;
        
        // Find first empty slot
        var emptyIdx = slots.indexOf(null);
        if (emptyIdx !== -1) {
          slots[emptyIdx] = i;
          t.classList.add('used');
          updateSlots();
        }
      });
      
      sourceZone.appendChild(t);
      tokenEls.push(t);
    });
    
    function updateSlots() {
      var allFilled = true;
      slots.forEach(function(tokIdx, i) {
        var s = slotEls[i];
        if (tokIdx === null) {
          s.className = 'dd-slot';
          s.textContent = (i + 1);
          allFilled = false;
        } else {
          s.className = 'dd-slot filled';
          s.textContent = tokens[tokIdx];
        }
      });
      
      if (allFilled) {
        btnSubmit.classList.remove('hidden');
      } else {
        btnSubmit.classList.add('hidden');
      }
    }
    
    // Tap slot to remove
    slotEls.forEach(function(s, i) {
      s.addEventListener('click', function() {
        if (slots[i] !== null) {
          var tokIdx = slots[i];
          slots[i] = null;
          tokenEls[tokIdx].classList.remove('used');
          updateSlots();
        }
      });
    });
    
    var btnSubmit = document.createElement('button');
    btnSubmit.className = 'btn btn-primary dd-submit-btn hidden';
    btnSubmit.textContent = 'Submit Answer';
    btnSubmit.addEventListener('click', function() {
      var isCorrect = true;
      if (slots.length !== q.correctAnswer.length) isCorrect = false;
      else {
        for (var i = 0; i < slots.length; i++) {
          if (slots[i] !== q.correctAnswer[i]) {
            isCorrect = false;
            break;
          }
        }
      }
      
      // Disable interaction
      slotEls.forEach(function(s) { s.style.pointerEvents = 'none'; });
      tokenEls.forEach(function(t) { t.style.pointerEvents = 'none'; });
      btnSubmit.disabled = true;
      
      // Tokens, not raw hex: the hardcoded pale green/red rendered as bright
      // blocks on the dark theme.
      var edge = isCorrect ? 'var(--success-color)' : 'var(--danger-color)';
      var fill = isCorrect ? 'var(--success-soft)' : 'var(--danger-soft)';
      slotEls.forEach(function (s) {
        s.style.borderColor = edge;
        s.style.backgroundColor = fill;
      });
      
      onAnswer(slots, isCorrect);
    });
    
    wrap.appendChild(sourceZone);
    wrap.appendChild(targetZone);
    wrap.appendChild(btnSubmit);
    container.appendChild(wrap);
  }

  function renderMatchPairs(q, langs, container, onAnswer) {
    var wrap = document.createElement('div');
    wrap.className = 'mp-container';
    
    var colLeft = document.createElement('div');
    colLeft.className = 'mp-col';
    
    var colRight = document.createElement('div');
    colRight.className = 'mp-col';
    
    var canvas = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    canvas.setAttribute('class', 'mp-canvas');
    wrap.appendChild(canvas);
    
    var leftOpts = q.options.left;
    var rightOpts = q.options.right;
    
    var state = {
      selectedLeft: null,
      selectedRight: null,
      pairs: [], // array of { leftIdx, rightIdx, colorIdx }
      colorCounter: 0
    };
    
    var leftEls = [];
    var rightEls = [];
    var lineEls = [];
    
    function drawLines() {
      // Clear lines
      while (canvas.firstChild) { canvas.removeChild(canvas.firstChild); }
      lineEls = [];
      
      var wrapRect = wrap.getBoundingClientRect();
      
      state.pairs.forEach(function(p) {
        var lEl = leftEls[p.leftIdx];
        var rEl = rightEls[p.rightIdx];
        
        var lRect = lEl.getBoundingClientRect();
        var rRect = rEl.getBoundingClientRect();
        
        var x1 = lRect.right - wrapRect.left;
        var y1 = lRect.top + (lRect.height / 2) - wrapRect.top;
        var x2 = rRect.left - wrapRect.left;
        var y2 = rRect.top + (rRect.height / 2) - wrapRect.top;
        
        var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('class', 'mp-line pair-' + p.colorIdx);
        
        canvas.appendChild(line);
        lineEls.push(line);
      });
    }
    
    window.addEventListener('resize', drawLines);
    
    function checkCompletion() {
      if (state.pairs.length === leftOpts.en.length) {
        btnSubmit.classList.remove('hidden');
      } else {
        btnSubmit.classList.add('hidden');
      }
    }
    
    function createItem(textObj, index, isLeft) {
      var el = document.createElement('div');
      el.className = 'mp-item';
      
      var enText = textObj.en[index];
      var enDiv = document.createElement('div');
      enDiv.textContent = enText;
      el.appendChild(enDiv);
      
      ['te', 'hi'].forEach(function (lang) {
        if (langs.indexOf(lang) === -1) return;
        var arr = textObj[lang];
        var text = arr && arr[index];
        if (!text || text === enText) return;
        var d = document.createElement('div');
        d.style.fontSize = '0.85rem'; d.style.color = 'var(--text-muted)';
        d.textContent = text;
        el.appendChild(d);
      });
      
      el.addEventListener('click', function() {
        if (btnSubmit.disabled) return; // already submitted
        
        // Unpair if already paired
        var existingPairIdx = state.pairs.findIndex(function(p) {
          return (isLeft ? p.leftIdx === index : p.rightIdx === index);
        });
        
        if (existingPairIdx !== -1) {
          var p = state.pairs[existingPairIdx];
          state.pairs.splice(existingPairIdx, 1);
          leftEls[p.leftIdx].className = 'mp-item';
          rightEls[p.rightIdx].className = 'mp-item';
          drawLines();
          checkCompletion();
          return;
        }
        
        // Select
        if (isLeft) {
          if (state.selectedLeft !== null) leftEls[state.selectedLeft].classList.remove('selected');
          state.selectedLeft = index;
          el.classList.add('selected');
        } else {
          if (state.selectedRight !== null) rightEls[state.selectedRight].classList.remove('selected');
          state.selectedRight = index;
          el.classList.add('selected');
        }
        
        // Make pair if both selected
        if (state.selectedLeft !== null && state.selectedRight !== null) {
          var cIdx = state.colorCounter % 5;
          state.colorCounter++;
          
          state.pairs.push({
            leftIdx: state.selectedLeft,
            rightIdx: state.selectedRight,
            colorIdx: cIdx
          });
          
          leftEls[state.selectedLeft].className = 'mp-item paired pair-' + cIdx;
          rightEls[state.selectedRight].className = 'mp-item paired pair-' + cIdx;
          
          state.selectedLeft = null;
          state.selectedRight = null;
          
          drawLines();
          checkCompletion();
        }
      });
      
      return el;
    }
    
    leftOpts.en.forEach(function(_, i) {
      var el = createItem(leftOpts, i, true);
      colLeft.appendChild(el);
      leftEls.push(el);
    });
    
    rightOpts.en.forEach(function(_, i) {
      var el = createItem(rightOpts, i, false);
      colRight.appendChild(el);
      rightEls.push(el);
    });
    
    var btnSubmit = document.createElement('button');
    btnSubmit.className = 'btn btn-primary hidden';
    btnSubmit.style.marginTop = '1rem';
    btnSubmit.style.alignSelf = 'center';
    btnSubmit.textContent = 'Submit Matches';
    
    btnSubmit.addEventListener('click', function() {
      btnSubmit.disabled = true;
      leftEls.forEach(function(el) { el.style.pointerEvents = 'none'; });
      rightEls.forEach(function(el) { el.style.pointerEvents = 'none'; });
      
      // Check correctness.
      // q.correctAnswer is array of [leftIdx, rightIdx]
      var isCorrect = true;
      
      if (state.pairs.length !== q.correctAnswer.length) {
        isCorrect = false;
      } else {
        // Build map for quick lookup
        var ansMap = {};
        q.correctAnswer.forEach(function(p) { ansMap[p[0]] = p[1]; });
        
        state.pairs.forEach(function(p) {
          if (ansMap[p.leftIdx] !== p.rightIdx) {
            isCorrect = false;
          }
        });
      }
      
      if (!isCorrect) {
        // Redraw lines with red
        state.pairs.forEach(function(p) {
           leftEls[p.leftIdx].className = 'mp-item paired pair-0';
           rightEls[p.rightIdx].className = 'mp-item paired pair-0';
           p.colorIdx = 0;
        });
        drawLines();
      }
      
      var answerData = state.pairs.map(function(p) { return [p.leftIdx, p.rightIdx]; });
      onAnswer(answerData, isCorrect);
    });
    
    wrap.appendChild(colLeft);
    wrap.appendChild(colRight);
    
    var outerWrap = document.createElement('div');
    outerWrap.style.display = 'flex';
    outerWrap.style.flexDirection = 'column';
    outerWrap.appendChild(wrap);
    outerWrap.appendChild(btnSubmit);
    
    container.appendChild(outerWrap);
    
    // Initial draw (timeout to allow DOM to layout)
    setTimeout(drawLines, 50);
  }

  window.QuizRenderers = {
    'mcq': renderMCQ,
    'true-false': renderTrueFalse,
    'flip-card': renderFlipCard,
    'drag-drop': renderDragDrop,
    'match-pairs': renderMatchPairs
  };

})();
