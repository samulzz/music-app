// Run with Electron, not node:test. Render the app's real HTML/CSS without app logic or network access.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
app.disableHardwareAcceleration();
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'nation-layout-')));
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const root = path.join(__dirname, '../src/renderer');
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace('<link rel="stylesheet" href="./styles.css" />', `<style>${css}</style>`);
  for (const width of [1280, 1920, 2560]) {
    const win = new BrowserWindow({ width, height: 900, useContentSize: true, show: false, webPreferences: { offscreen: true } });
    await win.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
    win.webContents.enableDeviceEmulation({screenPosition:'desktop',screenSize:{width,height:900},viewSize:{width,height:900},deviceScaleFactor:1,scale:1});
    const layout = await win.webContents.executeJavaScript(`
      document.querySelector('#auth-screen').classList.add('hidden');
      document.querySelector('#app-shell').classList.remove('hidden');
      document.querySelector('#content-view').innerHTML='<section class="home-hero"><div class="home-hero-copy"><h2>Sua música</h2></div></section>';
      const r=document.querySelector('#content-view').getBoundingClientRect();
      ({ viewport:innerWidth, width:r.width, left:r.left, right:r.right, overflow:document.documentElement.scrollWidth>innerWidth });
    `);
    assert.ok(layout.left <= 40 && layout.right >= layout.viewport - 40, JSON.stringify(layout));
    assert.equal(layout.viewport,width);
    assert.equal(layout.overflow, false);
    console.log(JSON.stringify(layout));
    win.destroy();
  }
  app.quit();
}).catch(error => { console.error(String(error.message).split('data:')[0]); app.exit(1); });
