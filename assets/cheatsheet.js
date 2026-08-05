/* cheatsheet.js — Class reference-sheet viewer.
 *
 * Shared by the results screen in quiz.html and the standalone cheatsheet.html,
 * so a student can browse the sheet before a quiz as well as after one.
 *
 * Section shapes come from schemas/cheatsheet.schema.json. Read that before
 * changing a field name here — the renderers previously guessed at the shape
 * (`headers` vs `columns`, `item.text` vs `item.tip`) and silently broke.
 */
(function () {
  'use strict';

  // "te · hi" support line shown under the English of any localizedText.
  // Values identical to the English are dropped: example sentences and drill
  // targets deliberately repeat the English in all three languages, and echoing
  // them back would just be noise.
  function subText(loc) {
    if (!loc) return '';
    return [loc.te, loc.hi]
      .filter(function (v) { return v && v !== loc.en; })
      .join('  ·  ');
  }

  function appendSub(container, loc, className) {
    var text = subText(loc);
    if (!text) return;
    var el = document.createElement('div');
    el.className = className || 'cs-sub';
    el.textContent = text;
    container.appendChild(el);
  }

  function findSheet(csData, classNumber) {
    if (!csData || !csData.sheets) return null;
    for (var i = 0; i < csData.sheets.length; i++) {
      if (csData.sheets[i].class === classNumber) return csData.sheets[i];
    }
    return null;
  }

  // ─── Section renderers ──────────────────────────────────────────────────

  function renderRules(items, container) {
    items.forEach(function (item, i) {
      var card = document.createElement('div');
      card.className = 'cs-rule-card';

      var num = document.createElement('div');
      num.className = 'cs-rule-num';
      num.textContent = (i + 1);

      var content = document.createElement('div');
      content.className = 'cs-rule-content';

      var h = document.createElement('h3');
      h.textContent = item.rule.en;
      content.appendChild(h);
      appendSub(content, item.rule, 'cs-item-meaning');

      if (item.examples && item.examples.length) {
        var ex = document.createElement('div');
        ex.className = 'cs-rule-examples';
        item.examples.forEach(function (e) {
          var p = document.createElement('div');
          p.textContent = e.en;
          ex.appendChild(p);
          appendSub(ex, e, 'cs-sub');
        });
        content.appendChild(ex);
      }

      if (item.note && item.note.en) {
        var note = document.createElement('div');
        note.className = 'cs-rule-note';
        note.textContent = 'Note: ' + item.note.en;
        content.appendChild(note);
      }

      card.appendChild(num);
      card.appendChild(content);
      container.appendChild(card);
    });
  }

  function renderVocab(items, container) {
    var grid = document.createElement('div');
    grid.className = 'cs-card-grid';

    items.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'cs-item-card';

      var head = document.createElement('div');
      head.className = 'cs-item-header';

      var term = document.createElement('div');
      term.className = 'cs-item-term';
      term.textContent = item.term.en;

      var badge = document.createElement('div');
      badge.className = 'cs-item-badge';
      badge.textContent = item.partOfSpeech || 'word';

      head.appendChild(term);
      head.appendChild(badge);
      card.appendChild(head);

      // A vocab-list item has no separate `meaning`: the Telugu and Hindi sides
      // of `term` are the meaning.
      var mean = document.createElement('div');
      mean.className = 'cs-item-meaning';
      mean.textContent = subText(item.term);
      card.appendChild(mean);

      if (item.example && item.example.en) {
        var ex = document.createElement('div');
        ex.className = 'cs-item-example';
        ex.textContent = '"' + item.example.en + '"';
        card.appendChild(ex);
      }

      grid.appendChild(card);
    });
    container.appendChild(grid);
  }

  function renderPhrases(items, container) {
    var grid = document.createElement('div');
    grid.className = 'cs-card-grid';

    items.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'cs-item-card';

      var head = document.createElement('div');
      head.className = 'cs-item-header';

      var term = document.createElement('div');
      term.className = 'cs-item-term';
      term.textContent = item.phrase.en;

      var badge = document.createElement('div');
      badge.className = 'cs-item-badge';
      badge.textContent = item.register || 'phrase';

      head.appendChild(term);
      head.appendChild(badge);
      card.appendChild(head);

      var mean = document.createElement('div');
      mean.className = 'cs-item-meaning';
      mean.textContent = item.meaning.en;
      card.appendChild(mean);
      appendSub(card, item.meaning, 'cs-sub');

      if (item.example && item.example.en) {
        var ex = document.createElement('div');
        ex.className = 'cs-item-example';
        ex.textContent = '"' + item.example.en + '"';
        card.appendChild(ex);
      }

      grid.appendChild(card);
    });
    container.appendChild(grid);
  }

  function renderTable(columns, rows, container) {
    var wrap = document.createElement('div');
    wrap.className = 'cs-table-wrapper';

    var table = document.createElement('table');
    table.className = 'cs-table';

    var thead = document.createElement('thead');
    var trHead = document.createElement('tr');
    columns.forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h.en;
      trHead.appendChild(th);
    });
    thead.appendChild(trHead);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    // A row is a plain array of localizedText cells.
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      (r || []).forEach(function (c) {
        var td = document.createElement('td');
        td.textContent = c.en;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    wrap.appendChild(table);
    container.appendChild(wrap);
  }

  function renderTips(items, container) {
    items.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'cs-tip-card';

      // A tips item is just { tip: localizedText } — no title, no `text`.
      var h = document.createElement('h3');
      h.textContent = '💡 Tip';
      card.appendChild(h);

      var p = document.createElement('p');
      p.textContent = item.tip.en;
      card.appendChild(p);

      appendSub(card, item.tip, 'cs-item-meaning');
      container.appendChild(card);
    });
  }

  // ─── Public render ──────────────────────────────────────────────────────

  /**
   * Render one class sheet into a tab strip and a content pane.
   * @param {Object}  sheet       one entry from cheatsheet.json `sheets`
   * @param {Element} tabsEl      container for the tab buttons
   * @param {Element} contentEl   container for the section panels
   * @returns {number} how many sections rendered without error
   */
  function render(sheet, tabsEl, contentEl) {
    tabsEl.innerHTML = '';
    contentEl.innerHTML = '';
    var okCount = 0;

    sheet.sections.forEach(function (sec, i) {
      var tab = document.createElement('button');
      tab.className = 'tab-btn' + (i === 0 ? ' active' : '');
      tab.type = 'button';
      tab.textContent = sec.title.en;

      var sc = document.createElement('div');
      sc.className = 'cs-section' + (i === 0 ? ' active' : '');
      sc.id = 'cs-sec-' + i;

      var title = document.createElement('h2');
      title.className = 'cs-section-title';
      title.textContent = sec.title.en;
      sc.appendChild(title);

      var summary = sec.summary || sec.description;
      if (summary && summary.en) {
        var desc = document.createElement('p');
        desc.className = 'cs-section-desc';
        desc.textContent = summary.en;
        sc.appendChild(desc);
      }

      // Isolated per section: without this, one section whose shape does not
      // match leaves the whole cheatsheet unreachable, because the throw
      // escapes before the caller ever unhides the screen.
      try {
        if (sec.type === 'rules') renderRules(sec.items, sc);
        else if (sec.type === 'vocab-list') renderVocab(sec.items, sc);
        else if (sec.type === 'phrase-list') renderPhrases(sec.items, sc);
        else if (sec.type === 'table') renderTable(sec.columns, sec.rows, sc);
        else if (sec.type === 'tips') renderTips(sec.items, sc);
        else throw new Error('unknown section type "' + sec.type + '"');
        okCount++;
      } catch (err) {
        var warn = document.createElement('p');
        warn.className = 'cs-section-desc';
        warn.textContent = 'This section could not be displayed.';
        sc.appendChild(warn);
        if (window.console) {
          console.error('[QuizMaster] cheatsheet section "' + sec.id + '" failed:', err);
        }
      }

      tabsEl.appendChild(tab);
      contentEl.appendChild(sc);

      tab.addEventListener('click', function () {
        var allTabs = tabsEl.querySelectorAll('.tab-btn');
        var allSecs = contentEl.querySelectorAll('.cs-section');
        Array.prototype.forEach.call(allTabs, function (t) { t.classList.remove('active'); });
        Array.prototype.forEach.call(allSecs, function (s) { s.classList.remove('active'); });
        tab.classList.add('active');
        sc.classList.add('active');
        window.scrollTo(0, 0);
      });
    });

    return okCount;
  }

  window.Cheatsheet = {
    render: render,
    findSheet: findSheet
  };
})();
