const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/main.cjs'), 'utf8');
async function open(saved) {
  let options, maximized = false;
  const callbacks = new Map();
  const context = vm.createContext({ mainWindow: null, path, __dirname: '/app', dataPath: value => value,
    readJson: async () => saved, screen: { getAllDisplays: () => [{ workArea: {x:0,y:0,width:1920,height:1080} }] },
    fs: { writeFileSync: () => {} }, setTimeout, clearTimeout, shell: {},
    BrowserWindow: class {
      constructor(value) { options=value; this.webContents={setWindowOpenHandler:()=>{}}; }
      once(name, callback) { callbacks.set(name,callback); }
      on() {}
      async loadFile() { callbacks.get('ready-to-show')(); }
      maximize() { maximized=true; }
      show() {}
    },
  });
  vm.runInContext(source.slice(source.indexOf('async function createWindow('), source.indexOf("ipcMain.handle('session:get'")),context);
  await context.createWindow();
  return {options,maximized};
}
test('first launch opens maximized', async () => assert.equal((await open(null)).maximized,true));
test('normal saved size and location are restored', async () => {
  const {options,maximized}=await open({maximized:false,bounds:{x:80,y:40,width:1100,height:700}});
  assert.equal(maximized,false); assert.equal(options.width,1100); assert.equal(options.x,80);
});
test('unplugged monitor coordinates do not strand the window offscreen', async () => {
  const {options}=await open({maximized:false,bounds:{x:4000,y:0,width:1100,height:700}});
  assert.equal(options.x,undefined); assert.equal(options.width,1180);
});
