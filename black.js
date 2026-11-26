'use strict';

const api = window.mirrorApp;
const $ = (id) => document.getElementById(id);
const hint = $('hint');
const hole = $('hole');
const toastEl = $('toast');
const isPrimary = new URLSearchParams(location.search).get('primary') === '1';

const STORAGE_KEY = 'black-mirror-v1';
const DEFAULTS = { frame: true, width: 8, warmth: 40, intensity: 100 };
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

let settings = { ...DEFAULTS, ...load() };

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return s && typeof s === 'object' ? s : {};
  } catch {
    return {};
  }
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

function frameColor() {
  const cool = [236, 244, 255];
  const warm = [255, 206, 140];
  const t = clamp(settings.warmth, 0, 100) / 100;
  const k = clamp(settings.intensity, 20, 100) / 100;
  return `rgb(${cool.map((v, i) => Math.round((v + (warm[i] - v) * t) * k)).join(',')})`;
}

function apply() {
  // Only the main display gets the frame; other displays stay plain black.
  const on = isPrimary && settings.frame;
  hole.hidden = !on;
  document.body.classList.toggle('no-frame', !on);
  document.documentElement.style.setProperty('--frame', settings.width);
  document.documentElement.style.setProperty('--frame-color', frameColor());
}

function update(patch, message) {
  settings = { ...settings, ...patch };
  save();
  apply();
  if (message) toast(message);
}

// ---------- Hint & toast ----------
let hintTimer = 0;
function showHint(ms) {
  if (!isPrimary) return;
  hint.hidden = false;
  hint.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hint.classList.remove('show'), ms);
}

let toastTimer = 0;
function toast(text) {
  if (!isPrimary) return;
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1400);
}

function renderDimState(state) {
  if (!state) return;
  $('dimLine').innerHTML = state.dimSupported
    ? `<kbd>D</kbd> ${state.dimmed ? 'رجوع إضاءة الشاشة' : 'تقليل إضاءة الشاشة'} (الإضاءة ${state.dimmed ? 'مقلّلة الآن' : 'عادية'})`
    : 'إضاءة هذه الشاشة لا يمكن التحكم فيها من البرنامج — قللها من أزرار الشاشة.';
}

// With the frame on, the backlight is needed to light your face, so keep normal brightness.
// With the frame off, dim the backlight so the black is as dark (and reflective) as possible.
async function syncDim() {
  if (!isPrimary) return;
  renderDimState(await api.setDim(!settings.frame));
}

// ---------- Input ----------
let lastMove = 0;
document.addEventListener('mousemove', () => {
  const now = Date.now();
  if (now - lastMove > 400) showHint(2500);
  lastMove = now;
});

document.addEventListener('click', () => api.monitorOff());

document.addEventListener('keydown', async (e) => {
  switch (e.code) {
    case 'Escape':
      api.blackExit();
      break;
    case 'Space':
    case 'KeyB':
      e.preventDefault();
      api.monitorOff();
      break;
    case 'KeyD':
      renderDimState(await api.toggleDim());
      showHint(2500);
      break;
    case 'KeyL':
      update({ frame: !settings.frame }, settings.frame ? 'الإطار المضيء: إيقاف' : 'الإطار المضيء: تشغيل');
      syncDim();
      break;
    case 'ArrowUp':
      e.preventDefault();
      update({ frame: true, width: clamp(settings.width + 1, 2, 25) }, `عرض الإطار ${clamp(settings.width + 1, 2, 25)}`);
      break;
    case 'ArrowDown':
      e.preventDefault();
      update({ frame: true, width: clamp(settings.width - 1, 2, 25) }, `عرض الإطار ${clamp(settings.width - 1, 2, 25)}`);
      break;
    case 'ArrowLeft': // RTL: left = warmer
      update({ frame: true, warmth: clamp(settings.warmth + 10, 0, 100) }, `لون الإطار: ${clamp(settings.warmth + 10, 0, 100)}% دافئ`);
      break;
    case 'ArrowRight':
      update({ frame: true, warmth: clamp(settings.warmth - 10, 0, 100) }, `لون الإطار: ${clamp(settings.warmth - 10, 0, 100)}% دافئ`);
      break;
    case 'Equal':
    case 'NumpadAdd':
      update({ frame: true, intensity: clamp(settings.intensity + 10, 20, 100) }, `قوة الإضاءة ${clamp(settings.intensity + 10, 20, 100)}%`);
      break;
    case 'Minus':
    case 'NumpadSubtract':
      update({ frame: true, intensity: clamp(settings.intensity - 10, 20, 100) }, `قوة الإضاءة ${clamp(settings.intensity - 10, 20, 100)}%`);
      break;
    default:
      return;
  }
});

// ---------- Start ----------
apply();
api.onBlackState(renderDimState);
syncDim();
showHint(5000);
