'use strict';

// Shared helpers for both mirror pages.
const $ = (id) => document.getElementById(id);

// Running inside the Android app (Capacitor) rather than a browser?
const isNativeApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const nativePlugin = (name) => (isNativeApp && window.Capacitor.Plugins ? window.Capacitor.Plugins[name] : null);

// Android app only: set screen brightness (0..1), or null for the phone's normal brightness.
let lastBrightness;
function setScreenBrightness(value) {
  const v = value == null ? -1 : value;
  const p = nativePlugin('MirrorScreen');
  if (!p || v === lastBrightness) return;
  lastBrightness = v;
  p.setBrightness({ value: v }).catch(() => {});
}
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function loadJSON(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode etc. */ }
}

function warmColor(warmth, intensity = 100) {
  const cool = [236, 244, 255];
  const warm = [255, 206, 140];
  const t = clamp(warmth, 0, 100) / 100;
  const k = clamp(intensity, 20, 100) / 100;
  return `rgb(${cool.map((v, i) => Math.round((v + (warm[i] - v) * t) * k)).join(',')})`;
}

// Toast
let toastTimer = 0;
function toast(text, ms = 1600) {
  const el = $('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// Keep the screen awake while the mirror is open.
let wakeLock = null;
async function keepAwake() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible' || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch { /* not allowed right now; retried on next tap/visibility */ }
}
document.addEventListener('visibilitychange', keepAwake);
document.addEventListener('pointerup', keepAwake);

// Fullscreen where the browser allows it (Android). iPhone uses "Add to Home Screen" instead.
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
function canFullscreen() {
  // The Android app is already full screen.
  return !isNativeApp && !!document.documentElement.requestFullscreen && !isStandalone();
}
function toggleFullscreen() {
  if (!canFullscreen()) return;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

// Offline support
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !isNativeApp) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// Auto-hiding controls: tap the screen to show/hide them.
function setupAutoHide(root, { isBusy = () => false, delay = 4000 } = {}) {
  let timer = 0;
  const show = () => {
    root.classList.add('show-ui');
    clearTimeout(timer);
    timer = setTimeout(() => { if (!isBusy()) root.classList.remove('show-ui'); }, delay);
  };
  const hide = () => {
    clearTimeout(timer);
    if (!isBusy()) root.classList.remove('show-ui');
  };
  const toggle = () => (root.classList.contains('show-ui') ? hide() : show());
  root.querySelectorAll('.chrome, .sheet').forEach((el) => {
    el.addEventListener('pointerdown', show);
    el.addEventListener('input', show);
  });
  return { show, hide, toggle };
}
