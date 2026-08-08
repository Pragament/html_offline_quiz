import json
import re

with open('quiz.html', 'r', encoding='utf-8') as f:
    html = f.read()

scripts = re.findall(r'<script type="application/json" data-file="(.*?)">(.*?)</script>', html, re.DOTALL)
if not scripts:
    print("NO SCRIPTS FOUND IN QUIZ.HTML!")
for s in scripts:
    try:
        json.loads(s[1].strip())
        print(f'{s[0]}: OK')
    except Exception as e:
        print(f'{s[0]}: ERROR - {e}')
