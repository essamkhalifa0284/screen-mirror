'use strict';

const stage = $('stage');
const hole = $('hole');

const STORAGE_KEY = 'web-black-mirror-v1';
const DEFAULTS = { frame: true, width: 9, warmth: 40, intensity: 100 };
let settings = { ...DEFAULTS, ...loadJSON(STORAGE_KEY) };

const ui = setupAutoHide(stage, { delay: 4000 });

function set(patch) {
  settings = { ...settings, ...patch };
  saveJSON(STORAGE_KEY, settings);
  apply();
}

function apply() {
  const s = settings;
  hole.hidden = !s.frame;
  document.documentElement.style.setProperty('--frame', s.width);
  document.documentElement.style.setProperty('--frame-color', warmColor(s.warmth, s.intensity));
  $('frameToggle').checked = s.frame;
  $('width').value = s.width;
  $('widthOut').textContent = s.width;
  $('warmth').value = s.warmth;
  $('intensity').value = s.intensity;
  $('intensityOut').textContent = `${s.intensity}%`;
}

// Tap anywhere (outside the controls) to show/hide them.
stage.addEventListener('click', (e) => {
  if (e.target.closest('.chrome')) return;
  ui.toggle();
  $('hint').classList.add('gone');
});

$('frameToggle').addEventListener('change', (e) => set({ frame: e.target.checked }));
$('width').addEventListener('input', (e) => set({ frame: true, width: parseInt(e.target.value, 10) }));
$('warmth').addEventListener('input', (e) => set({ frame: true, warmth: parseInt(e.target.value, 10) }));
$('intensity').addEventListener('input', (e) => set({ frame: true, intensity: parseInt(e.target.value, 10) }));

const fullBtn = $('fullBtn');
fullBtn.hidden = !canFullscreen();
fullBtn.addEventListener('click', toggleFullscreen);

// Keyboard shortcuts for desktop browsers
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' && e.target.type === 'range') return;
  if (e.code === 'KeyL') set({ frame: !settings.frame });
});

apply();
keepAwake();
ui.show();
setTimeout(() => $('hint').classList.add('gone'), 5000);
