#!/usr/bin/env python3
"""
build_offline.py — Injects JSON data files into HTML for file:// execution.

Reads data/*.json and injects them as <script type="application/json" data-file="...">
into quiz.html (and optionally index.html if needed, though index.html falls back
gracefully without data).
"""

import os
import re

ALL_DATA_FILES = [
    'data/en-te-hi-questions.json',
    'data/en-te-hi-vocabulary-dictionary.json',
    'data/en-te-hi-synonyms.json',
    'data/en-te-hi-antonyms.json',
    'data/en-te-hi-proverbs.json',
    'data/en-te-hi-phrases.json',
    'data/en-te-hi-cheatsheet.json'
]


def embed_json_in_html(html_path, data_files=None):
    """Inject the offline fallback blocks into one page.

    `data_files` limits the injection to the files that page actually loads —
    cheatsheet.html only needs the cheatsheet, and embedding all seven would
    quadruple its size for no benefit.
    """
    if data_files is None:
        data_files = ALL_DATA_FILES

    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()

    script_tags = []
    script_tags.append('  <!-- Offline Data Fallbacks (Injected by build_offline.py) -->')
    
    for df in data_files:
        if os.path.exists(df):
            with open(df, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                script_tags.append(f'  <script type="application/json" data-file="{df}">\n{content}\n  </script>')
        else:
            print(f"Warning: {df} not found.")
            
    injection = '\n'.join(script_tags) + '\n\n'
    
    # Remove existing injected blocks if they exist to avoid duplication
    html = re.sub(
        r'<!-- Offline Data Fallbacks \(Injected by build_offline\.py\) -->.*?<!-- End Offline Data -->\s*',
        '',
        html,
        flags=re.DOTALL
    )
    
    # Inject before </body>
    injection_block = injection + '  <!-- End Offline Data -->\n'
    
    if '</body>' in html:
        html = html.replace('</body>', injection_block + '</body>')
    else:
        html += injection_block
        
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html)
        
    print(f"Injected offline data into {html_path}")

if __name__ == '__main__':
    # Make sure we are in the project root
    if not os.path.isdir('data'):
        print("Error: Run this script from the project root.")
        exit(1)
        
    embed_json_in_html('quiz.html')
    # index.html doesn't crash on CORS, it falls back to hardcoded lists,
    # but we could inject it there too if we want dynamic tags to work offline.
    # We will inject into index.html as well just in case.
    embed_json_in_html('index.html')
    # and the test page!
    embed_json_in_html('test/generators-test.html')
    # cheatsheet.html only ever reads the cheatsheet file.
    embed_json_in_html('cheatsheet.html', ['data/en-te-hi-cheatsheet.json'])
