const minNumber = 1;
const maxNumber = 99999;
const digitCount = 5;
const maxAttempts = 6;
const stateKey = 'rngdle-state-v3';
const historyKey = 'rngdle-history-v1';
const answerCacheKey = 'rngdle-answer-cache-v1';
const answerCacheDays = 31;

let guesses = [];
let gameOver = false;

const $ = (selector) => document.querySelector(selector);
const input = $('#guessInput');
const message = $('#formMessage');
const guessList = $('#guessList');

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function dailySolution(dateKey) {
  let hash = 2166136261;
  for (const char of dateKey) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return minNumber + ((hash >>> 0) % maxNumber);
}

function readStorage(key, fallback) {
  try {
    const stored = JSON.parse(localStorage.getItem(key) || 'null');
    return stored ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing or storage limits can block localStorage.
  }
}

function getAnswerCache() {
  const cache = readStorage(answerCacheKey, {});
  return cache && typeof cache === 'object' && !Array.isArray(cache) ? cache : {};
}

function primeAnswerCache() {
  const cache = getAnswerCache();
  const today = new Date();

  for (let i = 0; i < answerCacheDays; i += 1) {
    const key = getDateKey(addDays(today, i));
    if (!Number.isInteger(cache[key])) cache[key] = dailySolution(key);
  }

  writeStorage(answerCacheKey, cache);
  return cache;
}

function getAnswerForDate(key) {
  const cache = primeAnswerCache();
  if (!Number.isInteger(cache[key])) {
    cache[key] = dailySolution(key);
    writeStorage(answerCacheKey, cache);
  }
  return cache[key];
}

const currentDateKey = getDateKey();
primeAnswerCache();
const solution = getAnswerForDate(currentDateKey);

function formatNumber(value) {
  return String(value).padStart(digitCount, '0');
}

function clueForGuess(guess) {
  const diff = Math.abs(guess - solution);
  if (guess === solution) return { type: 'correct', label: 'Exact hit' };
  if (diff <= 1000) return { type: 'near', label: `Close - off by ${diff}` };
  return { type: 'far', label: guess < solution ? 'Too low - go higher' : 'Too high - go lower' };
}

function loadState() {
  const stored = readStorage(stateKey, {});
  if (stored.date === currentDateKey) {
    guesses = Array.isArray(stored.guesses) ? stored.guesses : [];
    gameOver = stored.gameOver === true;
  }
}

function saveState() {
  writeStorage(stateKey, { date: currentDateKey, guesses, gameOver });
  saveHistory();
}

function getHistory() {
  const history = readStorage(historyKey, {});
  return history && typeof history === 'object' && !Array.isArray(history) ? history : {};
}

function saveHistory() {
  if (!guesses.length && !gameOver) return;

  const history = getHistory();
  history[currentDateKey] = {
    date: currentDateKey,
    solution,
    guesses: [...guesses],
    solved: guesses.at(-1) === solution,
    attempts: guesses.length,
    completed: gameOver
  };
  writeStorage(historyKey, history);
}

function renderGuesses() {
  guessList.innerHTML = guesses.map((guess, i) => {
    const clue = clueForGuess(guess);
    return `<div class="guess-row"><span class="guess-index">${String(i + 1).padStart(2, '0')}</span><span class="guess-number">${formatNumber(guess)}</span><span class="guess-feedback ${clue.type}">${clue.label}</span></div>`;
  }).join('');

  $('#attemptCount').textContent = guesses.length;
  $('#streakValue').textContent = guesses.length && guesses.at(-1) === solution ? '1' : '0';
  [...$('#streakDots').children].forEach((dot, i) => dot.classList.toggle('active', i < Math.min(guesses.length, 5)));
}

function lockGame(win) {
  gameOver = true;
  input.disabled = true;
  $('#guessForm button').disabled = true;
  message.textContent = win ? `Solved in ${guesses.length} guesses.` : `Out of attempts. Today's number was ${formatNumber(solution)}.`;
  saveState();
  setTimeout(() => openModal('result'), 320);
}

function getHistoryStats() {
  const history = getHistory();
  const entries = Object.values(history);
  const solved = entries.filter((entry) => entry.solved);
  let currentStreak = 0;
  let day = new Date();

  while (history[getDateKey(day)]?.solved) {
    currentStreak += 1;
    day = addDays(day, -1);
  }

  return {
    played: entries.length,
    solved: solved.length,
    bestAttempts: solved.length ? Math.min(...solved.map((entry) => entry.attempts)) : '-',
    currentStreak
  };
}

function submitGuess(event) {
  event.preventDefault();
  if (gameOver) return;

  const value = Number(input.value);
  if (!Number.isInteger(value) || value < minNumber || value > maxNumber) {
    message.textContent = 'Enter an integer from 00001 to 99999.';
    input.focus();
    return;
  }

  if (guesses.includes(value)) {
    message.textContent = 'You already tried that number.';
    input.select();
    return;
  }

  guesses.push(value);
  input.value = '';
  renderGuesses();
  saveState();

  if (value === solution) lockGame(true);
  else if (guesses.length >= maxAttempts) lockGame(false);
  else message.textContent = value < solution ? 'Clue: the answer is higher.' : 'Clue: the answer is lower.';
}

function openModal(type) {
  const content = $('#modalContent');
  if (type === 'result') {
    content.innerHTML = `<p>You used ${guesses.length} of ${maxAttempts} attempts.</p><div class="result-number">${formatNumber(solution)}</div><div class="share-actions"><button class="share-button" id="shareButton">Copy text result</button><button class="share-button secondary" id="downloadShareButton">Download result card</button></div>`;
  } else if (type === 'stats') {
    const solved = guesses.length && guesses.at(-1) === solution;
    const stats = getHistoryStats();
    content.innerHTML = `<p>Your local RNGDLE record for this browser.</p><ul class="modal-list"><li><b>${stats.played}</b> puzzles played</li><li><b>${stats.solved}</b> puzzles solved</li><li><b>${stats.bestAttempts}</b> best winning guess count</li><li><b>${stats.currentStreak}</b> current solved streak</li><li><b>${solved ? guesses.length : '-'}</b> today's winning guess count</li></ul>`;
  } else {
    content.innerHTML = `<ul class="modal-list"><li><b>01</b> Enter a number from 00001 to 99999.</li><li><b>02</b> You have six attempts per daily puzzle.</li><li><b>03</b> Direction clues tell you higher or lower.</li><li><b>04</b> Orange means you are within 1,000.</li></ul>`;
  }

  $('#modalBackdrop').hidden = false;
  const share = $('#shareButton');
  if (share) share.addEventListener('click', shareResult);
  const download = $('#downloadShareButton');
  if (download) download.addEventListener('click', downloadResultCard);
}

function shareResult() {
  const blocks = guesses.map((guess) => {
    if (guess === solution) return 'G';
    return Math.abs(guess - solution) <= 1000 ? 'O' : 'X';
  }).join('');
  const text = `RNGDLE #${$('#challengeNumber').textContent} ${guesses.length}/${maxAttempts}\n${blocks}\nPlay: ${window.location.origin}`;
  if (navigator.clipboard) navigator.clipboard.writeText(text);
  $('#shareButton').textContent = 'Copied';
}

function downloadResultCard() {
  const blocks = guesses.map((guess) => guess === solution ? '#d4f367' : Math.abs(guess - solution) <= 1000 ? '#ff9368' : '#8be8bd');
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const context = canvas.getContext('2d');
  context.fillStyle = '#101311';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#d4f367';
  context.font = '700 30px Arial';
  context.fillText('RNGDLE', 72, 88);
  context.fillStyle = '#edf0e9';
  context.font = '700 64px Arial';
  context.fillText(`Daily number #${$('#challengeNumber').textContent}`, 72, 175);
  context.fillStyle = '#879087';
  context.font = '400 28px Arial';
  context.fillText(`Solved in ${guesses.length}/${maxAttempts} guesses`, 72, 230);
  blocks.forEach((color, index) => {
    context.fillStyle = color;
    context.fillRect(72 + index * 105, 300, 82, 82);
  });
  context.fillStyle = '#aeb6ae';
  context.font = '400 24px Arial';
  context.fillText('Guess the Number - rngdle.com', 72, 545);
  const link = document.createElement('a');
  link.download = `rngdle-${currentDateKey}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function updateCountdown() {
  const now = new Date();
  if (getDateKey(now) !== currentDateKey) {
    window.location.reload();
    return;
  }

  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  const sec = Math.floor((next - now) / 1000);
  $('#countdown').textContent = [Math.floor(sec / 3600), Math.floor((sec % 3600) / 60), sec % 60].map((n) => String(n).padStart(2, '0')).join(':');
}

function setupKeyboard() {
  const rows = [['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], ['Back', 'Clear', 'Enter']];
  rows.forEach((row, rowIndex) => {
    const target = $(`#keyRow${rowIndex + 1}`);
    row.forEach((key) => {
      const button = document.createElement('button');
      button.className = `key ${key.length > 1 ? 'key-wide' : ''}`;
      button.textContent = key;
      button.type = 'button';
      button.addEventListener('click', () => {
        if (key === 'Enter') $('#guessForm').requestSubmit();
        else if (key === 'Back') input.value = input.value.slice(0, -1);
        else if (key === 'Clear') input.value = '';
        else if (input.value.length < digitCount) input.value += key;
        input.focus();
      });
      target.appendChild(button);
    });
  });
}

function initMeta() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayNumber = Math.floor((now - start) / 86400000);
  $('#challengeNumber').textContent = String(dayNumber).padStart(3, '0');
  $('#dateDay').textContent = String(now.getDate()).padStart(2, '0');
  $('#dateMonth').innerHTML = `${now.toLocaleString('en-US', { month: 'short' }).toUpperCase()}<br>${now.getFullYear()}`;
}

$('#guessForm').addEventListener('submit', submitGuess);
$('#helpButton').addEventListener('click', () => openModal('help'));
$('#statsButton').addEventListener('click', () => openModal('stats'));
$('#modalClose').addEventListener('click', () => $('#modalBackdrop').hidden = true);
$('#modalBackdrop').addEventListener('click', (event) => {
  if (event.target.id === 'modalBackdrop') event.currentTarget.hidden = true;
});

initMeta();
loadState();
renderGuesses();
if (gameOver) {
  input.disabled = true;
  $('#guessForm button').disabled = true;
}
setupKeyboard();
updateCountdown();
setInterval(updateCountdown, 1000);
