# 🎓 QuizMaster - Student Quiz App

An interactive, responsive web-based quiz application designed for students in classes 1–10.  
It loads one random question at a time, supports multiple languages (English, Telugu, Hindi), and provides instant scoring with **+3** for correct answers, **-1** for wrong, and **0** for skips.  
Questions are drawn from static JSON data and dynamically generated from vocabulary, synonyms, antonyms, proverbs, and phrases – all stored locally in the browser.

---

## 🚀 Features

- **One question at a time** – focus on the current challenge.
- **Scoring system** – 3 points for correct, -1 for wrong, 0 for skip.
- **Timer** – shows elapsed minutes during the quiz.
- **Local storage** – saves session data and results automatically.
- **Multi‑language support** – every question displays English, Telugu, and Hindi translations.
- **Multiple question types**:
  - MCQ
  - Flip Cards (tap to reveal options)
  - Drag and Drop
  - Match Pairs
  - True / False
- **Flexible filtering** – choose class (1–10), language(s), categories, and tags.
- **Student registration** – collect name, section, roll number, admission number, and parent phone.
- **Cheatsheet** – view class-specific grammar, vocabulary, phrases, and proverbs.
- **Dynamic question generation** – runtime creation from vocabulary, synonyms, antonyms, proverbs, and phrases data.
- **Fully responsive** – works on desktop, tablet, and mobile.

---

## 📦 Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Edge, Safari).
- No server required – the app runs entirely in the browser.

### Running the App

1. Download the single HTML file (`index.html`) or open it directly in your browser.
2. Fill in the student details and select your preferences.
3. Click **Start Quiz** to begin.
4. Answer each question, skip if needed, or end the quiz early.
5. View your results and review the history of your answers.

---

## 📁 Data Files (Embedded JSON)

All question data and dictionaries are embedded as JavaScript variables in the HTML file. You can customize them by modifying the corresponding arrays.

### `STATIC_QUESTIONS`

Pre‑defined questions with the following structure:

```javascript
{
  id: 'unique_id',
  class: 5,               // class number (1–10)
  category: 'Vocabulary', // one of the supported categories
  tags: ['daily', 'beginner'],
  type: 'mcq',            // mcq, truefalse, flipcard, dragdrop, matchpairs
  question: {
    en: 'What is the meaning of "abandon"?',
    te: '"abandon" అంటే ఏమిటి?',
    hi: '"abandon" का क्या अर्थ है?'
  },
  options: {
    en: ['Leave behind', 'Keep safe', 'Build', 'Destroy'],
    te: ['వదిలివేయడం', 'భద్రపరచడం', 'నిర్మించడం', 'నాశనం చేయడం'],
    hi: ['पीछे छोड़ना', 'सुरक्षित रखना', 'निर्माण करना', 'नष्ट करना']
  },
  correct: 0   // index of the correct answer (for MCQ/Flip/Drag/Match)
}
```

### `VOCAB_DICT`

Vocabulary words used to generate MCQ questions.

```javascript
{
  en: 'apple',
  te: 'ఆపిల్',
  hi: 'सेब',
  class: 3,
  category: 'Vocabulary',
  tags: ['food', 'daily']
}
```

### `SYNONYMS`, `ANTONYMS`

Used to generate synonym/antonym questions.

```javascript
{
  en: 'happy',
  synonyms: ['joyful', 'cheerful', 'delighted'],
  te: ['సంతోషంగా', 'ఉల్లాసంగా', 'ఆనందంగా'],
  hi: ['खुश', 'प्रसन्न', 'आनंदित'],
  class: 5,
  category: 'Vocabulary',
  tags: ['daily', 'intermediate']
}
```

### `PROVERBS` & `PHRASES`

For proverb and phrase questions.

```javascript
{
  en: 'Actions speak louder than words.',
  te: 'చర్యలు మాటల కంటే గట్టిగా మాట్లాడతాయి.',
  hi: 'कर्म वचनों से बड़कर बोलते हैं।',
  class: 5,
  category: 'Vocabulary',
  tags: ['daily', 'intermediate']
}
```

### `CHEATSHEET_DATA`

Class‑specific reference material displayed in the cheatsheet view.

```javascript
{
  5: {
    grammar: [ { en: 'Present Simple: ...', te: '...', hi: '...' } ],
    vocabulary: [ { en: 'abandon', te: 'వదిలివేయడం', hi: 'छोड़ देना' } ],
    phrases: [ ... ],
    proverbs: [ ... ]
  }
}
```

---

## 🛠️ Customization

### Add New Questions

- Add your own objects to `STATIC_QUESTIONS` following the structure above.
- Make sure the `id` is unique.

### Add New Categories or Tags

- Categories are defined in the HTML `#categoryGroup` (update the list of tags).
- Tags are defined in `#tagGroup`.
- When adding new categories, ensure they match the `category` field in your questions.

### Modify Scoring

- Scoring rules are defined in the `handleMCQAnswer`, `handleTrueFalseAnswer`, `dragdrop`, and `matchpairs` handlers.
- Change the `+3`, `-1`, or `0` values to adjust points.

### Add New Question Types

- Extend the `type` switch in `renderQuestion()` and implement the rendering and event logic.

---

## 🧠 Technologies Used

- **HTML5** – structure and markup.
- **CSS3** – custom styling with responsive design (no external frameworks).
- **Vanilla JavaScript (ES6)** – all logic, DOM manipulation, and event handling.
- **Local Storage** – persists session data and quiz results.
- **Font Awesome** – icons for UI enhancements (loaded via CDN).

---

## 🤝 Contributing

Contributions are welcome! If you have ideas for new question types, additional dictionaries, or UI improvements, please fork the repository and submit a pull request.

---

## 📧 Support

For any issues or questions, please open an issue in the project repository or contact the maintainer.

---

**Happy Quizzing!** 🎉
