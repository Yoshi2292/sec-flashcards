let allCards = [];
let deck = [];
let currentIndex = 0;
let flipped = false;
let results = {}; // id -> 'correct'|'wrong'
let reverseMode = false;
let ttsPlaying = false;
let waitingForAnswer = false; // インタラクティブTTSで答え待ち中

// ── 音声コマンド ──
let voiceMode = false;
let recognition = null;

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
    if (ttsPlaying) stopTTS();
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

  flipped = false;
  $('card').classList.remove('flipped');
  $('btn-correct').disabled = true;
  $('btn-wrong').disabled = true;

  $('counter').textContent = `${currentIndex + 1} / ${deck.length}`;
  setHint('クリック または Space/Enter でめくる');
  syncCardHeight();
}

function toggleMode() {
  reverseMode = !reverseMode;
  $('btn-mode').textContent = reverseMode ? '用語→意味' : '意味→用語';
  $('btn-mode').classList.toggle('active', reverseMode);
  const activeFilter = document.querySelector('.filter-btn.active')?.dataset.cat || 'すべて';
  applyFilter(activeFilter);
}

function syncCardHeight() {
  const face = flipped
    ? document.querySelector('.card-face.back')
    : document.querySelector('.card-face.front');
  if (!face) return;
  const maxH = Math.min(420, window.innerHeight * 0.45);
  const h = Math.max(200, Math.min(face.scrollHeight, maxH));
  $('card').style.height = h + 'px';
}

function setHint(text) {
  const el = document.querySelector('.card-hint');
  if (el) el.textContent = text;
}

function flipCard() {
  // インタラクティブTTSで答え待ち中：タップで答えを読み上げ
  if (ttsPlaying && waitingForAnswer) {
    waitingForAnswer = false;
    speakBack();
    return;
  }
  if (ttsPlaying) return;

  if (flipped) {
    flipped = false;
    $('card').classList.remove('flipped');
    $('btn-correct').disabled = true;
    $('btn-wrong').disabled = true;
    requestAnimationFrame(syncCardHeight);
    return;
  }
  flipped = true;
  $('card').classList.add('flipped');
  $('btn-correct').disabled = false;
  $('btn-wrong').disabled = false;
  requestAnimationFrame(syncCardHeight);
}

function answer(result) {
  if (ttsPlaying) return;
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

function prevCard() {
  if (ttsPlaying) {
    speechSynthesis.cancel();
    waitingForAnswer = false;
    currentIndex = Math.max(0, currentIndex - 1);
    speakFront();
    return;
  }
  if (currentIndex <= 0) return;
  currentIndex--;
  renderCard();
  updateProgress();
}

function nextCard() {
  if (ttsPlaying) {
    speechSynthesis.cancel();
    waitingForAnswer = false;
    currentIndex = Math.min(deck.length - 1, currentIndex + 1);
    speakFront();
    return;
  }
  skip();
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

// ── TTS（インタラクティブモード）────────────────────────────────────────────

function makeUtterance(text, rate) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  u.rate = rate || 0.88;
  return u;
}

function stripCitation(text) {
  return text.replace(/（R\d+[^）]*）/g, '').trim();
}

function showCardFront(card, frontText, backText, idx) {
  currentIndex = idx;
  flipped = false;
  $('card').classList.remove('flipped');
  $('btn-correct').disabled = true;
  $('btn-wrong').disabled = true;
  $('card-category').textContent = card.category;
  $('card-front-text').textContent = frontText;
  $('card-back-category').textContent = card.category;
  $('card-back-text').textContent = backText;
  $('counter').textContent = `${idx + 1} / ${deck.length}`;
  updateProgress();
  requestAnimationFrame(syncCardHeight);
}

// 問題面を読み上げ → 終了後に一時停止して答え待ち
function speakFront() {
  if (currentIndex >= deck.length) { stopTTS(); return; }

  const card = deck[currentIndex];
  const frontText = reverseMode ? card.back : card.front;
  const backText  = reverseMode ? card.front : card.back;
  showCardFront(card, frontText, backText, currentIndex);

  const u = makeUtterance(frontText);
  u.onend = () => {
    if (!ttsPlaying) return;
    waitingForAnswer = true;
    const hint = voiceMode
      ? '「答え」と言うか タップして答えを表示'
      : 'タップして答えを表示';
    setHint(hint);
  };
  speechSynthesis.speak(u);
}

// 答え面を読み上げ → 終了後に次の問題へ
function speakBack() {
  const card = deck[currentIndex];
  const backText = reverseMode ? card.front : card.back;

  flipped = true;
  $('card').classList.add('flipped');
  setHint('');
  requestAnimationFrame(syncCardHeight);

  const backU = makeUtterance(stripCitation(backText));
  backU.onend = () => {
    if (!ttsPlaying) return;
    const gapU = makeUtterance('んんんんん', 0.5);
    gapU.volume = 0.001;
    gapU.onend = () => {
      if (!ttsPlaying) return;
      currentIndex++;
      if (currentIndex >= deck.length) { stopTTS(); return; }
      speakFront();
    };
    speechSynthesis.speak(gapU);
  };
  speechSynthesis.speak(backU);
}

function toggleTTS() {
  if (ttsPlaying) { stopTTS(); return; }

  if (!window.speechSynthesis) {
    alert('お使いのブラウザは音声読み上げに対応していません。');
    return;
  }

  speechSynthesis.cancel();
  if (currentIndex >= deck.length) currentIndex = 0;

  ttsPlaying = true;
  waitingForAnswer = false;
  $('btn-tts').textContent = '■ 停止';
  $('btn-tts').classList.add('active');

  speakFront();
}

function stopTTS() {
  ttsPlaying = false;
  waitingForAnswer = false;
  speechSynthesis.cancel();
  const btn = $('btn-tts');
  if (btn) {
    btn.textContent = '▶ 音声';
    btn.classList.remove('active');
  }
  setHint('クリック または Space/Enter でめくる');
}

// ── 音声コマンド ──────────────────────────────────────────────────────────────

function initRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.lang = 'ja-JP';
  r.continuous = true;
  r.interimResults = false;

  r.onresult = e => {
    const transcript = Array.from(e.results)
      .slice(e.resultIndex)
      .map(r => r[0].transcript)
      .join('');

    if (ttsPlaying) {
      // インタラクティブTTSモードのコマンド
      if (waitingForAnswer && /答え/.test(transcript)) {
        waitingForAnswer = false;
        // iOS制約: recognition callback から speak() できない場合がある
        // → 画面だけめくって speakBack は iOS ではタップ促し
        flipped = true;
        $('card').classList.add('flipped');
        setHint('タップして答えを読み上げ');
        requestAnimationFrame(syncCardHeight);
        // non-iOS はそのまま喋れる
        speakBack();
      } else if (/^次$|次へ/.test(transcript)) {
        speechSynthesis.cancel();
        waitingForAnswer = false;
        currentIndex = Math.min(deck.length - 1, currentIndex + 1);
        speakFront();
      } else if (/^前$|前へ/.test(transcript)) {
        speechSynthesis.cancel();
        waitingForAnswer = false;
        currentIndex = Math.max(0, currentIndex - 1);
        speakFront();
      }
    } else {
      // 通常モードのコマンド
      if (/答え/.test(transcript)) {
        flipCard();
      } else if (/^正解$|正解/.test(transcript) && flipped) {
        answer('correct');
      } else if (/不正解/.test(transcript) && flipped) {
        answer('wrong');
      } else if (/^次$|次へ/.test(transcript)) {
        nextCard();
      } else if (/^前$|前へ/.test(transcript)) {
        prevCard();
      }
    }
  };

  r.onerror = e => {
    if (e.error === 'not-allowed') {
      alert('マイクへのアクセスが拒否されました。ブラウザの設定で許可してください。');
      stopVoice();
    }
  };

  // 認識が途切れたら自動再起動
  r.onend = () => {
    if (voiceMode) {
      try { r.start(); } catch (_) {}
    }
  };

  return r;
}

function toggleVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    alert('お使いのブラウザは音声認識に対応していません。\nChrome または Edge をお試しください。');
    return;
  }

  if (voiceMode) {
    stopVoice();
  } else {
    startVoice();
  }
}

function startVoice() {
  if (!recognition) recognition = initRecognition();
  if (!recognition) return;
  voiceMode = true;
  try { recognition.start(); } catch (_) {}
  $('btn-voice').textContent = '🎤 ON';
  $('btn-voice').classList.add('active');
  if (waitingForAnswer) setHint('「答え」と言うか タップして答えを表示');
}

function stopVoice() {
  voiceMode = false;
  if (recognition) { try { recognition.stop(); } catch (_) {} }
  $('btn-voice').textContent = '🎤';
  $('btn-voice').classList.remove('active');
  if (waitingForAnswer) setHint('タップして答えを表示');
}

// ── Event Listeners ───────────────────────────────────────────────────────────

// iOS はページ再読込後も前ページの読み上げキューが残ることがある
if (window.speechSynthesis) speechSynthesis.cancel();
window.addEventListener('pagehide', () => { if (window.speechSynthesis) speechSynthesis.cancel(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && ttsPlaying) stopTTS();
});

document.addEventListener('DOMContentLoaded', () => {
  $('card').addEventListener('click', flipCard);
  $('btn-correct').addEventListener('click', () => answer('correct'));
  $('btn-wrong').addEventListener('click', () => answer('wrong'));
  $('btn-prev').addEventListener('click', prevCard);
  $('btn-next').addEventListener('click', nextCard);
  $('btn-reset').addEventListener('click', resetDeck);
  $('btn-restart').addEventListener('click', resetDeck);
  $('btn-mode').addEventListener('click', toggleMode);
  $('btn-tts').addEventListener('click', toggleTTS);
  $('btn-voice').addEventListener('click', toggleVoice);

  document.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipCard(); }
    if (e.key === 'ArrowRight' || e.key === 'l') {
      if (ttsPlaying) nextCard();
      else if (flipped) answer('correct');
    }
    if (e.key === 'ArrowLeft' || e.key === 'h') {
      if (ttsPlaying) prevCard();
      else if (flipped) answer('wrong');
    }
    if (e.key === 's') nextCard();
    if (e.key === 'r') toggleMode();
    if (e.key === 'p') toggleTTS();
    if (e.key === 'm') toggleVoice();
  });

  init();
});
