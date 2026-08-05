/* data-loader.js — Multi-strategy data loader for QuizMaster.
 *
 * Fallback chain (per file):
 *   1. fetch()                            — works when served over HTTP
 *   2. <script type="application/json">   — works from file:// if data is embedded
 *   3. localStorage cache                 — works after any previous successful load
 *
 * If all three fail for any required file the loader returns a typed error
 * object that the caller renders as a readable message.
 *
 * Usage:
 *   DataLoader.loadAll()            — from project root (quiz.html, index.html)
 *   DataLoader.loadAll('../')       — from a subdirectory   (test/)
 */
(function () {
  'use strict';

  var CACHE_PREFIX = 'qm-data:';

  /** Canonical relative paths (from project root). */
  var FILES = {
    questions:  'data/en-te-hi-questions.json',
    vocabulary: 'data/en-te-hi-vocabulary-dictionary.json',
    synonyms:   'data/en-te-hi-synonyms.json',
    antonyms:   'data/en-te-hi-antonyms.json',
    proverbs:   'data/en-te-hi-proverbs.json',
    phrases:    'data/en-te-hi-phrases.json',
    cheatsheet: 'data/en-te-hi-cheatsheet.json'
  };

  // ─── Strategy 1: fetch ────────────────────────────────────────────────

  function viaFetch(url) {
    if (typeof fetch !== 'function') {
      return Promise.reject({ strategy: 'fetch', message: 'fetch API unavailable' });
    }
    if (window.location.protocol === 'file:') {
      return Promise.reject({ strategy: 'fetch', message: 'fetch blocked on file:// protocol' });
    }
    return fetch(url, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).catch(function (err) {
      return Promise.reject({ strategy: 'fetch', message: err.message || String(err) });
    });
  }

  // ─── Strategy 2: embedded <script type="application/json"> ────────────

  function viaEmbedded(canonicalUrl) {
    var sel = 'script[type="application/json"][data-file="' + canonicalUrl + '"]';
    var el = document.querySelector(sel);
    if (!el || !el.textContent.trim()) {
      return Promise.reject({
        strategy: 'embedded',
        message: 'no <script data-file="' + canonicalUrl + '"> or it is empty'
      });
    }
    try {
      return Promise.resolve(JSON.parse(el.textContent));
    } catch (e) {
      return Promise.reject({ strategy: 'embedded', message: 'parse error: ' + e.message });
    }
  }

  // ─── Strategy 3: localStorage cache ───────────────────────────────────

  function viaCache(canonicalUrl) {
    try {
      var raw = localStorage.getItem(CACHE_PREFIX + canonicalUrl);
      if (!raw) {
        return Promise.reject({
          strategy: 'cache',
          message: 'nothing cached for ' + canonicalUrl
        });
      }
      return Promise.resolve(JSON.parse(raw));
    } catch (e) {
      return Promise.reject({ strategy: 'cache', message: e.message });
    }
  }

  function writeCache(canonicalUrl, data) {
    try { localStorage.setItem(CACHE_PREFIX + canonicalUrl, JSON.stringify(data)); }
    catch (_) { /* storage full or unavailable — skip silently */ }
  }

  // ─── Single-file loader ───────────────────────────────────────────────

  /**
   * Load one file through the fallback chain.
   * @param {string} canonicalUrl  Path used for embedded lookup and cache key
   * @param {string} fetchUrl      Path used for the actual fetch (may have basePath prefix)
   * @returns {Promise<{data:*, method:string}>}
   */
  function loadOne(canonicalUrl, fetchUrl) {
    var attempts = [];
    return viaFetch(fetchUrl || canonicalUrl)
      .then(function (data) {
        writeCache(canonicalUrl, data);
        return { data: data, method: 'fetch' };
      })
      .catch(function (e) {
        attempts.push(e);
        return viaEmbedded(canonicalUrl).then(function (data) {
          writeCache(canonicalUrl, data);
          return { data: data, method: 'embedded' };
        });
      })
      .catch(function (e) {
        if (e.strategy) attempts.push(e);
        return viaCache(canonicalUrl).then(function (data) {
          return { data: data, method: 'cache' };
        });
      })
      .catch(function (e) {
        if (e.strategy) attempts.push(e);
        return Promise.reject({ url: canonicalUrl, attempts: attempts });
      });
  }

  // ─── Batch loader ────────────────────────────────────────────────────

  /**
   * Load all data files.
   *
   * @param {string} [basePath]  Prefix for fetch URLs (e.g. '../' from test/).
   *                             Embedded lookups and cache keys always use the
   *                             canonical path from FILES.
   * @returns {Promise<{ok:boolean, data:Object, errors:Array, method:string}>}
   */
  function loadAll(basePath) {
    var base = basePath || '';
    var keys = Object.keys(FILES);
    var loaded = {};
    var errors = [];
    var methodCounts = {};

    var promises = keys.map(function (key) {
      var canonical = FILES[key];
      var fetchPath = base + canonical;
      return loadOne(canonical, fetchPath).then(function (result) {
        loaded[key] = result.data;
        methodCounts[result.method] = (methodCounts[result.method] || 0) + 1;
      }).catch(function (err) {
        loaded[key] = null;
        errors.push({ key: key, url: err.url, attempts: err.attempts || [] });
      });
    });

    return Promise.all(promises).then(function () {
      // Determine the dominant load method
      var method = 'none';
      var best = 0;
      Object.keys(methodCounts).forEach(function (m) {
        if (methodCounts[m] > best) { best = methodCounts[m]; method = m; }
      });

      return {
        ok:      errors.length === 0,
        data:    loaded,
        errors:  errors,
        method:  method
      };
    });
  }

  // ─── Error rendering ──────────────────────────────────────────────────

  /**
   * Render a load failure as a human-readable HTML block.
   * @param {Element|string} container  Target element or its id
   * @param {Array}          errors     From loadAll().errors
   */
  function renderError(container, errors) {
    if (typeof container === 'string') container = document.getElementById(container);
    if (!container) return;

    var h = [];
    h.push('<div class="load-error" role="alert">');
    h.push('<h2>\u26A0 Could not load quiz data</h2>');
    h.push('<p>The app tried three strategies to get the data files and all of them failed for <strong>' +
           errors.length + '</strong> file' + (errors.length === 1 ? '' : 's') + '.</p>');
    h.push('<p><strong>How to fix it:</strong></p>');
    h.push('<ol>');
    h.push('<li><strong>Run a local server</strong> (easiest) — open a terminal in this folder and run:<br>' +
           '<code>py -3 -m http.server 8123</code><br>' +
           'then open <code>http://localhost:8123/quiz.html</code></li>');
    h.push('<li><strong>Use the cache</strong> — load the page over HTTP once; after that, ' +
           'opening the file directly will use the cached copy.</li>');
    h.push('<li><strong>Embed the data</strong> — paste each JSON file into the matching ' +
           '<code>&lt;script type="application/json" data-file="…"&gt;</code> block.</li>');
    h.push('</ol>');

    if (errors.length) {
      h.push('<details><summary>Technical details</summary><ul style="font-size:.85rem;margin-top:8px">');
      errors.forEach(function (e) {
        h.push('<li><code>' + (e.url || e.key) + '</code>');
        (e.attempts || []).forEach(function (a) {
          h.push('<br>\u00A0\u00A0\u00B7 ' + a.strategy + ': ' + a.message);
        });
        h.push('</li>');
      });
      h.push('</ul></details>');
    }
    h.push('</div>');
    container.innerHTML = h.join('\n');
  }

  // ─── Public API ───────────────────────────────────────────────────────

  window.DataLoader = {
    FILES:       FILES,
    loadOne:     loadOne,
    loadAll:     loadAll,
    renderError: renderError
  };
})();
