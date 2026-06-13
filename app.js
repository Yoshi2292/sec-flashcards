let allCards = [];
let deck = [];
let currentIndex = 0;
let flipped = false;
let results = {}; // id -> 'correct'|'wrong'
let reverseMode = false;

// TTS state
let ttsPlaying = false;
let ttsTimer = null;

const STORAGE_KEY = 'sekisupe_results';

const $ = id => document.getElementById(id);

async function init() {
  const res = await fetch('cards.json');
  allCards = await res.json();

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) results = JSON.parse(saved);

  buildCategoryFilters();
  applyFilter('すべて');
}

function buildCategoryFilters() {
  const cats = ['すべて', ...new Set(allCards.map(c => c.category))];
  const wrap = $('filters');
  wrap.innerHTML = '';
  cats.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn' + (cat === 'すべて' ? ' active' : '');
    btn.textContent = cat;
    btn.dataset.cat = cat;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilter(cat);
    });
    wrap.appendChild(btn);
  });
}

function applyFilter(cat) {
  if (ttsPlaying) stopTTS();
  deck = cat === 'すべて' ? [...allCards] : allCards.filter(c => c.category === cat);
  shuffle(deck);
  currentIndex = 0;
  renderCard();
  updateProgress();
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function renderCard() {
  const cardArea = $('card-area');
  const doneScreen = $('done-screen');
  const actions = $('actions');

  if (currentIndex >= deck.length) {
    cardArea.classList.add('hidden');
    actions.classList.add('hidden');
    doneScreen.classList.remove('hidden');
    renderDone();
    stopTTS();
    return;
  }

  cardArea.classList.remove('hidden');
  actions.classList.remove('hidden');
  doneScreen.classList.add('hidden');

  const card = deck[currentIndex];
  const frontText = reverseMode ? card.back : card.front;
  const backText  = reverseMode ? card.front : card.back;

  $('card-category').textContent = card.category;
  $('card-front-text').textContent = frontText;
  $('card-back-category').textContent = card.category;
  $('card-back-text').textContent = backText;

  // reset flip
  flipped = false;
  $('card').classList.remove('flipped');

  // lock answer buttons until flipped
  $('btn-correct').disabled = true;
  $('btn-wrong').disabled = true;

  $('counter').textContent = `${currentIndex + 1} / ${deck.length}`;
}

function toggleMode() {
  reverseMode = !reverseMode;
  $('btn-mode').textContent = reverseMode ? '用語→意味' : '意味→用語';
  $('btn-mode').classList.toggle('active', reverseMode);
  const activeFilter = document.querySelector('.filter-btn.active')?.dataset.cat || 'すべて';
  applyFilter(activeFilter);
}

function flipCard() {
  if (flipped) return;
  flipped = true;
  $('card').classList.add('flipped');
  $('btn-correct').disabled = false;
  $('btn-wrong').disabled = false;
}

function answer(result) {
  if (ttsPlaying) return; // TTS再生中は手動操作を無効化
  const card = deck[currentIndex];
  results[card.id] = result;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
  currentIndex++;
  renderCard();
  updateProgress();
}

function skip() {
  if (ttsPlaying) return;
  currentIndex++;
  renderCard();
  updateProgress();
}

function updateProgress() {
  const ids = deck.map(c => c.id);
  const correct = ids.filter(id => results[id] === 'correct').length;
  const wrong = ids.filter(id => results[id] === 'wrong').length;
  const total = deck.length;

  $('stat-correct').textContent = `正解 ${correct}`;
  $('stat-wrong').textContent = `不正解 ${wrong}`;
  $('stat-unseen').textContent = `未回答 ${total - correct - wrong}`;

  $('prog-correct').style.width = total ? `${(correct / total) * 100}%` : '0%';
  $('prog-wrong').style.width = total ? `${(wrong / total) * 100}%` : '0%';
}

function renderDone() {
  const ids = deck.map(c => c.id);
  const correct = ids.filter(id => results[id] === 'correct').length;
  const total = deck.length;
  const pct = Math.round((correct / total) * 100);
  $('done-score').textContent = `${pct}%`;
  $('done-detail').textContent = `${correct} / ${total} 正解`;
}

function resetDeck() {
  if (ttsPlaying) stopTTS();
  const activeFilter = document.querySelector('.filter-btn.active')?.dataset.cat || 'すべて';
  deck.forEach(c => delete results[c.id]);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
  applyFilter(activeFilter);
}

// ── TTS ──────────────────────────────────────────────

function speak(text, onDone) {
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'ja-JP';
  utter.rate = 0.85;
  utter.pitch = 1.0;

  // iOSではonendが発火しないことがあるためタイムアウトで保険をかける
  const fallbackMs = Math.max(3000, text.length * 180);
  let settled = false;
  const done = () => {
    if (settled) return;
    settled = true;
    clearTimeout(ttsTimer);
    if (onDone) onDone();
  };

  utter.onend = done;
  utter.onerror = done;
  ttsTimer = setTimeout(done, fallbackMs);
  speechSynthesis.speak(utter);
}

function ttsPlayCard() {
  if (!ttsPlaying) return;
  if (currentIndex >= deck.length) { stopTTS(); return; }

  renderCard();

  const card = deck[currentIndex];
  const frontText = reverseMode ? card.back : card.front;
  const backText  = reverseMode ? card.front : card.back;

  // 用語を読む
  speak(frontText, () => {
    if (!ttsPlaying) return;
    // 少し間を置いてからカードをめくり意味を読む
    ttsTimer = setTimeout(() => {
      if (!ttsPlaying) return;
      flipCard();
      speak(backText, () => {
        if (!ttsPlaying) return;
        // 次のカードまでの間隔
        ttsTimer = setTimeout(() => {
          if (!ttsPlaying) return;
          currentIndex++;
          updateProgress();
          ttsPlayCard();
        }, 1800);
      });
    }, 700);
  });
}

function startTTS() {
  if (!window.speechSynthesis) {
    alert('お使いのブラウザは音声読み上げに対応していません。');
    return;
  }
  // 再生済みの発話をクリア
  speechSynthesis.cancel();
  ttsPlaying = true;
  $('btn-tts').textContent = '■ 停止';
  $('btn-tts').classList.add('active');
  // 最初のカードから再生
  if (currentIndex >= deck.length) currentIndex = 0;
  ttsPlayCard();
}

function stopTTS() {
  ttsPlaying = false;
  clearTimeout(ttsTimer);
  speechSynthesis.cancel();
  const btn = $('btn-tts');
  if (btn) {
    btn.textContent = '▶ 音声';
    btn.classList.remove('active');
  }
}

function toggleTTS() {
  if (ttsPlaying) stopTTS();
  else startTTS();
}

// ── Event Listeners ──────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  $('card').addEventListener('click', flipCard);
  $('btn-correct').addEventListener('click', () => answer('correct'));
  $('btn-wrong').addEventListener('click', () => answer('wrong'));
  $('btn-skip').addEventListener('click', skip);
  $('btn-reset').addEventListener('click', resetDeck);
  $('btn-restart').addEventListener('click', resetDeck);
  $('btn-mode').addEventListener('click', toggleMode);
  $('btn-tts').addEventListener('click', toggleTTS);

  document.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipCard(); }
    if (e.key === 'ArrowRight' || e.key === 'l') { if (flipped && !ttsPlaying) answer('correct'); }
    if (e.key === 'ArrowLeft'  || e.key === 'h') { if (flipped && !ttsPlaying) answer('wrong'); }
    if (e.key === 's' && !ttsPlaying) skip();
    if (e.key === 'r') toggleMode();
    if (e.key === 'p') toggleTTS();
  });

  init();
});
