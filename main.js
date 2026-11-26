const { app, BrowserWindow, ipcMain, globalShortcut, session, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const MIN_SIZE = 200;
const TOGGLE_SHORTCUT = 'CommandOrControl+Shift+M';
const BLACK_ARG = '--black';

let win = null;
let dragState = null;
let resizeState = null;

// Camera-free mirror: pure black full-screen windows (glossy screens reflect best on black).
let blackWins = [];
let blackClosing = false;
let blackRestoreCamera = false;
let savedBrightness = null; // laptop brightness before dimming, to restore on exit
let dimSupported = false;

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
const photosDir = () => path.join(app.getPath('pictures'), 'Mirror');

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch {
    return {};
  }
}

function writeState() {
  if (!win || win.isDestroyed() || win.isFullScreen() || win.isMinimized()) return;
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getBounds(), alwaysOnTop: win.isAlwaysOnTop() }));
  } catch {
    /* not critical */
  }
}

function isOnScreen(b) {
  return screen.getAllDisplays().some(({ workArea: a }) =>
    b.x < a.x + a.width - 60 && b.x + b.width > a.x + 60 && b.y >= a.y - 10 && b.y < a.y + a.height - 60
  );
}

function send(channel, value) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, value);
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  const s = readState();
  const width = Math.max(MIN_SIZE, s.width || 460);
  const height = Math.max(MIN_SIZE, s.height || 620);
  let x = s.x;
  let y = s.y;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !isOnScreen({ x, y, width, height })) {
    const a = screen.getPrimaryDisplay().workArea;
    x = a.x + a.width - width - 40;
    y = a.y + Math.round((a.height - height) / 2);
  }

  win = new BrowserWindow({
    x, y, width, height,
    minWidth: MIN_SIZE,
    minHeight: MIN_SIZE,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    fullscreenable: true,
    alwaysOnTop: s.alwaysOnTop !== false,
    title: 'المرآة',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  win.setMenu(null);
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => win.show());

  // Turn the camera off while minimized, back on when restored.
  win.on('minimize', () => send('visibility', false));
  win.on('restore', () => send('visibility', true));
  win.on('enter-full-screen', () => send('fullscreen', true));
  win.on('leave-full-screen', () => send('fullscreen', false));
  win.on('close', writeState);
  win.on('closed', () => { win = null; });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

// ---------- Window drag / resize (frameless window) ----------
ipcMain.on('drag-start', () => {
  if (!win || win.isFullScreen()) return;
  dragState = { cursor: screen.getCursorScreenPoint(), bounds: win.getBounds() };
});
ipcMain.on('drag-move', () => {
  if (!win || !dragState) return;
  const p = screen.getCursorScreenPoint();
  const b = dragState.bounds;
  win.setBounds({ ...b, x: b.x + p.x - dragState.cursor.x, y: b.y + p.y - dragState.cursor.y });
});
ipcMain.on('drag-end', () => { dragState = null; writeState(); });

ipcMain.on('resize-start', (_e, edge) => {
  if (!win || win.isFullScreen() || (edge !== 'bl' && edge !== 'br')) return;
  resizeState = { edge, cursor: screen.getCursorScreenPoint(), bounds: win.getBounds() };
});
ipcMain.on('resize-move', () => {
  if (!win || !resizeState) return;
  const p = screen.getCursorScreenPoint();
  const { edge, bounds: b, cursor } = resizeState;
  const dx = p.x - cursor.x;
  const dy = p.y - cursor.y;
  const width = Math.max(MIN_SIZE, Math.round(edge === 'br' ? b.width + dx : b.width - dx));
  const height = Math.max(MIN_SIZE, Math.round(b.height + dy));
  const x = edge === 'bl' ? b.x + b.width - width : b.x;
  win.setBounds({ x, y: b.y, width, height });
});
ipcMain.on('resize-end', () => { resizeState = null; writeState(); });

ipcMain.on('resize-by', (_e, factor) => {
  if (!win || win.isFullScreen() || typeof factor !== 'number' || !Number.isFinite(factor)) return;
  const f = Math.min(1.5, Math.max(0.5, factor));
  const b = win.getBounds();
  const width = Math.max(MIN_SIZE, Math.round(b.width * f));
  const height = Math.max(MIN_SIZE, Math.round(b.height * f));
  win.setBounds({
    x: Math.round(b.x + (b.width - width) / 2),
    y: Math.round(b.y + (b.height - height) / 2),
    width, height,
  });
  writeState();
});

// ---------- Window controls ----------
ipcMain.on('win-minimize', () => win && win.minimize());
ipcMain.on('win-close', () => win && win.close());
ipcMain.handle('win-fullscreen', () => {
  if (!win) return false;
  win.setFullScreen(!win.isFullScreen());
  return win.isFullScreen();
});
ipcMain.handle('win-exit-fullscreen', () => {
  if (win && win.isFullScreen()) win.setFullScreen(false);
});
ipcMain.handle('win-get-ontop', () => (win ? win.isAlwaysOnTop() : false));
ipcMain.handle('win-set-ontop', (_e, value) => {
  if (!win) return false;
  win.setAlwaysOnTop(!!value);
  writeState();
  return win.isAlwaysOnTop();
});

// ---------- Photos ----------
ipcMain.handle('save-photo', async (_e, dataUrl) => {
  const prefix = 'data:image/jpeg;base64,';
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(prefix)) throw new Error('Invalid image');
  const dir = photosDir();
  await fs.promises.mkdir(dir, { recursive: true });
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const name = `mirror-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.jpg`;
  const file = path.join(dir, name);
  await fs.promises.writeFile(file, Buffer.from(dataUrl.slice(prefix.length), 'base64'));
  return file;
});
ipcMain.on('show-in-folder', (_e, file) => {
  if (typeof file === 'string' && path.resolve(file).startsWith(photosDir() + path.sep)) {
    shell.showItemInFolder(file);
  }
});

// ---------- Camera-free (black screen) mirror ----------
function runPowerShell(script) {
  return new Promise((resolve) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    let out = '';
    let p;
    try {
      p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true });
    } catch {
      return resolve('');
    }
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => resolve(''));
    p.on('close', () => resolve(out.trim()));
  });
}

async function getBrightness() {
  const out = await runPowerShell(
    '(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness'
  );
  const n = parseInt(out, 10);
  return Number.isFinite(n) ? n : null;
}

function setBrightness(value) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return runPowerShell(
    `Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods -ErrorAction Stop | ForEach-Object { [void]$_.WmiSetBrightness(0, ${v}) }`
  );
}

// Brightness changes run one at a time so a dim and a restore can't overlap.
let brightnessQueue = Promise.resolve();
function queued(fn) {
  brightnessQueue = brightnessQueue.then(fn, fn);
  return brightnessQueue;
}

function dimScreen() {
  return queued(async () => {
    if (savedBrightness !== null) return;
    const current = await getBrightness();
    dimSupported = current !== null;
    if (!dimSupported) return;
    savedBrightness = current;
    await setBrightness(0);
  });
}

function restoreBrightness() {
  return queued(async () => {
    if (savedBrightness === null) return;
    const value = savedBrightness;
    savedBrightness = null;
    await setBrightness(value);
  });
}

async function checkDimSupport() {
  if (!dimSupported) dimSupported = (await getBrightness()) !== null;
}

function monitorOff() {
  // Short pause so the click/key that triggered this doesn't wake the screen right away.
  return runPowerShell(
    "Start-Sleep -Milliseconds 700; Add-Type -Name P -Namespace W -MemberDefinition '[DllImport(\"user32.dll\")] public static extern int PostMessage(int h, int m, int w, int l);'; [void][W.P]::PostMessage(0xffff, 0x0112, 0xF170, 2)"
  );
}

function openBlackMirror() {
  if (blackWins.length) {
    blackWins[0].focus();
    return;
  }
  blackClosing = false;
  blackRestoreCamera = !!(win && !win.isMinimized() && win.isVisible());
  if (win) win.minimize(); // also turns the camera off

  // Main display first: it gets the lit frame and the keyboard focus.
  const primaryId = screen.getPrimaryDisplay().id;
  const displays = screen.getAllDisplays().sort((a, b) => (b.id === primaryId) - (a.id === primaryId));

  blackWins = displays.map((d, i) => {
    const w = new BrowserWindow({
      ...d.bounds,
      frame: false,
      fullscreen: true,
      alwaysOnTop: true,
      backgroundColor: '#000000',
      title: 'مرآة بدون كاميرا',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    w.setMenu(null);
    w.setAlwaysOnTop(true, 'screen-saver');
    w.loadFile(path.join(__dirname, 'black.html'), { query: { primary: i === 0 ? '1' : '0' } });
    w.once('ready-to-show', () => {
      w.show();
      if (i === 0) w.focus();
    });
    w.on('close', (e) => {
      if (!blackClosing) {
        e.preventDefault();
        closeBlackMirror();
      }
    });
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    w.webContents.on('will-navigate', (e) => e.preventDefault());
    return w;
  });

  // Dimming is decided by the page (dim only when the lit frame is off).
}

function blackState() {
  return { dimSupported, dimmed: savedBrightness !== null };
}

async function closeBlackMirror() {
  if (blackClosing) return;
  blackClosing = true;
  await restoreBrightness();
  const wins = blackWins;
  blackWins = [];
  if (win && blackRestoreCamera) showWindow();
  wins.forEach((w) => !w.isDestroyed() && w.destroy());
  if (!win && !BrowserWindow.getAllWindows().length) app.quit();
}

ipcMain.on('open-black', openBlackMirror);
ipcMain.on('black-exit', closeBlackMirror);
ipcMain.on('black-monitor-off', monitorOff);
ipcMain.handle('black-state', () => blackState());
ipcMain.handle('black-toggle-dim', async () => {
  await checkDimSupport();
  if (savedBrightness !== null) await restoreBrightness();
  else await dimScreen();
  return blackState();
});
ipcMain.handle('black-set-dim', async (_e, dim) => {
  await checkDimSupport();
  if (!blackClosing && blackWins.length) {
    if (dim) await dimScreen();
    else await restoreBrightness();
  }
  return blackState();
});

// ---------- App lifecycle ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (argv.includes(BLACK_ARG)) openBlackMirror();
    else if (win) showWindow();
    else createWindow();
  });

  // Never leave the laptop screen dimmed after quitting.
  app.on('before-quit', (e) => {
    if (savedBrightness === null) return;
    e.preventDefault();
    restoreBrightness().then(() => app.quit());
  });

  app.whenReady().then(() => {
    // Allow camera only (no microphone, nothing else).
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
      const types = (details && details.mediaTypes) || [];
      callback(permission === 'media' && types.every((t) => t === 'video'));
    });
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media');

    if (process.argv.includes(BLACK_ARG)) openBlackMirror();
    else createWindow();

    globalShortcut.register(TOGGLE_SHORTCUT, () => {
      if (!win) return createWindow();
      if (win.isMinimized() || !win.isVisible() || !win.isFocused()) showWindow();
      else win.minimize();
    });
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}
