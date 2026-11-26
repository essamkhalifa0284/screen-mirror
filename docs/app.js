'use strict';

const stage = $('stage');
const video = $('video');
const sheet = $('sheet');

const STORAGE_KEY = 'web-mirror-v1';
const SHAPES = ['rect', 'rounded', 'oval'];
const DEFAULTS = {
  mirror: true,
  zoom: 1,
  brightness: 100,
  ring: true,
  ringSize: 5,
  warmth: 40,
  shape: 'rounded',
  grid: false,
  facing: 'user',
};

let settings = { ...DEFAULTS, ...loadJSON(STORAGE_KEY) };
let stream = null;
let cameraToken = 0;
let frozen = false;

const ui = setupAutoHide(stage, { isBusy: () => !sheet.hidden });

function set(patch) {
  settings = { ...settings, ...patch };
  saveJSON(STORAGE_KEY, settings);
  apply();
}

function apply() {
  const s = settings;
  stage.dataset.shape = SHAPES.includes(s.shape) ? s.shape : 'rounded';
  stage.classList.toggle('ring-on', s.ring);
  document.documentElement.style.setProperty('--ring', s.ringSize);
  document.documentElement.style.setProperty('--ring-color', warmColor(s.warmth));

  // Mirror only makes sense for the front camera.
  const mirrored = s.mirror && s.facing === 'user';
  video.style.transform = `scale(${(mirrored ? -1 : 1) * s.zoom}, ${s.zoom})`;
  video.style.filter = `brightness(${s.brightness}%)`;
  $('grid').hidden = !s.grid;
  // Android app: full brightness makes the ring light actually light your face.
  setScreenBrightness(s.ring ? 1 : null);

  $('lightBtn').setAttribute('aria-pressed', String(s.ring));
  $('flipBtn').setAttribute('aria-pressed', String(!s.mirror));
  $('zoom').value = s.zoom;
  $('zoomOut').textContent = `${s.zoom.toFixed(2)}×`;
  $('brightness').value = s.brightness;
  $('brightnessOut').textContent = `${s.brightness}%`;
  $('ringToggle').checked = s.ring;
  $('ringSize').value = s.ringSize;
  $('ringSizeOut').textContent = s.ringSize;
  $('warmth').value = s.warmth;
  $('gridToggle').checked = s.grid;
  document.querySelectorAll('#shapeSeg button').forEach((b) => {
    b.classList.toggle('active', b.dataset.shape === stage.dataset.shape);
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

function showMessage(text) {
  $('message').hidden = !text;
  $('messageText').textContent = text || '';
}

function cameraError(err) {
  if (!window.isSecureContext || !navigator.mediaDevices) {
    return 'الكاميرا محتاجة رابط آمن (https). افتح التطبيق من رابطه الأصلي.';
  }
  switch (err && err.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'محتاجين إذن الكاميرا. اسمح للمتصفح باستخدام الكاميرا من الإعدادات، وبعدين اضغط الزرار.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'مش لاقيين كاميرا على الجهاز ده. جرّب "مرآة بدون كاميرا" من فوق.';
    case 'NotReadableError':
    case 'AbortError':
      return 'الكاميرا مستخدمة في تطبيق تاني. اقفله واضغط الزرار.';
    default:
      return 'تعذّر تشغيل الكاميرا. اضغط الزرار للمحاولة تاني.';
  }
}

async function startCamera() {
  stopCamera();
  const token = cameraToken;
  showMessage(null);
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showMessage(cameraError(null));
    return;
  }
  let s;
  try {
    s = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: settings.facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
  } catch (err) {
    if (token === cameraToken) showMessage(cameraError(err));
    return;
  }
  if (token !== cameraToken) {
    s.getTracks().forEach((t) => t.stop());
    return;
  }
  stream = s;
  video.srcObject = stream;
  try { await video.play(); } catch { /* muted autoplay; ignore */ }
}

// Camera off while the app is in the background.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') startCamera();
  else stopCamera();
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

function setZoom(z) {
  set({ zoom: Math.round(clamp(z, 1, 3) * 100) / 100 });
}

async function takePhoto() {
  if (!stream || !video.videoWidth) return;
  const w = video.videoWidth;
  const h = video.videoHeight;
  const sw = w / settings.zoom;
  const sh = h / settings.zoom;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw);
  canvas.height = Math.round(sh);
  const ctx = canvas.getContext('2d');
  if ('filter' in ctx) ctx.filter = `brightness(${settings.brightness}%)`;
  if (settings.mirror && settings.facing === 'user') {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);

  const flash = $('flash');
  flash.classList.remove('go');
  void flash.offsetWidth;
  flash.classList.add('go');

  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  if (!blob) return toast('تعذّر حفظ الصورة');
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const name = `mirror-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.jpg`;
  // Android app: save the photo to a temp file, then open the share sheet ("Save to Gallery", WhatsApp...).
  const fs = nativePlugin('Filesystem');
  const share = nativePlugin('Share');
  if (fs && share) {
    try {
      const data = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
      const { uri } = await fs.writeFile({ path: name, data, directory: 'CACHE' });
      await share.share({ title: 'صورة من المرآة', files: [uri] });
    } catch (err) {
      const msg = String((err && err.message) || '');
      if (!/cancel/i.test(msg)) toast('تعذّر حفظ الصورة');
    }
    return;
  }

  const file = new File([blob], name, { type: 'image/jpeg' });

  // Phones: share sheet lets you "Save Image" to the gallery. Otherwise download.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('تم حفظ الصورة');
}

function openSheet(open) {
  sheet.hidden = !open;
  $('settingsBtn').setAttribute('aria-pressed', String(open));
  ui.show();
}

// ---------------- Touch: tap to toggle UI, pinch to zoom ----------------
const pointers = new Map();
let pinch = null;
let tapStart = null;

const isControl = (t) => t.closest('.chrome, .sheet, .card');

stage.addEventListener('pointerdown', (e) => {
  if (isControl(e.target)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) tapStart = { x: e.clientX, y: e.clientY, t: Date.now() };
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: settings.zoom };
    tapStart = null;
  }
});
stage.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch.dist > 0) setZoom(pinch.zoom * (dist / pinch.dist));
  }
});
const endPointer = (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (pointers.size === 0 && tapStart) {
    const moved = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y);
    if (moved < 10 && Date.now() - tapStart.t < 400) {
      if (!sheet.hidden) openSheet(false);
      else ui.toggle();
    }
    tapStart = null;
  }
};
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);

// Mouse wheel zoom on desktop browsers.
stage.addEventListener('wheel', (e) => {
  if (e.target.closest('.sheet')) return;
  e.preventDefault();
  setZoom(settings.zoom + (e.deltaY < 0 ? 0.1 : -0.1));
}, { passive: false });

// ---------------- Buttons ----------------
$('lightBtn').addEventListener('click', () => set({ ring: !settings.ring }));
$('flipBtn').addEventListener('click', () => {
  set({ mirror: !settings.mirror });
  toast(settings.mirror ? 'وضع المرآة' : 'كما يراك الآخرون');
});
$('freezeBtn').addEventListener('click', () => stream && setFrozen(!frozen));
$('photoBtn').addEventListener('click', takePhoto);
$('switchBtn').addEventListener('click', () => {
  set({ facing: settings.facing === 'user' ? 'environment' : 'user' });
  toast(settings.facing === 'user' ? 'الكاميرا الأمامية' : 'الكاميرا الخلفية');
  startCamera();
});
$('settingsBtn').addEventListener('click', () => openSheet(sheet.hidden));
$('retryBtn').addEventListener('click', startCamera);

const fullBtn = $('fullBtn');
fullBtn.hidden = !canFullscreen();
fullBtn.addEventListener('click', toggleFullscreen);

$('zoom').addEventListener('input', (e) => setZoom(parseFloat(e.target.value)));
$('brightness').addEventListener('input', (e) => set({ brightness: parseInt(e.target.value, 10) }));
$('ringToggle').addEventListener('change', (e) => set({ ring: e.target.checked }));
$('ringSize').addEventListener('input', (e) => set({ ringSize: parseInt(e.target.value, 10), ring: true }));
$('warmth').addEventListener('input', (e) => set({ warmth: parseInt(e.target.value, 10), ring: true }));
$('gridToggle').addEventListener('change', (e) => set({ grid: e.target.checked }));
$('shapeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-shape]');
  if (b) set({ shape: b.dataset.shape });
});
$('resetBtn').addEventListener('click', () => {
  settings = { ...DEFAULTS, facing: settings.facing };
  saveJSON(STORAGE_KEY, settings);
  apply();
  toast('تمت استعادة الإعدادات');
});

// Keyboard shortcuts for desktop browsers
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' && e.target.type === 'range') return;
  const map = {
    Space: () => stream && setFrozen(!frozen),
    KeyF: () => $('flipBtn').click(),
    KeyL: () => $('lightBtn').click(),
    KeyS: takePhoto,
    Equal: () => setZoom(settings.zoom + 0.1),
    Minus: () => setZoom(settings.zoom - 0.1),
    Digit0: () => setZoom(1),
  };
  const fn = map[e.code];
  if (fn && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    fn();
  }
});

// ---------------- Start ----------------
apply();
startCamera();
keepAwake();
ui.show();
