#!/usr/bin/env python3
"""check_project.py — static checks the browser will not warn you about.

Complements validate_data.py, which checks the contents of data/. This one
checks how the pages wire themselves together:

  * every local href/src resolves to a file that exists
  * no duplicate element ids on a page
  * every getElementById() a page's scripts call exists on that page
  * every CSS variable used is defined somewhere
  * every url() in the CSS resolves
  * the embedded offline JSON still matches data/
  * data and schema files parse and carry no UTF-8 BOM

Run from anywhere:  py -3 tools/check_project.py
Exits non-zero if anything fails.
"""

import io
import json
import re
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = Path(__file__).resolve().parent.parent
CSS_FILES = sorted((ROOT / 'assets').glob('*.css'))

# legacy/ is a frozen single-file prototype; it is not part of the live wiring.
PAGES = sorted(
    [p for p in ROOT.glob('*.html')] + [p for p in (ROOT / 'test').glob('*.html')]
)

problems = []
checks = 0


def fail(category, message):
    problems.append((category, message))


def ok():
    global checks
    checks += 1


def read(path):
    return path.read_text(encoding='utf-8')


def is_external(url):
    return (url.startswith(('http://', 'https://', '//', 'data:', 'mailto:', 'tel:',
                            'javascript:', '#'))
            or url.strip() == '')


def local_target(page, url):
    """Resolve a local href/src to a path, dropping any query or fragment."""
    clean = url.split('#')[0].split('?')[0]
    if not clean:
        return None
    return (page.parent / clean).resolve()


# ── 1. Per-page: ids, asset references, script DOM usage ──────────────────

page_ids = {}

for page in PAGES:
    html = read(page)
    rel = page.relative_to(ROOT).as_posix()

    ids = re.findall(r'\bid\s*=\s*"([^"]+)"', html)
    page_ids[page] = set(ids)
    ok()
    for dup in sorted({i for i in ids if ids.count(i) > 1}):
        fail('duplicate-id', f'{rel}: id="{dup}" appears {ids.count(dup)} times')

    # every local href/src must exist — this is what catches a missing icon,
    # stylesheet or script long before a user sees a 404.
    for attr, url in re.findall(r'\b(href|src)\s*=\s*"([^"]*)"', html):
        if is_external(url):
            continue
        ok()
        target = local_target(page, url)
        if target is None or not target.exists():
            fail('missing-asset', f'{rel}: {attr}="{url}" does not exist')

    # scripts this page loads must only reach for ids the page actually has
    for src in re.findall(r'<script[^>]+src="([^"]+)"', html):
        if is_external(src):
            continue
        js_path = local_target(page, src)
        if js_path is None or not js_path.exists():
            continue  # already reported above
        js = read(js_path)
        refs = set(re.findall(r"getElementById\(\s*'([^']+)'\s*\)", js))
        refs |= set(re.findall(r'getElementById\(\s*"([^"]+)"\s*\)', js))
        for ref in sorted(refs - page_ids[page]):
            ok()
            fail('missing-dom-id',
                 f'{rel}: {src} calls getElementById("{ref}"), '
                 f'but that id is not on this page')

    # in-page navigation targets
    for target_page in set(re.findall(r"location\.href\s*=\s*'([^']+)'", html)):
        if is_external(target_page):
            continue
        ok()
        t = local_target(page, target_page)
        if t is None or not t.exists():
            fail('broken-link', f'{rel}: navigates to {target_page}, which does not exist')


# ── 2. JS navigation targets ──────────────────────────────────────────────

for js_path in sorted((ROOT / 'assets').glob('*.js')):
    js = read(js_path)
    rel = js_path.relative_to(ROOT).as_posix()
    for target_page in set(re.findall(r"location\.href\s*=\s*'([^']+)'", js)):
        if is_external(target_page):
            continue
        ok()
        if not (ROOT / target_page).exists():
            fail('broken-link', f'{rel}: navigates to {target_page}, which does not exist')


# ── 3. CSS variables and url() references ─────────────────────────────────

defined = set()
for css in CSS_FILES:
    defined |= set(re.findall(r'(--[a-z0-9-]+)\s*:', read(css)))

for css in CSS_FILES:
    text = read(css)
    rel = css.relative_to(ROOT).as_posix()
    for used in sorted(set(re.findall(r'var\(\s*(--[a-z0-9-]+)', text))):
        ok()
        if used not in defined:
            fail('undefined-css-var', f'{rel}: uses {used}, which is never defined')
    for url in re.findall(r'url\(\s*[\'"]?([^\'")]+)', text):
        if is_external(url):
            continue
        ok()
        if not (css.parent / url).resolve().exists():
            fail('missing-asset', f'{rel}: url({url}) does not exist')


# ── 4. Embedded offline data vs data/ ─────────────────────────────────────

for page in PAGES:
    html = read(page)
    rel = page.relative_to(ROOT).as_posix()
    blocks = re.findall(
        r'<script type="application/json" data-file="([^"]+)">\s*(.*?)\s*</script>',
        html, re.DOTALL)
    for data_file, body in blocks:
        ok()
        src = ROOT / data_file
        if not src.exists():
            fail('offline', f'{rel}: embeds {data_file}, which does not exist')
            continue
        try:
            embedded = json.loads(body)
        except json.JSONDecodeError as exc:
            fail('offline', f'{rel}: embedded {data_file} is not valid JSON ({exc})')
            continue
        if embedded != json.loads(src.read_text(encoding='utf-8-sig')):
            fail('offline-stale',
                 f'{rel}: embedded {data_file} differs from data/ '
                 f'— run tools/build_offline.py')


# ── 5. JSON files parse, and carry no BOM ─────────────────────────────────

for f in sorted((ROOT / 'data').glob('*.json')) + sorted((ROOT / 'schemas').glob('*.json')):
    ok()
    rel = f.relative_to(ROOT).as_posix()
    raw = f.read_bytes()
    if raw[:3] == b'\xef\xbb\xbf':
        fail('bom', f'{rel}: starts with a UTF-8 BOM; JSON.parse will reject it')
    try:
        json.loads(raw.decode('utf-8-sig'))
    except json.JSONDecodeError as exc:
        fail('json', f'{rel}: {exc}')


# ── Report ────────────────────────────────────────────────────────────────

print('Project wiring check\n' + '=' * 60)
print(f'  pages: {len(PAGES)}   css: {len(CSS_FILES)}   css vars defined: {len(defined)}\n')

if problems:
    print(f'FAILED - {len(problems)} problem(s):\n')
    for category, message in problems:
        print(f'  x [{category}] {message}')
    sys.exit(1)

print(f'OK - {checks} checks passed, no problems found.')
