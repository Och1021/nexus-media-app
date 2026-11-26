// Сайтад «апп дотор ажиллаж байна» гэдгийг мэдэгдэж, тэмдэг, мэдэгдлийн жижиг функцүүдийг өгнө.
const { contextBridge, ipcRenderer } = require('electron');
let info = { version: '', platform: '' };
try { info = ipcRenderer.sendSync('app-info') || info; } catch (e) {}
contextBridge.exposeInMainWorld('nexusApp', {
  isApp: true,
  version: info.version,
  platform: info.platform,
  setBadge: (n) => ipcRenderer.send('badge', Number(n) || 0),
  attention: () => ipcRenderer.send('attention'),
  focus: () => ipcRenderer.send('focus'),
  checkUpdates: () => ipcRenderer.send('check-updates')
});
