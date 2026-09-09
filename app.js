let allCards = [];
let deck = [];
let currentIndex = 0;
let flipped = false;
let results = {}; // id -> 'correct'|'wrong'
let reverseMode = false;
let ttsPlaying = false;

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
  // position:absolute の face 2枚を内包するコンテナに高さを明示する
  // 表示中の面（front or back）の scrollHeight を基準にする
  const face = flipped
    ? document.querySelector('.card-face.back')
    : document.querySelector('.card-face.front');
  if (!face) return;
  // max-height を超えた場合はスクロール可能な上限値になる
  const maxH = Math.min(420, window.innerHeight * 0.45);
  const h = Math.max(200, Math.min(face.scrollHeight, maxH));
  $('card').style.height = h + 'px';
}

function flipCard() {
  if (flipped) return;
  flipped = true;
  $('card').classList.add('flipped');
  $('btn-correct').disabled = false;
  $('btn-wrong').disabled = false;
  // 裏面の高さに合わせてコンテナをリサイズ
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
    // TTS再生中：キャンセルして前のカードから再キュー（ユーザー操作から同期呼び出し）
    speechSynthesis.cancel();
    currentIndex = Math.max(0, currentIndex - 1);
    queueTTS();
    return;
  }
  if (currentIndex <= 0) return;
  currentIndex--;
  renderCard();
  updateProgress();
}

function nextCard() {
  if (ttsPlaying) {
    // TTS再生中：キャンセルして次のカードから再キュー（ユーザー操作から同期呼び出し）
    speechSynthesis.cancel();
    currentIndex = Math.min(deck.length - 1, currentIndex + 1);
    queueTTS();
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

// ── TTS ──────────────────────────────────────────────────────────────────────
// iOS Safari の制約: speak() はユーザー操作のイベントハンドラ内で
// 同期的に呼ばなければ無視される。
// 対策: ボタン押下・次へ・前へのクリック時に残カード分を一括 queue。

function makeUtterance(text, rate) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  u.rate = rate || 0.88;
  return u;
}

// 出典注釈「（R5春SC午後Ⅰ問3）」などを音声読み上げ前に除去する
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

function queueTTS() {
  // iOS 対応：全カードの utterance を同期的に一括キューに積む
  // 最初のカードを即時表示（onstart 頼みにしない）
  if (currentIndex < deck.length) {
    const first = deck[currentIndex];
    const ff = reverseMode ? first.back : first.front;
    const fb = reverseMode ? first.front : first.back;
    showCardFront(first, ff, fb, currentIndex);
  }

  for (let i = currentIndex; i < deck.length; i++) {
    const card = deck[i];
    const idx = i;
    const frontText = reverseMode ? card.back : card.front;
    const backText  = reverseMode ? card.front : card.back;

    // 表面（用語）
    const frontU = makeUtterance(frontText);
    // onstart はフォールバック（発火すれば早めに表示）
    frontU.onstart = () => {
      if (!ttsPlaying) return;
      showCardFront(card, frontText, backText, idx);
    };
    // onend でカードをめくる（iOS で信頼性が高い）
    frontU.onend = () => {
      if (!ttsPlaying) return;
      flipped = true;
      $('card').classList.add('flipped');
    };

    // 無音ポーズ（用語→意味の切り替え）
    const pauseU = makeUtterance('んんん', 0.5);
    pauseU.volume = 0.001;
    // onstart はフォールバック（frontU.onend が発火しなかった場合の保険）
    pauseU.onstart = () => {
      if (!ttsPlaying || flipped) return;
      flipped = true;
      $('card').classList.add('flipped');
    };

    // 裏面（意味）※出典注釈は読み上げない
    const backU = makeUtterance(stripCitation(backText));

    // カード間の間
    const gapU = makeUtterance('んんんんん', 0.5);
    gapU.volume = 0.001;
    // onend で次のカードを表示（メイン同期機構）
    const nextIdx = i + 1;
    gapU.onend = () => {
      if (!ttsPlaying || nextIdx >= deck.length) return;
      const nc = deck[nextIdx];
      const nf = reverseMode ? nc.back : nc.front;
      const nb = reverseMode ? nc.front : nc.back;
      showCardFront(nc, nf, nb, nextIdx);
    };

    speechSynthesis.speak(frontU);
    speechSynthesis.speak(pauseU);
    speechSynthesis.speak(backU);
    speechSynthesis.speak(gapU);
  }

  // 全カード終了マーカー
  const endU = makeUtterance('以上です。');
  endU.onend = () => stopTTS();
  speechSynthesis.speak(endU);
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
  $('btn-tts').textContent = '■ 停止';
  $('btn-tts').classList.add('active');

  queueTTS(); // ユーザー操作のハンドラから同期的に呼ぶ
}

function stopTTS() {
  ttsPlaying = false;
  speechSynthesis.cancel();
  const btn = $('btn-tts');
  if (btn) {
    btn.textContent = '▶ 音声';
    btn.classList.remove('active');
  }
}

// ── Event Listeners ───────────────────────────────────────────────────────────

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
  });

  init();
});
