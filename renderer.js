'use strict';

const api = window.mirrorApp;
const $ = (id) => document.getElementById(id);

const app = $('app');
const video = $('video');
const panel = $('panel');
const toastEl = $('toast');

const SHAPES = ['rounded', 'oval', 'circle', 'rect'];
const SHAPE_NAMES = { rect: 'مستطيل', rounded: 'حواف ناعمة', oval: 'بيضاوي', circle: 'دائرة' };
const DEFAULTS = {
  mirror: true,       // true = mirror image, false = how others see you
  zoom: 1,
  brightness: 100,
  ring: true,
  ringSize: 6,
  warmth: 40,
  shape: 'rounded',
  grid: false,
  deviceId: '',
};
const STORAGE_KEY = 'mirror-settings-v1';

let settings = { ...DEFAULTS, ...loadSettings() };
let stream = null;
let cameraToken = 0;
let frozen = false;

// ---------------- Settings ----------------
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

function saveSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

function set(patch) {
  settings = { ...settings, ...patch };
  saveSettings();
  applySettings();
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function warmColor(w) {
  const cool = [236, 244, 255];
  const warm = [255, 210, 150];
  const t = clamp(w, 0, 100) / 100;
  const c = cool.map((v, i) => Math.round(v + (warm[i] - v) * t));
  return `rgb(${c.join(',')})`;
}

function applySettings() {
  const s = settings;
  app.dataset.shape = SHAPES.includes(s.shape) ? s.shape : 'rounded';
  app.classList.toggle('ring-on', s.ring);
  document.documentElement.style.setProperty('--ring', s.ringSize);
  document.documentElement.style.setProperty('--ring-color', warmColor(s.warmth));

  const sx = (s.mirror ? -1 : 1) * s.zoom;
  video.style.transform = `scale(${sx}, ${s.zoom})`;
  video.style.filter = `brightness(${s.brightness}%)`;
  $('grid').hidden = !s.grid;

  $('lightBtn').setAttribute('aria-pressed', String(s.ring));
  $('flipBtn').setAttribute('aria-pressed', String(!s.mirror));
  $('gridBtn').setAttribute('aria-pressed', String(s.grid));

  $('zoom').value = s.zoom;
  $('zoomOut').textContent = `${s.zoom.toFixed(2)}×`;
  $('brightness').value = s.brightness;
  $('brightnessOut').textContent = `${s.brightness}%`;
  $('ringToggle').checked = s.ring;
  $('ringSize').value = s.ringSize;
  $('ringSizeOut').textContent = s.ringSize;
  $('warmth').value = s.warmth;
  document.querySelectorAll('#shapeSeg button').forEach((b) => {
    b.classList.toggle('active', b.dataset.shape === app.dataset.shape);
  });
}

// ---------------- Camera ----------------
function stopCamera() {
  cameraToken++;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
  setFrozen(false);
}

function cameraError(err) {
  switch (err && err.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'لا يوجد إذن للوصول إلى الكاميرا. افتح إعدادات ويندوز ← الخصوصية ← الكاميرا، وفعّل "السماح لتطبيقات سطح المكتب بالوصول إلى الكاميرا".';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'لم يتم العثور على كاميرا. تأكد أن الكاميرا متصلة ومفعّلة.';
    case 'NotReadableError':
    case 'AbortError':
      return 'الكاميرا مستخدمة الآن من برنامج آخر (مثل Zoom أو Teams). أغلقه ثم اضغط إعادة المحاولة.';
    default:
      return 'تعذّر تشغيل الكاميرا. ' + ((err && err.message) || '');
  }
}

function showMessage(text) {
  $('message').hidden = !text;
  $('messageText').textContent = text || '';
}

async function startCamera() {
  stopCamera();
  const token = cameraToken;
  showMessage(null);

  const video_ = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 },
  };
  if (settings.deviceId) video_.deviceId = { exact: settings.deviceId };

  let newStream;
  try {
    newStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: video_ });
  } catch (err) {
    if (token !== cameraToken) return;
    if (settings.deviceId && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) {
      set({ deviceId: '' }); // saved camera is gone; fall back to the default one
      return startCamera();
    }
    showMessage(cameraError(err));
    return;
  }

  if (token !== cameraToken) { // a newer start/stop happened meanwhile
    newStream.getTracks().forEach((t) => t.stop());
    return;
  }
  stream = newStream;
  video.srcObject = stream;
  try { await video.play(); } catch { /* autoplay is muted; ignore */ }
  refreshDevices();
}

async function refreshDevices() {
  const select = $('cameraSelect');
  let cams = [];
  try {
    cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  } catch { /* ignore */ }

  const current = stream && stream.getVideoTracks()[0]
    ? stream.getVideoTracks()[0].getSettings().deviceId
    : settings.deviceId;

  select.replaceChildren(...cams.map((cam, i) => {
    const opt = document.createElement('option');
    opt.value = cam.deviceId;
    opt.textContent = cam.label || `كاميرا ${i + 1}`;
    opt.selected = cam.deviceId === current;
    return opt;
  }));
  if (!cams.length) {
    const opt = document.createElement('option');
    opt.textContent = 'لا توجد كاميرا';
    select.append(opt);
  }
  select.disabled = cams.length < 2;
}

navigator.mediaDevices.addEventListener('devicechange', () => {
  refreshDevices();
  if (!stream) startCamera();
});

// ---------------- Actions ----------------
function setFrozen(value) {
  frozen = value;
  if (stream) {
    if (frozen) video.pause();
    else video.play().catch(() => {});
  }
  $('freezeBtn').setAttribute('aria-pressed', String(frozen));
  $('frozenBadge').hidden = !frozen;
}

function toggleFreeze() {
  if (!stream) return;
  setFrozen(!frozen);
}

function toggleMirror() {
  set({ mirror: !settings.mirror });
  toast(settings.mirror ? 'وضع المرآة' : 'كما يراك الآخرون');
}

function toggleRing() {
  set({ ring: !settings.ring });
}

function toggleGrid() {
  set({ grid: !settings.grid });
}

function cycleShape() {
  const i = SHAPES.indexOf(settings.shape);
  set({ shape: SHAPES[(i + 1) % SHAPES.length] });
  toast(SHAPE_NAMES[settings.shape]);
}

function setZoom(z) {
  set({ zoom: Math.round(clamp(z, 1, 3) * 100) / 100 });
}

async function takePhoto() {
  if (!stream || !video.videoWidth) return;
  const w = video.videoWidth;
  const h = video.videoHeight;
  const z = settings.zoom;
  const sw = w / z;
  const sh = h / z;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw);
  canvas.height = Math.round(sh);
  const ctx = canvas.getContext('2d');
  ctx.filter = `brightness(${settings.brightness}%)`;
  if (settings.mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);

  const flash = $('flash');
  flash.classList.remove('go');
  void flash.offsetWidth;
  flash.classList.add('go');

  try {
    const file = await api.savePhoto(canvas.toDataURL('image/jpeg', 0.92));
    toast('تم حفظ الصورة في مجلد الصور ← Mirror (اضغط لفتحه)', () => api.showInFolder(file), 4000);
  } catch {
    toast('تعذّر حفظ الصورة');
  }
}

async function toggleFullscreen() {
  await api.toggleFullscreen();
}

// ---------------- Toast ----------------
let toastTimer = 0;
let toastAction = null;
function toast(text, onClick = null, ms = 1600) {
  toastEl.textContent = text;
  toastAction = onClick;
  toastEl.classList.toggle('clickable', !!onClick);
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show', 'clickable');
    toastAction = null;
  }, ms);
}
toastEl.addEventListener('click', () => { if (toastAction) toastAction(); });

// ---------------- Auto-hiding UI ----------------
let uiTimer = 0;
let pointerOverChrome = false;

function showUI() {
  app.classList.add('show-ui');
  clearTimeout(uiTimer);
  uiTimer = setTimeout(hideUIIfIdle, 2500);
}
function hideUIIfIdle() {
  if (!panel.hidden || pointerOverChrome) return;
  app.classList.remove('show-ui');
}
app.addEventListener('mousemove', showUI);
document.addEventListener('mouseleave', () => {
  pointerOverChrome = false;
  clearTimeout(uiTimer);
  uiTimer = setTimeout(hideUIIfIdle, 600);
});
document.querySelectorAll('.chrome, .panel').forEach((el) => {
  el.addEventListener('mouseenter', () => { pointerOverChrome = true; });
  el.addEventListener('mouseleave', () => { pointerOverChrome = false; });
});

function openPanel(open) {
  panel.hidden = !open;
  $('settingsBtn').setAttribute('aria-pressed', String(open));
  if (open) showUI();
}

// ---------------- Drag window / resize ----------------
const isUiTarget = (t) => t.closest('.chrome, .panel, .grip, .message, .toast');

let dragPointer = null;
app.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || isUiTarget(e.target)) return;
  if (!panel.hidden) { openPanel(false); return; }
  dragPointer = e.pointerId;
  app.setPointerCapture(e.pointerId);
  api.dragStart();
});
app.addEventListener('pointermove', (e) => {
  if (e.pointerId === dragPointer) api.dragMove();
});
const endDrag = (e) => {
  if (e.pointerId !== dragPointer) return;
  dragPointer = null;
  api.dragEnd();
};
app.addEventListener('pointerup', endDrag);
app.addEventListener('pointercancel', endDrag);

document.querySelectorAll('.grip').forEach((grip) => {
  let active = null;
  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    active = e.pointerId;
    grip.setPointerCapture(e.pointerId);
    api.resizeStart(grip.dataset.edge);
  });
  grip.addEventListener('pointermove', (e) => {
    if (e.pointerId === active) api.resizeMove();
  });
  const end = (e) => {
    if (e.pointerId !== active) return;
    active = null;
    api.resizeEnd();
  };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
});

app.addEventListener('dblclick', (e) => {
  if (!isUiTarget(e.target)) toggleFullscreen();
});

app.addEventListener('wheel', (e) => {
  if (e.target.closest('.panel')) return;
  e.preventDefault();
  if (e.ctrlKey) {
    api.resizeBy(e.deltaY < 0 ? 1.06 : 1 / 1.06);
  } else {
    setZoom(settings.zoom + (e.deltaY < 0 ? 0.1 : -0.1));
    toast(`التكبير ${settings.zoom.toFixed(1)}×`);
  }
}, { passive: false });

// ---------------- Buttons & controls ----------------
$('lightBtn').addEventListener('click', toggleRing);
$('flipBtn').addEventListener('click', toggleMirror);
$('freezeBtn').addEventListener('click', toggleFreeze);
$('photoBtn').addEventListener('click', takePhoto);
$('shapeBtn').addEventListener('click', cycleShape);
$('gridBtn').addEventListener('click', toggleGrid);
$('fullBtn').addEventListener('click', toggleFullscreen);
$('blackBtn').addEventListener('click', () => api.openBlack());
$('settingsBtn').addEventListener('click', () => openPanel(panel.hidden));
$('panelClose').addEventListener('click', () => openPanel(false));
$('minBtn').addEventListener('click', () => api.minimize());
$('closeBtn').addEventListener('click', () => api.close());
$('retryBtn').addEventListener('click', startCamera);

$('pinBtn').addEventListener('click', async () => {
  const on = await api.setAlwaysOnTop($('pinBtn').getAttribute('aria-pressed') !== 'true');
  syncOnTop(on);
  toast(on ? 'المرآة فوق كل النوافذ' : 'المرآة نافذة عادية');
});
$('ontopToggle').addEventListener('change', async (e) => {
  syncOnTop(await api.setAlwaysOnTop(e.target.checked));
});
function syncOnTop(on) {
  $('pinBtn').setAttribute('aria-pressed', String(on));
  $('ontopToggle').checked = on;
}

$('zoom').addEventListener('input', (e) => setZoom(parseFloat(e.target.value)));
$('brightness').addEventListener('input', (e) => set({ brightness: parseInt(e.target.value, 10) }));
$('ringToggle').addEventListener('change', (e) => set({ ring: e.target.checked }));
$('ringSize').addEventListener('input', (e) => set({ ringSize: parseInt(e.target.value, 10), ring: true }));
$('warmth').addEventListener('input', (e) => set({ warmth: parseInt(e.target.value, 10), ring: true }));
$('shapeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-shape]');
  if (b) set({ shape: b.dataset.shape });
});
$('cameraSelect').addEventListener('change', (e) => {
  set({ deviceId: e.target.value });
  startCamera();
});
$('resetBtn').addEventListener('click', () => {
  const deviceId = settings.deviceId;
  settings = { ...DEFAULTS, deviceId };
  saveSettings();
  applySettings();
  toast('تمت استعادة الإعدادات');
});

// Don't keep focus on a clicked button, so Space freezes instead of re-clicking it.
document.addEventListener('mouseup', (e) => {
  const b = e.target.closest('button');
  if (b) setTimeout(() => b.blur(), 0);
});

// ---------------- Keyboard ----------------
document.addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  if (tag === 'SELECT' || (tag === 'INPUT' && e.target.type !== 'checkbox')) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  const actions = {
    Space: toggleFreeze,
    KeyF: toggleMirror,
    KeyL: toggleRing,
    KeyS: takePhoto,
    KeyG: toggleGrid,
    Equal: () => setZoom(settings.zoom + 0.1),
    NumpadAdd: () => setZoom(settings.zoom + 0.1),
    Minus: () => setZoom(settings.zoom - 0.1),
    NumpadSubtract: () => setZoom(settings.zoom - 0.1),
    Digit0: () => setZoom(1),
    Numpad0: () => setZoom(1),
    F11: toggleFullscreen,
    Escape: () => (panel.hidden ? api.exitFullscreen() : openPanel(false)),
  };
  const action = actions[e.code];
  if (action) {
    e.preventDefault();
    action();
  }
});

// ---------------- Window events ----------------
api.onVisibility((visible) => (visible ? startCamera() : stopCamera()));
api.onFullscreen((on) => app.classList.toggle('fullscreen', on));

// ---------------- Start ----------------
applySettings();
api.getAlwaysOnTop().then(syncOnTop);
startCamera();
showUI();
