// Nexus Media — компьютерийн апп (Windows, Mac).
// Апп нь вэбсайтыг өөртөө ачаалдаг тул сайтад гарсан өөрчлөлт (чат, төсөл, дизайн) апп дээр шууд харагдана.
// Аппын өөрийнх нь шинэчлэлтийг electron-updater GitHub Releases-ээс автоматаар татна.
const { app, BrowserWindow, shell, ipcMain, dialog, Menu, nativeImage, session, desktopCapturer, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');

const SITE = 'https://nexus-media-d4b46.web.app/';
const SITE_ORIGIN = new URL(SITE).origin;
// Google-ээр нэвтрэх цонхнууд апп дотроо нээгдэнэ, бусад гадны холбоос үндсэн хөтөч дээр нээгдэнэ
const AUTH_HOSTS = new Set(['nexus-media-d4b46.firebaseapp.com', 'accounts.google.com', 'apis.google.com', 'www.google.com', 'accounts.youtube.com', 'myaccount.google.com']);
const isMac = process.platform === 'darwin';
const T = {
  update: 'Шинэ хувилбар', later: 'Дараа', download: 'Татах', restart: 'Одоо шинэчлэх',
  macAvail: (v) => `Nexus Media ${v} гарлаа`,
  macDetail: 'Шинэ хувилбарыг татаж, нээгээд Nexus Media-г Applications хавтас руу чирж хуучныхаа оронд суулгана.',
  ready: (v) => `Nexus Media ${v} суулгахад бэлэн боллоо`,
  readyDetail: 'Апп хаагдаад шинэ хувилбараар дахин нээгдэнэ. «Дараа» дарвал дараагийн удаа аппаа хаахад шинэчлэгдэнэ.',
  latest: 'Та хамгийн сүүлийн хувилбарыг ашиглаж байна', check: 'Шинэчлэлт шалгах', reload: 'Дахин ачаалах', about: 'Nexus Media-гийн тухай'
};

let win = null;
let quitting = false;
let updater = null;
let manualCheck = false;

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => showWin());
app.setAppUserModelId('mn.nexusmedia.app');

function showWin() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}

// Цонхны хэмжээ, байрлалыг санах
const stateFile = () => path.join(app.getPath('userData'), 'window.json');
function loadState() { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch (e) { return {}; } }
function saveState() {
  if (!win) return;
  try { const b = win.getNormalBounds(); fs.writeFileSync(stateFile(), JSON.stringify({ x: b.x, y: b.y, w: b.width, h: b.height, max: win.isMaximized() })); } catch (e) {}
}

const isAuthUrl = (u) => AUTH_HOSTS.has(u.hostname) || (u.origin === SITE_ORIGIN && u.pathname.startsWith('/__/auth'));
const fromSite = (frame) => { try { const u = new URL(frame.url); return u.origin === SITE_ORIGIN || u.protocol === 'file:'; } catch (e) { return false; } };

function createWindow() {
  const st = loadState();
  win = new BrowserWindow({
    width: st.w || 1280, height: st.h || 820, x: st.x, y: st.y, minWidth: 380, minHeight: 560,
    backgroundColor: '#070707', title: 'Nexus Media', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
  });
  if (st.max) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.loadURL(SITE);

  const wc = win.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    let u; try { u = new URL(url); } catch (e) { return { action: 'deny' }; }
    if (isAuthUrl(u)) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 680, parent: win, autoHideMenuBar: true, backgroundColor: '#ffffff', title: 'Google', webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } } };
    }
    if (u.origin === SITE_ORIGIN) { win.loadURL(url); return { action: 'deny' }; }
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    let u; try { u = new URL(url); } catch (err) { e.preventDefault(); return; }
    if (u.origin === SITE_ORIGIN || isAuthUrl(u) || u.protocol === 'file:') return;
    e.preventDefault();
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol)) shell.openExternal(url);
  });
  // Интернэтгүй үед тусгай хуудас
  wc.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return;
    win.loadFile(path.join(__dirname, 'offline.html'), { query: { site: SITE } });
  });
  // Баруун товчны цэс (хуулах, буулгах)
  wc.on('context-menu', (e, p) => {
    const items = [];
    if (p.isEditable) items.push({ role: 'cut', label: 'Хайчлах' }, { role: 'copy', label: 'Хуулах' }, { role: 'paste', label: 'Буулгах' }, { type: 'separator' }, { role: 'selectAll', label: 'Бүгдийг сонгох' });
    else if (p.selectionText && p.selectionText.trim()) items.push({ role: 'copy', label: 'Хуулах' });
    if (p.linkURL && /^https?:/i.test(p.linkURL)) items.push({ label: 'Холбоосыг хуулах', click: () => require('electron').clipboard.writeText(p.linkURL) });
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });

  win.on('close', (e) => {
    saveState();
    if (isMac && !quitting) { e.preventDefault(); win.hide(); } // Mac дээр хаахад ард нь ажилласаар (мэдэгдэл ирнэ)
  });
  win.on('focus', () => { win.flashFrame(false); });
  win.on('closed', () => { win = null; });
}

// Сайтаас ирэх жижиг хүсэлтүүд (тэмдэг, анхааруулга)
let badgeImg = null;
ipcMain.on('app-info', (e) => { e.returnValue = { version: app.getVersion(), platform: process.platform }; });
ipcMain.on('badge', (e, n) => {
  if (!fromSite(e.senderFrame)) return;
  n = Math.max(0, Math.min(99, Number(n) || 0));
  if (isMac || process.platform === 'linux') app.setBadgeCount(n);
  else if (win) {
    if (!badgeImg) badgeImg = nativeImage.createFromPath(path.join(__dirname, 'build', 'badge.png'));
    win.setOverlayIcon(n ? badgeImg : null, n ? n + ' шинэ мессеж' : '');
  }
});
ipcMain.on('attention', (e) => {
  if (!fromSite(e.senderFrame) || !win || win.isFocused()) return;
  if (isMac) app.dock.bounce('informational'); else win.flashFrame(true);
});
ipcMain.on('focus', (e) => { if (fromSite(e.senderFrame)) showWin(); });
ipcMain.on('check-updates', (e) => { if (fromSite(e.senderFrame)) checkUpdates(true); });

// ---------------- Автомат шинэчлэлт ----------------
function repoInfo() {
  try {
    const y = fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8');
    const g = (k) => ((y.match(new RegExp('^' + k + ':\\s*(.+)$', 'm')) || [])[1] || '').trim().replace(/^['"]|['"]$/g, '');
    return { owner: g('owner'), repo: g('repo') };
  } catch (e) { return { owner: '', repo: '' }; }
}
function setupUpdates() {
  if (!app.isPackaged) return;
  try { updater = require('electron-updater').autoUpdater; } catch (e) { return; }
  // Windows: ард нь татаж аваад суулгахад бэлэн болоход асууна. Mac (Apple гэрчилгээгүй): «Татах» товч гаргана.
  updater.autoDownload = !isMac;
  updater.autoInstallOnAppQuit = !isMac;
  updater.on('update-available', async (info) => {
    if (!isMac) return;
    const { owner, repo } = repoInfo();
    const url = owner && repo ? `https://github.com/${owner}/${repo}/releases/latest/download/NexusMedia-mac-${process.arch}.dmg` : '';
    const { response } = await dialog.showMessageBox(win, { type: 'info', buttons: [T.download, T.later], defaultId: 0, cancelId: 1, title: T.update, message: T.macAvail(info.version), detail: T.macDetail });
    if (response === 0 && url) shell.openExternal(url);
  });
  updater.on('update-not-available', () => {
    if (manualCheck) dialog.showMessageBox(win, { type: 'info', buttons: ['OK'], title: T.update, message: T.latest, detail: 'v' + app.getVersion() });
    manualCheck = false;
  });
  updater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox(win, { type: 'info', buttons: [T.restart, T.later], defaultId: 0, cancelId: 1, title: T.update, message: T.ready(info.version), detail: T.readyDetail });
    if (response === 0) { quitting = true; setImmediate(() => updater.quitAndInstall(true, true)); }
  });
  updater.on('error', (err) => { console.error('updater:', err && err.message); if (manualCheck) dialog.showMessageBox(win, { type: 'warning', buttons: ['OK'], title: T.update, message: 'Шинэчлэлт шалгаж чадсангүй. Интернэтээ шалгаад дахин оролдоно уу.' }); manualCheck = false; });
  setTimeout(() => checkUpdates(false), 6000);
  setInterval(() => checkUpdates(false), 4 * 60 * 60 * 1000);
}
function checkUpdates(manual) {
  if (!updater) { if (manual) dialog.showMessageBox(win, { type: 'info', buttons: ['OK'], title: T.update, message: T.latest, detail: 'v' + app.getVersion() }); return; }
  manualCheck = !!manual;
  updater.checkForUpdates().catch(() => {});
}

function buildMenu() {
  const appItems = [{ label: T.about, click: () => dialog.showMessageBox(win, { type: 'info', buttons: ['OK'], title: 'Nexus Media', message: 'Nexus Media', detail: 'Media for Sustainable Impact\nХувилбар ' + app.getVersion() }) }, { label: T.check, click: () => checkUpdates(true) }];
  const view = { label: 'Харагдац', submenu: [{ role: 'reload', label: T.reload }, { type: 'separator' }, { role: 'resetZoom', label: 'Анхны хэмжээ' }, { role: 'zoomIn', label: 'Томруулах' }, { role: 'zoomOut', label: 'Жижигрүүлэх' }, { type: 'separator' }, { role: 'togglefullscreen', label: 'Бүтэн дэлгэц' }] };
  const tpl = isMac
    ? [{ label: 'Nexus Media', submenu: [...appItems, { type: 'separator' }, { role: 'hide', label: 'Нуух' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit', label: 'Гарах' }] }, { role: 'editMenu' }, view, { role: 'windowMenu' }]
    : [{ label: 'Nexus Media', submenu: [...appItems, { type: 'separator' }, { role: 'quit', label: 'Гарах' }] }, { role: 'editMenu', label: 'Засах' }, view];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

app.whenReady().then(() => {
  // Google нэвтрэлт Electron-ыг танихгүй тул энгийн Chrome хөтөч шиг танилцуулна
  const ua = session.defaultSession.getUserAgent().replace(/\s?Electron\/[\d.]+/i, '').replace(/\s?(nexus-media|Nexus Media)\/[\d.]+/ig, '');
  app.userAgentFallback = ua;
  session.defaultSession.setUserAgent(ua);
  // Дуудлага, дуут мессеж: микрофон, камер, мэдэгдлийг зөвхөн манай сайтад зөвшөөрнө
  const siteUrl = (u) => { try { return new URL(u).origin === SITE_ORIGIN; } catch (e) { return false; } };
  session.defaultSession.setPermissionRequestHandler(async (wc, permission, done, details) => {
    const ok = ['media', 'notifications', 'fullscreen', 'display-capture', 'clipboard-sanitized-write'].includes(permission) && siteUrl((details && details.requestingUrl) || wc.getURL());
    if (ok && permission === 'media' && isMac) {
      try { for (const k of (details.mediaTypes || [])) await systemPreferences.askForMediaAccess(k === 'video' ? 'camera' : 'microphone'); } catch (e) {}
    }
    done(ok);
  });
  // Дэлгэц хуваалцах: үндсэн дэлгэцийг хуваалцана
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    if (!siteUrl(request.securityOrigin)) { try { callback(); } catch (e) {} return; }
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      if (sources.length) callback({ video: sources[0] }); else { try { callback(); } catch (e) {} }
    }).catch(() => { try { callback(); } catch (e) {} });
  });
  buildMenu();
  createWindow();
  setupUpdates();
  app.on('activate', () => { if (win) showWin(); else createWindow(); });
});
app.on('before-quit', () => { quitting = true; saveState(); });
app.on('window-all-closed', () => { if (!isMac) app.quit(); });
