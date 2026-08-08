import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

ids = [
    'sourceNote', 'restoreBanner', 'restoreBannerText', 'restoreBtn', 'dismissRestoreBtn',
    'sessionForm', 'classSelect', 'languageChips', 'languageError', 'categoryGrid',
    'difficultyChips', 'topicChips', 'customChips', 'customTagInput', 'addTagBtn',
    'customTagError', 'studentList', 'studentsError', 'studentModeHint', 'addStudentBtn',
    'summary', 'startBtn', 'resetBtn', 'handoffPanel', 'handoffJson', 'closeHandoffBtn',
    'studentTemplate'
]

missing = [id for id in ids if f'id="{id}"' not in html]
print('Missing IDs:', missing)
