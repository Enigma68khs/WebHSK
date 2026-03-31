const STORAGE_KEY = "hanzi-sprint-state-v1";

const state = {
  selectedLevels: [1],
  roundSize: 10,
  mode: "flashcard",
  sessionWords: [],
  queue: [],
  currentIndex: 0,
  currentWord: null,
  currentChoices: [],
  flipped: false,
  questionLocked: false,
  advanceTimer: null,
  score: 0,
  streak: 0,
  answered: 0,
  correct: 0,
  persisted: loadState()
};

const els = {
  levelGrid: document.getElementById("level-grid"),
  roundSize: document.getElementById("round-size"),
  roundSizeLabel: document.getElementById("round-size-label"),
  modeSelect: document.getElementById("mode-select"),
  startButton: document.getElementById("start-button"),
  quickReview: document.getElementById("quick-review"),
  questionCard: document.getElementById("question-card"),
  choiceGrid: document.getElementById("choice-grid"),
  typingWrap: document.getElementById("typing-wrap"),
  typingInput: document.getElementById("typing-input"),
  submitAnswer: document.getElementById("submit-answer"),
  speakButton: document.getElementById("speak-button"),
  audioStatus: document.getElementById("audio-status"),
  feedback: document.getElementById("feedback"),
  flipCard: document.getElementById("flip-card"),
  knowButton: document.getElementById("know-button"),
  againButton: document.getElementById("again-button"),
  nextButton: document.getElementById("next-button"),
  modeTitle: document.getElementById("mode-title"),
  scoreDisplay: document.getElementById("score-display"),
  sessionProgress: document.getElementById("session-progress"),
  mistakeCount: document.getElementById("mistake-count"),
  levelProgress: document.getElementById("level-progress"),
  heroStats: document.getElementById("hero-stats"),
  todayGoal: document.getElementById("today-goal"),
  todayProgress: document.getElementById("today-progress"),
  streakCounter: document.getElementById("streak-counter"),
  todayAnswers: document.getElementById("today-answers"),
  accuracyRate: document.getElementById("accuracy-rate"),
  masteredCount: document.getElementById("mastered-count"),
  needsReviewCount: document.getElementById("needs-review-count")
};

const MODE_LABEL = {
  flashcard: "플래시카드",
  meaning: "뜻 고르기",
  pinyin: "핀인 고르기",
  typing: "뜻 직접 입력",
  review: "오답 재도전"
};

let availableVoices = [];

init();

function init() {
  setupSpeech();
  renderLevelFilters();
  bindEvents();
  updateSidebar();
  hydrateDashboard();
  startSession();
}

function loadState() {
  const today = new Date().toISOString().slice(0, 10);
  const base = {
    mistakes: {},
    mastery: {},
    stats: {
      date: today,
      answersToday: 0,
      correctToday: 0
    }
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (parsed.stats?.date !== today) {
      parsed.stats = { date: today, answersToday: 0, correctToday: 0 };
    }
    return {
      ...base,
      ...parsed
    };
  } catch {
    return base;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.persisted));
}

function bindEvents() {
  els.roundSize.addEventListener("input", () => {
    state.roundSize = Number(els.roundSize.value);
    els.roundSizeLabel.textContent = `${state.roundSize}개`;
  });

  els.modeSelect.addEventListener("change", () => {
    state.mode = els.modeSelect.value;
  });

  els.startButton.addEventListener("click", startSession);
  els.quickReview.addEventListener("click", () => {
    state.mode = "review";
    els.modeSelect.value = "review";
    startSession();
  });

  els.flipCard.addEventListener("click", flipCard);
  els.knowButton.addEventListener("click", () => markFlashcard(true));
  els.againButton.addEventListener("click", () => markFlashcard(false));
  els.nextButton.addEventListener("click", nextQuestion);
  els.submitAnswer.addEventListener("click", submitTypingAnswer);
  els.speakButton.addEventListener("click", speakCurrentWord);
  els.typingInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submitTypingAnswer();
  });
}

function setupSpeech() {
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    els.speakButton.disabled = true;
    els.audioStatus.textContent = "이 브라우저는 음성 재생을 지원하지 않습니다.";
    return;
  }

  const assignVoices = () => {
    availableVoices = window.speechSynthesis.getVoices();
    const hasChineseVoice = availableVoices.some((voice) => voice.lang.toLowerCase().startsWith("zh"));
    els.audioStatus.textContent = hasChineseVoice
      ? "중국어 원어민 음성으로 단어를 들을 수 있습니다."
      : "중국어 음성이 없어 기본 음성으로 재생될 수 있습니다.";
  };

  assignVoices();
  window.speechSynthesis.addEventListener("voiceschanged", assignVoices);
}

function renderLevelFilters() {
  els.levelGrid.innerHTML = "";
  Object.keys(window.HSK_VOCAB).forEach((levelKey) => {
    const level = Number(levelKey);
    const button = document.createElement("button");
    button.className = `level-pill ${state.selectedLevels.includes(level) ? "active" : ""}`;
    button.textContent = `HSK ${level}`;
    button.addEventListener("click", () => {
      if (state.selectedLevels.includes(level)) {
        if (state.selectedLevels.length === 1) return;
        state.selectedLevels = state.selectedLevels.filter((value) => value !== level);
      } else {
        state.selectedLevels = [...state.selectedLevels, level].sort((a, b) => a - b);
      }
      renderLevelFilters();
    });
    els.levelGrid.appendChild(button);
  });
}

function startSession() {
  state.roundSize = Number(els.roundSize.value);
  state.mode = els.modeSelect.value;
  state.flipped = false;
  state.currentIndex = 0;
  state.score = 0;
  state.streak = 0;
  state.answered = 0;
  state.correct = 0;
  state.questionLocked = false;
  els.scoreDisplay.textContent = "0";
  els.streakCounter.textContent = "0";
  els.feedback.textContent = "";
  els.feedback.className = "feedback";
  els.typingInput.value = "";
  els.modeTitle.textContent = MODE_LABEL[state.mode];

  let words = getWordsForSelectedLevels();
  if (state.mode === "review") {
    words = getMistakeWords();
  }

  state.sessionWords = buildStudySet(words, state.roundSize);
  state.queue = [...state.sessionWords];

  if (!state.queue.length) {
    renderEmptyState();
    return;
  }

  nextQuestion(true);
  hydrateDashboard();
}

function getWordsForSelectedLevels() {
  return state.selectedLevels.flatMap((level) =>
    window.HSK_VOCAB[level].map((word) => ({ ...word, level }))
  );
}

function buildStudySet(words, size) {
  const weighted = [...words].sort((a, b) => getPriority(b) - getPriority(a));
  return shuffle(weighted).sort((a, b) => getPriority(b) - getPriority(a)).slice(0, size);
}

function getPriority(word) {
  const key = wordKey(word);
  const mistakeWeight = state.persisted.mistakes[key]?.count || 0;
  const masteryWeight = state.persisted.mastery[key]?.correct || 0;
  return mistakeWeight * 3 - masteryWeight;
}

function getMistakeWords() {
  const pool = getWordsForSelectedLevels();
  return pool.filter((word) => state.persisted.mistakes[wordKey(word)]?.count > 0);
}

function nextQuestion(isFreshStart = false) {
  if (state.advanceTimer) {
    window.clearTimeout(state.advanceTimer);
    state.advanceTimer = null;
  }

  if (!isFreshStart) {
    state.currentIndex += 1;
  }

  if (state.currentIndex >= state.queue.length) {
    renderSessionComplete();
    return;
  }

  state.currentWord = state.queue[state.currentIndex];
  state.currentChoices = buildChoices(state.currentWord, state.mode);
  state.flipped = false;
  state.questionLocked = false;
  els.feedback.textContent = "";
  els.feedback.className = "feedback";
  els.typingInput.value = "";
  renderQuestion();
  updateProgressBar();
}

function renderQuestion() {
  const word = state.currentWord;
  const showAnswer = state.mode === "flashcard" && state.flipped;
  const showPinyin = state.mode !== "pinyin";
  const showMeaning = showAnswer;

  els.questionCard.innerHTML = `
    <div class="word-main">
      <div class="tags">
        <span class="tag">HSK ${word.level}</span>
        <span class="tag">${MODE_LABEL[state.mode]}</span>
      </div>
      <div class="hanzi">${word.hanzi}</div>
      ${showPinyin ? `<div class="pinyin">${word.pinyin}</div>` : ""}
      ${
        showMeaning
          ? `<div class="meaning">${word.meaning}</div>`
          : `<div class="question-note">${getQuestionHint()}</div>`
      }
    </div>
  `;

  const isFlashcard = state.mode === "flashcard";
  const isTyping = state.mode === "typing";
  const isChoiceMode = state.mode === "meaning" || state.mode === "pinyin" || state.mode === "review";
  els.speakButton.disabled = !word;

  els.choiceGrid.classList.toggle("hidden", !isChoiceMode);
  els.typingWrap.classList.toggle("hidden", !isTyping);
  els.flipCard.classList.toggle("hidden", !isFlashcard);
  els.knowButton.classList.toggle("hidden", !isFlashcard);
  els.againButton.classList.toggle("hidden", !isFlashcard);
  els.nextButton.classList.toggle("hidden", isFlashcard);

  if (isChoiceMode) {
    renderChoices();
  } else {
    els.choiceGrid.innerHTML = "";
  }
}

function getQuestionHint() {
  switch (state.mode) {
    case "flashcard":
      return "카드를 뒤집고 뜻과 핀인을 확인해 보세요.";
    case "meaning":
    case "review":
      return "이 단어의 뜻을 고르세요.";
    case "pinyin":
      return "이 단어의 핀인을 고르세요.";
    case "typing":
      return "뜻을 직접 입력해 보세요.";
    default:
      return "";
  }
}

function renderChoices() {
  const field = state.mode === "pinyin" ? "pinyin" : "meaning";
  els.choiceGrid.innerHTML = "";
  state.currentChoices.forEach((choice) => {
    const button = document.createElement("button");
    button.className = "choice-button";
    button.textContent = choice[field];
    button.addEventListener("click", () => submitChoice(choice));
    els.choiceGrid.appendChild(button);
  });
}

function buildChoices(correctWord, mode) {
  const allWords = getWordsForSelectedLevels();
  const field = mode === "pinyin" ? "pinyin" : "meaning";
  const distractors = shuffle(
    allWords.filter((word) => word[field] !== correctWord[field] && word.hanzi !== correctWord.hanzi)
  ).slice(0, 3);
  return shuffle([correctWord, ...distractors]);
}

function submitChoice(choice) {
  if (state.questionLocked) return;
  state.questionLocked = true;
  const isCorrect = choice.hanzi === state.currentWord.hanzi;
  revealChoiceFeedback(choice, isCorrect);
  registerAttempt(isCorrect);
  if (!isCorrect) {
    trackMistake(state.currentWord);
  } else {
    improveMastery(state.currentWord);
  }
  queueAdvance();
}

function revealChoiceFeedback(choice, isCorrect) {
  [...els.choiceGrid.children].forEach((button) => {
    const matchesChoice = button.textContent === (state.mode === "pinyin" ? choice.pinyin : choice.meaning);
    const matchesCorrect = button.textContent === (state.mode === "pinyin" ? state.currentWord.pinyin : state.currentWord.meaning);
    if (matchesCorrect) button.classList.add("correct");
    if (matchesChoice && !isCorrect) button.classList.add("wrong");
    button.disabled = true;
  });

  els.feedback.textContent = isCorrect
    ? "정답입니다."
    : `오답입니다. ${state.currentWord.hanzi} (${state.currentWord.pinyin}) = ${state.currentWord.meaning}`;
  els.feedback.className = `feedback ${isCorrect ? "good" : "bad"}`;
}

function submitTypingAnswer() {
  if (state.questionLocked) return;
  const userAnswer = els.typingInput.value.trim();
  if (!userAnswer) return;
  state.questionLocked = true;
  const normalized = normalize(userAnswer);
  const expected = normalize(state.currentWord.meaning);
  const isCorrect = expected.includes(normalized) || normalized.includes(expected);
  registerAttempt(isCorrect);
  if (!isCorrect) {
    trackMistake(state.currentWord);
  } else {
    improveMastery(state.currentWord);
  }
  els.feedback.textContent = isCorrect
    ? "정답입니다."
    : `정답은 "${state.currentWord.meaning}" 입니다. 핀인: ${state.currentWord.pinyin}`;
  els.feedback.className = `feedback ${isCorrect ? "good" : "bad"}`;
  queueAdvance();
}

function markFlashcard(known) {
  if (state.questionLocked) return;
  state.questionLocked = true;
  state.flipped = true;
  renderQuestion();
  registerAttempt(known);
  if (known) {
    improveMastery(state.currentWord);
    els.feedback.textContent = "좋습니다. 다음 세트에서 출제 빈도가 내려갑니다.";
    els.feedback.className = "feedback good";
  } else {
    trackMistake(state.currentWord);
    els.feedback.textContent = "오답노트에 추가했습니다. 이후 세션에서 더 자주 나옵니다.";
    els.feedback.className = "feedback bad";
  }
  queueAdvance();
}

function flipCard() {
  state.flipped = !state.flipped;
  renderQuestion();
}

function registerAttempt(isCorrect) {
  state.answered += 1;
  state.correct += isCorrect ? 1 : 0;
  state.streak = isCorrect ? state.streak + 1 : 0;
  state.score += isCorrect ? 10 + Math.min(state.streak, 5) * 2 : 0;
  els.scoreDisplay.textContent = String(state.score);
  els.streakCounter.textContent = String(state.streak);

  state.persisted.stats.answersToday += 1;
  state.persisted.stats.correctToday += isCorrect ? 1 : 0;
  saveState();
  updateSidebar();
  hydrateDashboard();
}

function trackMistake(word) {
  const key = wordKey(word);
  const existing = state.persisted.mistakes[key] || { ...word, count: 0, lastWrongAt: "" };
  state.persisted.mistakes[key] = {
    ...existing,
    count: existing.count + 1,
    lastWrongAt: new Date().toISOString()
  };
  saveState();
}

function improveMastery(word) {
  const key = wordKey(word);
  const existing = state.persisted.mastery[key] || { correct: 0, level: word.level };
  state.persisted.mastery[key] = {
    ...existing,
    correct: existing.correct + 1
  };

  if (state.persisted.mistakes[key]) {
    state.persisted.mistakes[key].count = Math.max(0, state.persisted.mistakes[key].count - 1);
    if (state.persisted.mistakes[key].count === 0) {
      delete state.persisted.mistakes[key];
    }
  }
  saveState();
}

function updateSidebar() {
  const mistakeEntries = Object.values(state.persisted.mistakes);
  els.mistakeCount.textContent = `${mistakeEntries.length}개`;

  els.levelProgress.innerHTML = "";
  Object.keys(window.HSK_VOCAB).forEach((levelKey) => {
    const level = Number(levelKey);
    const words = window.HSK_VOCAB[level];
    const mastered = words.filter((word) => (state.persisted.mastery[wordKey({ ...word, level })]?.correct || 0) >= 2).length;
    const percent = Math.round((mastered / words.length) * 100);
    const wrap = document.createElement("article");
    wrap.className = "progress-item";
    wrap.innerHTML = `
      <header>
        <span>HSK ${level}</span>
        <span>${percent}%</span>
      </header>
      <div class="progress-strip">
        <div class="progress-fill" style="width: ${percent}%"></div>
      </div>
    `;
    els.levelProgress.appendChild(wrap);
  });

  const totalWords = Object.values(window.HSK_VOCAB).flat().length;
  const masteredCount = Object.values(state.persisted.mastery).filter((item) => item.correct >= 2).length;
  els.heroStats.innerHTML = `
    <span>총 단어 ${totalWords}개</span>
    <span>선택 레벨 ${state.selectedLevels.map((level) => `HSK ${level}`).join(", ")}</span>
    <span>오답노트 ${mistakeEntries.length}개</span>
  `;
  els.masteredCount.textContent = String(masteredCount);
  els.needsReviewCount.textContent = String(mistakeEntries.length);
}

function hydrateDashboard() {
  const stats = state.persisted.stats;
  const accuracy = stats.answersToday
    ? Math.round((stats.correctToday / stats.answersToday) * 100)
    : 0;
  els.todayAnswers.textContent = String(stats.answersToday);
  els.accuracyRate.textContent = `${accuracy}%`;
  els.todayGoal.textContent = `${Math.max(12, state.roundSize)}문제`;
  els.todayProgress.textContent =
    stats.answersToday >= Math.max(12, state.roundSize)
      ? "오늘 목표 달성"
      : `${Math.max(12, state.roundSize) - stats.answersToday}문제 남음`;
}

function renderEmptyState() {
  els.speakButton.disabled = true;
  els.audioStatus.textContent = "재생할 단어가 없습니다.";
  els.questionCard.innerHTML = `
    <div class="word-main">
      <div class="hanzi">准备好了</div>
      <div class="meaning">선택한 조건에 맞는 오답 단어가 아직 없습니다.</div>
      <div class="question-note">일반 학습 모드에서 먼저 몇 문제를 풀어 보세요.</div>
    </div>
  `;
  els.choiceGrid.innerHTML = "";
  els.choiceGrid.classList.add("hidden");
  els.typingWrap.classList.add("hidden");
  els.flipCard.classList.add("hidden");
  els.knowButton.classList.add("hidden");
  els.againButton.classList.add("hidden");
  els.nextButton.classList.add("hidden");
  updateProgressBar();
}

function renderSessionComplete() {
  els.speakButton.disabled = true;
  els.audioStatus.textContent = "새 세션을 시작하면 현재 단어 발음을 다시 들을 수 있습니다.";
  const accuracy = state.answered ? Math.round((state.correct / state.answered) * 100) : 0;
  els.questionCard.innerHTML = `
    <div class="word-main">
      <div class="hanzi">Session Clear</div>
      <div class="meaning">정답률 ${accuracy}% · 점수 ${state.score}</div>
      <div class="question-note">오답은 자동 저장되었습니다. 다시 시작하면 약점 중심으로 섞어 드립니다.</div>
    </div>
  `;
  els.choiceGrid.innerHTML = "";
  els.choiceGrid.classList.add("hidden");
  els.typingWrap.classList.add("hidden");
  els.flipCard.classList.add("hidden");
  els.knowButton.classList.add("hidden");
  els.againButton.classList.add("hidden");
  els.nextButton.classList.add("hidden");
  els.feedback.textContent = "새 세션을 시작하거나 오답 재도전 모드로 넘어가세요.";
  els.feedback.className = "feedback good";
  els.sessionProgress.style.width = "100%";
}

function updateProgressBar() {
  if (!state.queue.length) {
    els.sessionProgress.style.width = "0%";
    return;
  }
  const progress = Math.round(((state.currentIndex + 1) / state.queue.length) * 100);
  els.sessionProgress.style.width = `${progress}%`;
}

function queueAdvance() {
  state.advanceTimer = window.setTimeout(() => {
    nextQuestion();
  }, 900);
}

function speakCurrentWord() {
  if (!state.currentWord) return;
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    els.audioStatus.textContent = "이 브라우저는 음성 재생을 지원하지 않습니다.";
    return;
  }

  const utterance = new SpeechSynthesisUtterance(state.currentWord.hanzi);
  const preferredVoice = pickChineseVoice();
  utterance.lang = preferredVoice?.lang || "zh-CN";
  utterance.voice = preferredVoice || null;
  utterance.rate = 0.9;
  utterance.pitch = 1;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  els.audioStatus.textContent = `"${state.currentWord.hanzi}" 발음을 재생 중입니다.`;
}

function pickChineseVoice() {
  if (!availableVoices.length) {
    availableVoices = window.speechSynthesis.getVoices();
  }

  return (
    availableVoices.find((voice) => voice.lang === "zh-CN") ||
    availableVoices.find((voice) => voice.lang.toLowerCase().startsWith("zh")) ||
    null
  );
}

function wordKey(word) {
  return `${word.level}-${word.hanzi}`;
}

function normalize(value) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function shuffle(items) {
  const clone = [...items];
  for (let index = clone.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]];
  }
  return clone;
}
