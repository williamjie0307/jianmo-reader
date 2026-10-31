'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const iconv = require('iconv-lite');
const security = require('../src/security.cjs');
const {isMarkdownPath, isPathInside, safeRelativePath, resolveWithin, readMarkdown, resolveImage, parseCommandLine, MAX_MARKDOWN_BYTES, MAX_IMAGE_BYTES} = security;

async function fixture(t, {cleanup = true} = {}) {
  const temp = await fs.mkdtemp(path.join(__dirname, '.security-test-'));
  if (cleanup) t.after(() => fs.rm(temp, {recursive:true, force:true}));
  const root = path.join(temp, 'allowed');
  const sibling = path.join(temp, 'allowed-other');
  await fs.mkdir(path.join(root, 'nested'), {recursive:true});
  await fs.mkdir(sibling);
  await fs.writeFile(path.join(root, 'note.md'), '# Hello\n中文');
  await fs.writeFile(path.join(sibling, 'secret.md'), 'PRIVATE OUTSIDE CONTENT');
  const pixel = await fs.readFile(path.join(__dirname, 'fixtures/security/pixel.png'));
  await fs.writeFile(path.join(root, 'pixel.png'), pixel);
  await fs.writeFile(path.join(sibling, 'secret.png'), Buffer.concat([pixel, Buffer.from('PRIVATE OUTSIDE IMAGE')]));
  return {temp, root, sibling, pixel};
}
async function symlinkOrSkip(t, target, link, type = 'file') {
  try { await fs.symlink(target, link, type); return true; }
  catch (error) {
    if (['EPERM','EACCES','ENOTSUP'].includes(error.code)) { t.skip(`Symlink creation unavailable: ${error.code}`); return false; }
    throw error;
  }
}

test('only Markdown extensions are accepted, including case variants', () => {
  for (const name of ['x.md', 'x.MD', 'x.markdown', 'x.MARKDOWN', 'x.mdown', 'path with spaces/中文.md']) assert.equal(isMarkdownPath(name), true, name);
  for (const name of [null, undefined, {}, '', 'x.md.exe', 'x.txt', 'x.md?query', 'x.md#hash']) assert.equal(isMarkdownPath(name), false, String(name));
});

test('path boundary excludes traversal and sibling-prefix matches', () => {
  const root = path.resolve('test', 'allowed');
  assert.equal(isPathInside(root, root), true);
  assert.equal(isPathInside(root, path.join(root, 'nested', 'x')), true);
  assert.equal(isPathInside(root, `${root}-other/x`), false);
  assert.equal(isPathInside(root, path.resolve(root, '..', 'secret')), false);
});

test('relative file references reject schemes, absolute paths, backslashes and null bytes', () => {
  for (const value of ['https://example.com/x.png', 'HTTP://example.com/x.png', 'file:///etc/passwd', 'data:image/png;base64,AA==', 'javascript:alert(1)', '//server/share.png', '/etc/passwd', 'C:\\Windows\\win.ini', 'C:/Windows/win.ini', '\\\\server\\share', 'nested\\pixel.png', 'x\0.png', null, {}]) {
    assert.throws(() => safeRelativePath(value), undefined, String(value));
  }
  assert.equal(safeRelativePath('images/中文 image.png'), 'images/中文 image.png');
});

test('canonical resolver accepts in-root paths and safe parent navigation within chosen root', async (t) => {
  const {root} = await fixture(t);
  assert.equal(await resolveWithin(root, 'note.md'), await fs.realpath(path.join(root, 'note.md')));
  assert.equal(await resolveWithin(root, '../pixel.png', path.join(root, 'nested')), await fs.realpath(path.join(root, 'pixel.png')));
});

test('canonical resolver rejects existing traversal and prefix-sibling paths', async (t) => {
  const {root} = await fixture(t);
  await assert.rejects(resolveWithin(root, '../allowed-other/secret.md'));
  await assert.rejects(resolveWithin(root, 'nested/../../allowed-other/secret.md'));
});

test('canonical resolver rejects file symlinks escaping selected root', async (t) => {
  const {root, sibling} = await fixture(t);
  if (!await symlinkOrSkip(t, path.join(sibling, 'secret.md'), path.join(root, 'escape.md'))) return;
  await assert.rejects(resolveWithin(root, 'escape.md'));
});

test('canonical resolver rejects directory symlinks escaping selected root', async (t) => {
  const {root, sibling} = await fixture(t);
  if (!await symlinkOrSkip(t, sibling, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')) return;
  await assert.rejects(resolveWithin(root, 'escape/secret.md'));
});

test('canonical resolver allows symlinks that remain inside selected root', async (t) => {
  const {root} = await fixture(t);
  if (!await symlinkOrSkip(t, path.join(root, 'note.md'), path.join(root, 'alias.md'))) return;
  assert.equal(await resolveWithin(root, 'alias.md'), await fs.realpath(path.join(root, 'note.md')));
});

test('Markdown read returns UTF-8 content and canonical file metadata', async (t) => {
  const {root} = await fixture(t);
  const result = await readMarkdown(path.join(root, 'note.md'));
  assert.equal(result.text, '# Hello\n中文');
  assert.equal(result.encoding, 'UTF-8');
  assert.equal(result.path, await fs.realpath(path.join(root, 'note.md')));
  assert.equal(result.name, 'note.md');
  assert.equal(typeof result.mtime, 'number');
  assert.equal(result.size, Buffer.byteLength(result.text));
});

test('Markdown reader supports UTF-8 BOM, UTF-16 LE/BE and GB18030', async (t) => {
  const {root} = await fixture(t);
  const text = '# 中文编码';
  for (const [fileEncoding, expectedEncoding] of [['utf8','UTF-8'], ['utf16-le','UTF-16 LE'], ['utf16-be','UTF-16 BE'], ['gb18030','GB18030']]) {
    const file = path.join(root, `${fileEncoding}.md`);
    await fs.writeFile(file, iconv.encode(text, fileEncoding, {addBOM:fileEncoding !== 'gb18030'}));
    const result = await readMarkdown(file);
    assert.equal(result.text, text, fileEncoding);
    assert.equal(result.encoding, expectedEncoding, fileEncoding);
  }
});

test('Markdown reader rejects null-containing binary data', async (t) => {
  const {root} = await fixture(t);
  const file = path.join(root, 'binary.md');
  await fs.writeFile(file, Buffer.from([0x41, 0, 0x42]));
  await assert.rejects(readMarkdown(file));
});

test('Markdown reader rejects non-Markdown extensions and directories', async (t) => {
  const {root} = await fixture(t);
  await assert.rejects(readMarkdown(path.join(root, 'pixel.png')));
  const dir = path.join(root, 'directory.md');
  await fs.mkdir(dir);
  await assert.rejects(readMarkdown(dir));
});

test('Markdown reader rejects oversized files without loading them', async (t) => {
  const {root} = await fixture(t);
  const file = path.join(root, 'large.md');
  await fs.writeFile(file, '');
  await fs.truncate(file, MAX_MARKDOWN_BYTES + 1);
  await assert.rejects(readMarkdown(file), /限制|过大|large|limit/i);
});

test('local raster image returns bounded bytes and MIME', async (t) => {
  const {root, pixel} = await fixture(t);
  const image = await resolveImage(root, 'pixel.png');
  assert.equal(image.mime, 'image/png');
  assert.deepEqual(image.buffer, pixel);
  assert.equal(image.file, await fs.realpath(path.join(root, 'pixel.png')));
});

test('image resolver rejects remote/file/data URLs and absolute paths', async (t) => {
  const {root} = await fixture(t);
  for (const value of ['https://example.invalid/remote.png', 'http://example.invalid/remote.png', '//example.invalid/remote.png', 'file:///etc/passwd', 'data:image/png;base64,AAA=', path.join(root, 'pixel.png')]) await assert.rejects(resolveImage(root, value), undefined, value);
});

test('image resolver rejects SVG and other non-raster extensions', async (t) => {
  const {root} = await fixture(t);
  for (const name of ['vector.svg', 'page.html', 'document.pdf']) {
    await fs.writeFile(path.join(root, name), '<svg onload="alert(1)"></svg>');
    await assert.rejects(resolveImage(root, name));
  }
});

test('image resolver rejects traversal outside document or folder capability', async (t) => {
  const {root} = await fixture(t);
  await assert.rejects(resolveImage(root, '../allowed-other/secret.png'));
});

test('image resolver rejects symlink escape', async (t) => {
  const {root, sibling} = await fixture(t);
  if (!await symlinkOrSkip(t, path.join(sibling, 'secret.png'), path.join(root, 'escape.png'))) return;
  await assert.rejects(resolveImage(root, 'escape.png'));
});

test('image resolver enforces size limit', async (t) => {
  const {root} = await fixture(t);
  const file = path.join(root, 'large.png');
  await fs.writeFile(file, '');
  await fs.truncate(file, MAX_IMAGE_BYTES + 1);
  await assert.rejects(resolveImage(root, 'large.png'), /限制|过大|large|limit/i);
});

test('command line only accepts Markdown paths, never flags or arbitrary file types', () => {
  const cwd = path.resolve('test');
  assert.deepEqual(parseCommandLine(['electron', '.', '--inspect', '--evil.md', 'book.md', 'my notes.MARKDOWN', 'script.js', 'data.json'], cwd), [path.join(cwd, 'book.md'), path.join(cwd, 'my notes.MARKDOWN')]);
});

test('image resolver denies final-component symlink swap after canonical check', async (t) => {
  const {root, sibling} = await fixture(t);
  const imageFile = path.join(root, 'pixel.png');
  const originalOpen = fs.open;
  let swapped = false, reads = 0;
  fs.open = async function(file, ...args) {
    if (file === imageFile && !swapped) {
      swapped = true;
      await fs.unlink(imageFile);
      if (!await symlinkOrSkip(t, path.join(sibling, 'secret.png'), imageFile)) throw new Error('Symlinks unavailable');
    }
    const handle = await originalOpen.call(this, file, ...args);
    if (file === imageFile) {
      const originalRead = handle.read.bind(handle);
      handle.read = (...readArgs) => { reads += 1; return originalRead(...readArgs); };
    }
    return handle;
  };
  try {
    await assert.rejects(resolveImage(root, 'pixel.png'), 'Outside bytes must not be returned after a checked path is replaced with a symlink.');
  assert.equal(reads, 0, 'Reject an unauthorized descriptor before reading any bytes.');
  } finally { fs.open = originalOpen; }
});

test('image resolver denies parent-directory symlink swap after canonical check', async (t) => {
  const {root, sibling, pixel} = await fixture(t);
  const parent = path.join(root, 'nested');
  const imageFile = path.join(parent, 'pixel.png');
  await fs.writeFile(imageFile, pixel);
  await fs.writeFile(path.join(sibling, 'pixel.png'), Buffer.concat([pixel, Buffer.from('PRIVATE OUTSIDE IMAGE')]));
  const originalOpen = fs.open;
  let swapped = false, reads = 0;
  fs.open = async function(file, ...args) {
    if (file === imageFile && !swapped) {
      swapped = true;
      await fs.rename(parent, `${parent}-original`);
      if (!await symlinkOrSkip(t, sibling, parent, process.platform === 'win32' ? 'junction' : 'dir')) throw new Error('Symlinks unavailable');
    }
    const handle = await originalOpen.call(this, file, ...args);
    if (file === imageFile) {
      const originalRead = handle.read.bind(handle);
      handle.read = (...readArgs) => { reads += 1; return originalRead(...readArgs); };
    }
    return handle;
  };
  try {
    await assert.rejects(resolveImage(root, 'nested/pixel.png'), 'Outside bytes must not be returned after a checked parent is replaced with a symlink.');
  assert.equal(reads, 0, 'Reject an unauthorized descriptor before reading any bytes.');
  } finally { fs.open = originalOpen; }
});

test('image resolver rejects SVG contents disguised with a raster extension', async (t) => {
  const {root} = await fixture(t);
  await fs.writeFile(path.join(root, 'disguised.png'), '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  await assert.rejects(resolveImage(root, 'disguised.png'));
});

const vm = require('node:vm');
const syncFs = require('node:fs');

function loadPreload() {
  let bridge;
  const calls = [];
  const actualFiles = new WeakMap();
  const listeners = new Map();
  const ipcRenderer = {
    invoke: async (...args) => { calls.push(args); return []; },
    on: (name, listener) => listeners.set(name, listener),
    removeListener: (name, listener) => { if (listeners.get(name) === listener) listeners.delete(name); },
  };
  vm.runInNewContext(syncFs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8'), {
    require(name) {
      assert.equal(name, 'electron');
      return {
        contextBridge: {exposeInMainWorld: (name, api) => { assert.equal(name, 'reader'); bridge = api; }},
        ipcRenderer,
        webUtils: {getPathForFile: file => { if (!actualFiles.has(file)) throw new Error('Not a File'); return actualFiles.get(file); }},
      };
    },
  }, {filename:'preload.cjs'});
  return {bridge, calls, actualFiles, listeners};
}

test('preload refuses arbitrary renderer paths without invoking main process', async () => {
  const {bridge, calls} = loadPreload();
  await assert.rejects(bridge.openPaths(['/unselected/private.md']));
  await assert.rejects(bridge.openPaths('arbitrary.md'));
  assert.equal(calls.length, 0);
  assert.throws(() => bridge.pathForFile({path:'/unselected/private.md'}));
});

test('preload allows real dropped file paths once and rejects reuse or mixed paths', async () => {
  const {bridge, calls, actualFiles} = loadPreload();
  const file = {};
  actualFiles.set(file, '/chosen/document.md');
  assert.equal(bridge.pathForFile(file), '/chosen/document.md');
  await assert.rejects(bridge.openPaths(['/chosen/document.md','/unselected/private.md']));
  assert.equal(calls.length, 0);
  await bridge.openPaths(['/chosen/document.md']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'reader:openPaths');
  assert.deepEqual(calls[0][1], ['/chosen/document.md']);
  await assert.rejects(bridge.openPaths(['/chosen/document.md']));
  assert.equal(calls.length, 1);
});

async function loadMain(t, options = {}) {
  const fixtureData = await fixture(t, {cleanup:false});
  const profile = path.join(fixtureData.temp, 'profile');
  await fs.mkdir(profile);
  const profileFiles = typeof options.profileFiles === 'function' ? options.profileFiles(fixtureData) : options.profileFiles;
  for (const [name, value] of Object.entries(profileFiles || {})) {
    await fs.writeFile(path.join(profile, name), typeof value === 'string' ? value : JSON.stringify(value));
  }
  const sent = [], timers = new Set();
  const addTimer = (callback, delay, repeat) => {
    const timer = {callback, delay, repeat, unref() {return this;}};
    timers.add(timer);
    return timer;
  };
  const clearTimer = timer => timers.delete(timer);
  let context;
  t.after(async () => {
    timers.clear();
    if (context) await vm.runInContext('saveQueue', context);
    await fs.rm(fixtureData.temp, {recursive:true, force:true});
  });
  await fs.mkdir(path.join(fixtureData.temp, 'dist'));
  await fs.writeFile(path.join(fixtureData.temp, 'dist/index.html'), '<!doctype html><h1>Trusted app UI</h1>');
  await fs.writeFile(path.join(fixtureData.temp, 'dist/renderer.js'), '/* trusted app code */');
  const handlers = new Map(), protocols = new Map(), external = [], permissionHandlers = {}, appEvents = new Map(), sessionEvents = new Map();
  let window, startup, nextDialog = {canceled:true,filePaths:[]}, nextConfirmation = 0, requestFilter;
  const app = {
    setName() {}, setAppUserModelId() {}, getVersion: () => 'test',
    getPath: () => profile, requestSingleInstanceLock: () => true,
    on: (name, handler) => appEvents.set(name, handler), quit() {},
    whenReady: () => ({then(handler) { startup = Promise.resolve().then(handler); return startup; }}),
  };
  class BrowserWindow {
    constructor(options) {
      this.options = options; this.events = new Map();
      this.webContents = {
        mainFrame:{url:''},
        on() {}, send: (...args) => sent.push(args), setWindowOpenHandler(handler) { this.windowOpenHandler = handler; },
        findInPage() {}, stopFindInPage() {},
      };
      window = this;
    }
    once(name, fn) { this.events.set(name, fn); }
    on(name, fn) { this.events.set(name, fn); }
    loadURL(url) { this.webContents.mainFrame.url = url; return Promise.resolve(); }
    show() {} focus() {} restore() {} isMinimized() { return false; } isDestroyed() { return !!this.destroyed; }
    close() {
      let prevented = false;
      this.events.get('close')?.({preventDefault:()=>{prevented = true;}});
      if (!prevented) {this.destroyed = true; this.events.get('closed')?.();}
    }
  }
  const electron = {
    app, BrowserWindow,
    Menu:{setApplicationMenu() {}, buildFromTemplate: template => template},
    dialog:{showOpenDialog: async () => nextDialog, showSaveDialog: async () => nextDialog, showMessageBox: async () => ({response:nextConfirmation}), showErrorBox: (_title, message) => { throw new Error(message); }},
    ipcMain:{handle:(name, handler) => handlers.set(name, handler)},
    protocol:{registerSchemesAsPrivileged() {}, handle:async (name, handler) => protocols.set(name, handler)},
    net:{fetch:async () => new Response('Static app bytes')},
    session:{defaultSession:{
      setPermissionRequestHandler: handler => { permissionHandlers.request = handler; },
      setPermissionCheckHandler: handler => { permissionHandlers.check = handler; },
      on:(name,handler) => sessionEvents.set(name,handler), webRequest:{onBeforeRequest: handler => { requestFilter = handler; }},
    }},
    shell:{openExternal: async url => { external.push(url); }},
  };
  context = vm.createContext({
    require: name => name === 'electron' ? electron : name === './security.cjs' ? security : name === './state.cjs' ? require('../src/state.cjs') : name === './save.cjs' ? require('../src/save.cjs') : require(name),
    __dirname:path.join(fixtureData.temp, 'src'),
    process:{argv:typeof options.argv === 'function' ? options.argv(fixtureData) : (options.argv || ['electron','.']),platform:process.platform,cwd:()=>fixtureData.temp},
    setTimeout:(callback, delay) => addTimer(callback, delay, false), clearTimeout:clearTimer,
    setInterval:(callback, delay) => addTimer(callback, delay, true), clearInterval:clearTimer,
    URL, Response, Headers, console,
  });
  vm.runInContext(syncFs.readFileSync(path.join(__dirname, '../src/main.cjs'), 'utf8'), context, {filename:'main.cjs'});
  await startup;
  const trusted = () => ({sender:window.webContents,senderFrame:window.webContents.mainFrame});
  return {
    ...fixtureData, profile, handlers, protocols, external, permissionHandlers, sessionEvents, appEvents, window, trusted, sent,
    async runTimers({repeat = false} = {}) {
      for (const timer of [...timers]) {
        if (timer.repeat !== repeat || !timers.has(timer)) continue;
        if (!timer.repeat) timers.delete(timer);
        await timer.callback();
      }
      await eventually(() => vm.runInContext('!refreshRunning', context));
    },
    drain:() => vm.runInContext('saveQueue', context),
    call:(name,...args) => handlers.get(`reader:${name}`)(trusted(),...args),
    setDialog: value => { nextDialog = value; },
    setConfirmation: value => { nextConfirmation = value; },
    requestAllowed(url, webContentsId = 1) { let allowed; requestFilter({url,webContentsId}, value => { allowed = !value.cancel; }); return allowed; },
  };
}

async function eventually(check, message = 'Expected asynchronous operation to finish') {
  const deadline = Date.now() + 2500;
  let lastError;
  while (Date.now() < deadline) {
    try {const result = await check(); if (result) return result;} catch (error) {lastError = error;}
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw lastError || new Error(message);
}

async function savedJSON(main, filename, check = () => true) {
  await main.runTimers();
  return eventually(async () => {
    const saved = JSON.parse(await fs.readFile(path.join(main.profile, filename), 'utf8'));
    return check(saved) ? saved : null;
  }, `Expected ${filename} to be saved`);
}

test('main process uses isolated sandboxed renderer and denies new windows', async (t) => {
  const main = await loadMain(t);
  const prefs = main.window.options.webPreferences;
  assert.equal(prefs.nodeIntegration, false);
  assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.sandbox, true);
  assert.equal(prefs.webSecurity, true);
  assert.equal(prefs.allowRunningInsecureContent, false);
  assert.equal(prefs.webviewTag, false);
  assert.equal(main.window.webContents.windowOpenHandler().action, 'deny');
});

test('IPC requires exact app URL, owning web contents and main frame', async (t) => {
  const main = await loadMain(t);
  const handler = main.handlers.get('reader:getVersion');
  assert.equal(await handler(main.trusted()), 'test');
  await assert.rejects(handler({sender:{},senderFrame:main.window.webContents.mainFrame}));
  await assert.rejects(handler({sender:main.window.webContents,senderFrame:{url:'reader://app/index.html'}}));
  main.window.webContents.mainFrame.url = 'https://example.invalid';
  await assert.rejects(handler(main.trusted()));
});

test('renderer network requests, downloads and permission grants are denied by default', async (t) => {
  const main = await loadMain(t);
  for (const url of ['https://example.invalid','http://example.invalid','file:///etc/passwd','ws://example.invalid','wss://example.invalid']) assert.equal(main.requestAllowed(url), false, url);
  assert.equal(main.requestAllowed('reader://app/index.html'), true);
  assert.equal(main.requestAllowed('mdasset://document/image.png'), true);
  assert.equal(main.requestAllowed('file:///application/dist/renderer.js', -1), false);
  assert.equal(main.permissionHandlers.check(), false);
  let granted;
  main.permissionHandlers.request(null, 'camera', value => { granted = value; });
  assert.equal(granted, false);
  let downloadPrevented = false;
  main.sessionEvents.get('will-download')({preventDefault:()=>{downloadPrevented=true;}});
  assert.equal(downloadPrevented, true);
});

test('external links require HTTPS and an affirmative native dialog', async (t) => {
  const main = await loadMain(t);
  main.setDialog({canceled:false,filePaths:[path.join(main.root, 'note.md')]});
  const [doc] = await main.call('openFiles');
  await main.call('openLink', doc.id, 'https://example.com/page');
  assert.equal(main.external.length, 0);
  main.setConfirmation(1);
  await main.call('openLink', doc.id, 'https://example.com/page');
  assert.deepEqual(main.external, ['https://example.com/page']);
  for (const link of ['http://example.com','javascript:alert(1)','file:///private.md','https://user:secret@example.com/','data:text/html,hello','//example.com/document.md']) await assert.rejects(main.call('openLink', doc.id, link), undefined, link);
  assert.equal(main.external.length, 1);
});

test('folder browsing requires a chosen capability and blocks traversal', async (t) => {
  const main = await loadMain(t);
  await assert.rejects(main.call('listDirectory', 'unselected', ''));
  await assert.rejects(main.call('openFolderFile', 'unselected', 'note.md'));
  main.setDialog({canceled:false,filePaths:[main.root]});
  const folder = await main.call('chooseFolder');
  assert.ok(folder.id);
  assert.ok(folder.children.some(child => child.name === 'note.md'));
  assert.equal(folder.children.some(child => child.name === 'pixel.png'), false);
  await assert.rejects(main.call('listDirectory', folder.id, '../allowed-other'));
  await assert.rejects(main.call('openFolderFile', folder.id, '../allowed-other/secret.md'));
});

test('document close revokes image capabilities, and protocol paths cannot escape', async (t) => {
  const main = await loadMain(t);
  main.setDialog({canceled:false,filePaths:[path.join(main.root, 'note.md')]});
  const [doc] = await main.call('openFiles');
  assert.equal('root' in doc, false);
  const asset = main.protocols.get('mdasset');
  const response = await asset({url:`mdasset://${doc.id}/pixel.png`,method:'GET'});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/png');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  const escape = await asset({url:`mdasset://${doc.id}/..%2Fallowed-other%2Fsecret.png`,method:'GET'});
  assert.equal(escape.status, 404);
  await main.call('closeFile', doc.id);
  assert.equal((await asset({url:`mdasset://${doc.id}/pixel.png`,method:'GET'})).status, 404);
});

test('installer does not overwrite Markdown default associations', () => {
  const pkg = JSON.parse(syncFs.readFileSync(path.join(__dirname, '../package.json'),'utf8'));
  assert.equal(pkg.build.fileAssociations, undefined);
  const installer = syncFs.readFileSync(path.join(__dirname, '../build/installer.nsh'),'utf8');
  for (const line of installer.split('\n').filter(value => /^\s*WriteReg/.test(value))) {
    assert.ok(line.includes('Software\\Classes\\Applications\\${APP_EXECUTABLE_FILENAME}'), line);
  }
});

test('a selected root replaced by an outside symlink cannot expand authorization', async (t) => {
  const {root, sibling} = await fixture(t);
  await fs.rename(root, `${root}-original`);
  if (!await symlinkOrSkip(t, sibling, root, process.platform === 'win32' ? 'junction' : 'dir')) return;
  await assert.rejects(resolveWithin(root, 'secret.md'));
  await assert.rejects(resolveImage(root, 'secret.png'));
  await assert.rejects(readMarkdown(path.join(root, 'secret.md'), root));
});

test('authorized Markdown reads reject canonical paths outside their chosen root', async (t) => {
  const {root, sibling} = await fixture(t);
  await assert.rejects(readMarkdown(path.join(sibling, 'secret.md'), root));
  assert.equal((await readMarkdown(path.join(root, 'note.md'), root)).text, '# Hello\n中文');
});

test('all supported raster formats accept matching signatures and reject mismatches', async (t) => {
  const {root} = await fixture(t);
  const formats = [
    ['png', Buffer.from('89504e470d0a1a0a','hex'), 'image/png'],
    ['jpg', Buffer.from('ffd8ffe0','hex'), 'image/jpeg'],
    ['jpeg', Buffer.from('ffd8ffe1','hex'), 'image/jpeg'],
    ['gif', Buffer.from('GIF89a'), 'image/gif'],
    ['webp', Buffer.from('RIFF0000WEBP'), 'image/webp'],
    ['bmp', Buffer.concat([Buffer.from('BM'), Buffer.alloc(12)]), 'image/bmp'],
    ['ico', Buffer.from([0,0,1,0,1,0]), 'image/x-icon'],
    ['avif', Buffer.from('00000014667479706d6966310000000061766966','hex'), 'image/avif'],
  ];
  for (const [extension, bytes, mime] of formats) {
    const filename = `signature.${extension}`;
    await fs.writeFile(path.join(root, filename), bytes);
    assert.equal((await resolveImage(root, filename)).mime, mime, extension);
    await fs.writeFile(path.join(root, filename), '<svg><script>not a raster image</script></svg>');
    await assert.rejects(resolveImage(root, filename), undefined, extension);
  }
});

test('folder browsing rejects a directory swapped outside root before enumeration', async (t) => {
  const main = await loadMain(t);
  main.setDialog({canceled:false,filePaths:[main.root]});
  const folder = await main.call('chooseFolder');
  const directory = path.join(main.root, 'nested');
  const originalReaddir = fs.readdir;
  let swapped = false;
  fs.readdir = async function(file, ...args) {
    if (file === directory && !swapped) {
      swapped = true;
      await fs.rename(directory, `${directory}-original`);
      if (!await symlinkOrSkip(t, main.sibling, directory, process.platform === 'win32' ? 'junction' : 'dir')) throw new Error('Symlinks unavailable');
    }
    return originalReaddir.call(this, file, ...args);
  };
  try {
    await assert.rejects(main.call('listDirectory', folder.id, 'nested'), 'Outside directory entries must not be returned after a checked directory is replaced.');
  } finally { fs.readdir = originalReaddir; }
});

test('app static protocol sends restrictive CSP and cannot leave bundled assets', async (t) => {
  const main = await loadMain(t);
  const reader = main.protocols.get('reader');
  const response = await reader({url:'reader://app/index.html',method:'GET'});
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type'), /^text\/html/);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  const csp = response.headers.get('Content-Security-Policy');
  for (const directive of ["default-src 'none'", "script-src 'self'", "connect-src 'none'", "object-src 'none'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(csp.includes(directive), directive);
  assert.equal(await response.text(), '<!doctype html><h1>Trusted app UI</h1>');
  assert.equal((await reader({url:'reader://outside/index.html',method:'GET'})).status, 403);
  assert.equal((await reader({url:'reader://app/index.html',method:'POST'})).status, 403);
  assert.equal((await reader({url:'reader://app/..%2Fallowed-other%2Fsecret.md',method:'GET'})).status, 404);
});

test('v1.1 preload exposes bounded session/history IPC and strips Electron event objects', async () => {
  const {bridge,calls,listeners} = loadPreload();
  const snapshot = {tabs:[{id:'open-document-id',scroll:123}],activeId:'open-document-id'};
  await bridge.getHistory();
  await bridge.openRecent('known-recent-id');
  await bridge.clearHistory();
  await bridge.saveSession(snapshot);
  assert.deepEqual(calls,[['reader:getHistory'],['reader:openRecent','known-recent-id'],['reader:clearHistory'],['reader:saveSession',snapshot]]);
  for (const [method,event] of [['onHistoryChanged','historyChanged'],['onSessionRestored','sessionRestored'],['onDocumentChanged','documentChanged'],['onSessionRequested','requestSession']]) {
    const received = [], payload = {test:'safe payload'}, privilegedEvent = {sender:{send(){}}};
    const stop = bridge[method]((...args)=>received.push(args));
    listeners.get(`reader:${event}`)(privilegedEvent,payload);
    assert.deepEqual(received, [[payload]], 'Renderer callbacks must never receive the privileged IPC event.');
    stop();
    assert.equal(listeners.has(`reader:${event}`), false);
  }
  assert.equal(bridge.readFile, undefined);
  assert.equal(bridge.invoke, undefined);
});

test('all new session/history IPC endpoints reject non-owning renderer requests', async (t) => {
  const main = await loadMain(t);
  for (const name of ['getHistory','openRecent','clearHistory','saveSession']) {
    const handler = main.handlers.get(`reader:${name}`);
    assert.equal(typeof handler, 'function', name);
    await assert.rejects(handler({sender:{},senderFrame:main.window.webContents.mainFrame}), /不受信任/);
    await assert.rejects(handler({sender:main.window.webContents,senderFrame:{url:'reader://app/index.html'}}), /不受信任/);
  }
});

test('saved session capabilities come only from currently open document IDs', async (t) => {
  const main = await loadMain(t);
  const file = path.join(main.root,'note.md'), outside = path.join(main.sibling,'secret.md');
  main.setDialog({canceled:false,filePaths:[file]});
  const [doc] = await main.call('openFiles');
  await main.call('saveSession',{tabs:[
    {id:'forged-id',path:outside,root:main.sibling,text:'PRIVATE OUTSIDE CONTENT',scroll:500},
    {id:doc.id,path:outside,root:main.sibling,text:'PRIVATE INJECTED TEXT',scroll:321},
    {id:doc.id,scroll:999},
  ],activeId:'forged-id',activePath:outside});
  const saved = await savedJSON(main,'reading-state.json');
  assert.deepEqual(saved.tabs,[{path:await fs.realpath(file),root:await fs.realpath(main.root),scroll:321}]);
  assert.equal(saved.activePath, await fs.realpath(file));
  assert.equal(JSON.stringify(saved).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(saved).includes(main.sibling), false);
  assert.equal(JSON.stringify(saved).includes('# Hello'), false);
  assert.equal(saved.recent.length, 1);
  assert.deepEqual(Object.keys(saved.recent[0]).sort(),['id','openedAt','path','root']);
});

test('session snapshots reject malformed shapes and bound saved tabs and scroll values', async (t) => {
  const main = await loadMain(t);
  for (const value of [null,{},[],{tabs:{}},{tabs:Array(101).fill({id:'invalid'})}]) await assert.rejects(main.call('saveSession',value));
  main.setDialog({canceled:false,filePaths:[path.join(main.root,'note.md')]});
  const [doc] = await main.call('openFiles');
  for (const [scroll,expected] of [[-50,0],[Infinity,0],['600',0],[1e12,1e9]]) {
    await main.call('saveSession',{tabs:[{id:doc.id,scroll}],activeId:doc.id});
    assert.equal((await savedJSON(main,'reading-state.json')).tabs[0].scroll, expected);
  }
});

test('recent history deduplicates files, exposes no root or text, and refuses arbitrary paths or IDs', async (t) => {
  const main = await loadMain(t);
  const file = path.join(main.root,'note.md');
  for (const value of [file,'unknown-id',{path:file},null]) await assert.rejects(main.call('openRecent',value));
  main.setDialog({canceled:false,filePaths:[file,file]});
  const [doc] = await main.call('openFiles');
  const [duplicate] = await main.call('openFiles');
  assert.equal(duplicate.id,doc.id);
  const history = await main.call('getHistory');
  assert.equal(history.length,1);
  assert.equal(history[0].path,await fs.realpath(file));
  assert.equal(history[0].name,'note.md');
  assert.equal(typeof history[0].openedAt,'number');
  assert.deepEqual(Object.keys(history[0]).sort(),['id','name','openedAt','path']);
  await main.call('closeFile',doc.id);
  const reopened = await main.call('openRecent',history[0].id);
  assert.equal(reopened.text,'# Hello\n中文');
  assert.notEqual(reopened.id,doc.id,'Closing revokes the old document capability.');
  assert.equal((await main.call('getHistory'))[0].id,history[0].id);
});

test('clearing recent history persists the removal and revokes old recent IDs', async (t) => {
  const main = await loadMain(t);
  main.setDialog({canceled:false,filePaths:[path.join(main.root,'note.md')]});
  const [doc] = await main.call('openFiles');
  const [recent] = await main.call('getHistory');
  await main.call('clearHistory');
  assert.equal((await main.call('getHistory')).length,0);
  await assert.rejects(main.call('openRecent',recent.id));
  const saved = await savedJSON(main,'reading-state.json');
  assert.deepEqual(saved.recent,[]);
  assert.equal(saved.tabs.length,1,'Clearing history should not close the current document.');
  assert.equal((await main.call('reload',doc.id)).text,'# Hello\n中文');
});

test('disabling session restoration persists empty tabs even when new snapshots arrive', async (t) => {
  const main = await loadMain(t);
  main.setDialog({canceled:false,filePaths:[path.join(main.root,'note.md')]});
  const [doc] = await main.call('openFiles');
  await main.call('saveSession',{tabs:[{id:doc.id,scroll:88}],activeId:doc.id});
  await main.call('setPreferences',{restoreSession:false});
  await main.drain();
  let saved = await savedJSON(main,'reading-state.json');
  assert.deepEqual(saved.tabs,[]);
  assert.equal(saved.activePath,null);
  assert.equal((await savedJSON(main,'preferences.json')).restoreSession,false);
  await main.call('saveSession',{tabs:[{id:doc.id,scroll:500}],activeId:doc.id});
  saved = await savedJSON(main,'reading-state.json');
  assert.deepEqual(saved.tabs,[]);
  assert.equal(saved.activePath,null);
});

test('closing a document removes it from persisted sessions and rejects stale document IDs', async (t) => {
  const main = await loadMain(t);
  main.setDialog({canceled:false,filePaths:[path.join(main.root,'note.md')]});
  const [doc] = await main.call('openFiles');
  await main.call('saveSession',{tabs:[{id:doc.id,scroll:456}],activeId:doc.id});
  assert.equal(await main.call('closeFile',doc.id),true);
  await main.call('saveSession',{tabs:[{id:doc.id,path:doc.path,root:main.root,scroll:999}],activeId:doc.id});
  const saved = await savedJSON(main,'reading-state.json');
  assert.deepEqual(saved.tabs,[]);
  assert.equal(saved.activePath,null);
  await assert.rejects(main.call('reload',doc.id));
});

test('window close waits for a final renderer session snapshot and disk writes', async (t) => {
  const main = await loadMain(t);
  main.setDialog({canceled:false,filePaths:[path.join(main.root,'note.md')]});
  const [doc] = await main.call('openFiles');
  main.window.close();
  assert.equal(main.window.isDestroyed(),false);
  assert.equal(main.sent.filter(([name])=>name==='reader:requestSession').length,1);
  main.window.close();
  assert.equal(main.sent.filter(([name])=>name==='reader:requestSession').length,1,'Repeated close clicks must not start competing close sequences.');
  await main.call('saveSession',{tabs:[{id:doc.id,scroll:987}],activeId:doc.id});
  await main.runTimers();
  assert.equal(main.window.isDestroyed(),false,'No timeout may discard edits');
  await main.call('finishClose',true);
  assert.equal(main.window.isDestroyed(),true);
  const saved = JSON.parse(await fs.readFile(path.join(main.profile,'reading-state.json'),'utf8'));
  assert.equal(saved.tabs[0].scroll,987);
});

test('restoration reopens valid tabs with saved positions and omits missing or out-of-root files', async (t) => {
  const main = await loadMain(t,{profileFiles:({root,sibling})=>({
    'reading-state.json':{version:1,tabs:[
      {path:path.join(root,'note.md'),root,scroll:625},
      {path:path.join(root,'missing.md'),root,scroll:500},
      {path:path.join(sibling,'secret.md'),root,scroll:999},
    ],activePath:path.join(root,'note.md'),recent:[]},
  })});
  assert.equal(main.sent.some(([name])=>name==='reader:sessionRestored'),false,'Wait for renderer readiness before restoring.');
  await main.call('ready');
  const restoreEvents = main.sent.filter(([name])=>name==='reader:sessionRestored');
  assert.equal(restoreEvents.length,1);
  const payload = restoreEvents[0][1];
  assert.equal(payload.docs.length,1);
  assert.equal(payload.docs[0].text,'# Hello\n中文');
  assert.equal(payload.docs[0].savedScroll,625);
  assert.equal(payload.activeId,payload.docs[0].id);
  assert.equal('root' in payload.docs[0],false);
  assert.ok(main.sent.some(([name,message])=>name==='reader:error' && /1 个/.test(message)));
  await main.call('ready');
  assert.equal(main.sent.filter(([name])=>name==='reader:sessionRestored').length,1);
  await main.drain();
  const saved = await savedJSON(main,'reading-state.json');
  assert.equal(saved.tabs.length,1);
  assert.equal(JSON.stringify(main.sent).includes('PRIVATE OUTSIDE CONTENT'),false);
});

test('opted-out startup does not restore document contents or issue document capabilities', async (t) => {
  const main = await loadMain(t,{profileFiles:({root})=>({
    'preferences.json':{restoreSession:false},
    'reading-state.json':{version:1,tabs:[{path:path.join(root,'note.md'),root,scroll:222}],activePath:path.join(root,'note.md'),recent:[]},
  })});
  await main.call('ready');
  assert.equal(main.sent.some(([name])=>name==='reader:sessionRestored'),false);
  assert.equal(JSON.stringify(main.sent).includes('# Hello'),false);
});

test('corrupt, oversized and future-version state files cannot prevent safe startup', async (t) => {
  for (const content of ['{truncated',JSON.stringify({version:99,tabs:[{path:'/secret.md',root:'/'}]}),' '.repeat(1024*1024+1)]) {
    await t.test(`state input ${content.length} bytes`,async (child)=>{
      const main = await loadMain(child,{profileFiles:{'reading-state.json':content,'preferences.json':'{invalid'}});
      await main.call('ready');
      assert.equal(await main.call('getVersion'),'test');
      assert.equal((await main.call('getHistory')).length,0);
      assert.equal(main.sent.some(([name])=>name==='reader:sessionRestored'),false);
      const prefs = await main.call('getPreferences');
      assert.equal(prefs.fontSize,18);
      assert.equal(prefs.sidebarWidth,260);
    });
  }
});

test('new preference IPC validates and persists bounded reading settings', async (t) => {
  const main = await loadMain(t);
  const result = await main.call('setPreferences',{sidebarWidth:10000,fontSize:-1,fontFamily:'serif',lineHeight:2,autoRefresh:false,unknown:'PRIVATE EXTRA'});
  assert.equal(result.sidebarWidth,480);
  assert.equal(result.fontSize,14);
  assert.equal(result.fontFamily,'serif');
  assert.equal(result.lineHeight,2);
  assert.equal(result.autoRefresh,false);
  await main.drain();
  const saved = await savedJSON(main,'preferences.json');
  assert.deepEqual(saved,JSON.parse(JSON.stringify(result)));
  assert.equal(Object.hasOwn(saved,'unknown'),false);
});

test('auto-refresh updates only open documents without scanning folders or growing history', async (t) => {
  const main = await loadMain(t);
  main.setDialog({canceled:false,filePaths:[path.join(main.root,'note.md')]});
  const [doc] = await main.call('openFiles');
  await main.call('ready');
  const originalHistory = JSON.stringify(await main.call('getHistory'));
  const originalReaddir = fs.readdir;
  let scans = 0;
  fs.readdir = async (...args)=>{scans++;return originalReaddir(...args);};
  try {
    await fs.writeFile(doc.path,'# Updated\nContent changed outside the reader.');
    await main.runTimers({repeat:true});
    const updates = main.sent.filter(([name])=>name==='reader:documentChanged');
    assert.equal(updates.length,1);
    assert.equal(updates[0][1].status,'updated');
    assert.equal(updates[0][1].doc.id,doc.id);
    assert.equal(updates[0][1].doc.text,'# Updated\nContent changed outside the reader.');
    assert.equal('root' in updates[0][1].doc,false);
    await main.runTimers({repeat:true});
    assert.equal(main.sent.filter(([name])=>name==='reader:documentChanged').length,1,'Unchanged files should not emit duplicate refreshes.');
    assert.equal(scans,0,'Refresh must never scan directories.');
    assert.equal(JSON.stringify(await main.call('getHistory')),originalHistory,'Background refresh must not create or reorder recent-history entries.');
  } finally {fs.readdir = originalReaddir;}
});

test('missing files retain last readable content, notify once and recover after recreation', async (t) => {
  const main = await loadMain(t);
  main.setDialog({canceled:false,filePaths:[path.join(main.root,'note.md')]});
  const [doc] = await main.call('openFiles');
  await main.call('ready');
  await fs.unlink(doc.path);
  await main.runTimers({repeat:true});
  await main.runTimers({repeat:true});
  let changes = main.sent.filter(([name])=>name==='reader:documentChanged');
  assert.equal(changes.length,1);
  assert.equal(changes[0][1].status,'missing');
  assert.equal(changes[0][1].doc.text,doc.text);
  await fs.writeFile(doc.path,'# Restored after external deletion');
  await main.runTimers({repeat:true});
  changes = main.sent.filter(([name])=>name==='reader:documentChanged');
  assert.equal(changes.length,2);
  assert.equal(changes[1][1].status,'updated');
  assert.equal(changes[1][1].doc.text,'# Restored after external deletion');
  assert.equal(changes[1][1].doc.id,doc.id);
});

test('auto-refresh opt-out stops reads and re-enabling it catches pending changes', async (t) => {
  const main = await loadMain(t);
  main.setDialog({canceled:false,filePaths:[path.join(main.root,'note.md')]});
  const [doc] = await main.call('openFiles');
  await main.call('ready');
  await main.call('setPreferences',{autoRefresh:false});
  await fs.writeFile(doc.path,'# Changed while refresh was disabled');
  const originalStat = fs.stat;
  let stats = 0;
  fs.stat = async (file,...args)=>{if(file===doc.path)stats++;return originalStat(file,...args);};
  try {await main.runTimers({repeat:true});}
  finally {fs.stat = originalStat;}
  assert.equal(stats,0);
  assert.equal(main.sent.some(([name])=>name==='reader:documentChanged'),false);
  await main.call('setPreferences',{autoRefresh:true});
  await main.runTimers({repeat:true});
  const change = main.sent.find(([name])=>name==='reader:documentChanged')[1];
  assert.equal(change.status,'updated');
  assert.equal(change.doc.text,'# Changed while refresh was disabled');
});

test('replaced authorization roots cannot expose outside contents through refresh or recent history', async (t) => {
  const main = await loadMain(t);
  main.setDialog({canceled:false,filePaths:[path.join(main.root,'note.md')]});
  const [doc] = await main.call('openFiles');
  const [recent] = await main.call('getHistory');
  await main.call('ready');
  await fs.writeFile(path.join(main.sibling,'note.md'),'PRIVATE ROOT-SWAP CONTENT');
  await fs.rename(main.root,`${main.root}-original`);
  if (!await symlinkOrSkip(t,main.sibling,main.root,process.platform==='win32'?'junction':'dir')) return;
  await main.runTimers({repeat:true});
  const change = main.sent.find(([name])=>name==='reader:documentChanged')[1];
  assert.equal(change.status,'error');
  assert.equal(change.doc.text,doc.text);
  await assert.rejects(main.call('openRecent',recent.id));
  assert.equal(JSON.stringify(main.sent).includes('PRIVATE ROOT-SWAP CONTENT'),false);
});

test('session restoration revalidates its saved root after a symlink replacement', async (t) => {
  const main = await loadMain(t,{profileFiles:({root})=>({
    'reading-state.json':{version:1,tabs:[{path:path.join(root,'note.md'),root,scroll:444}],activePath:path.join(root,'note.md'),recent:[]},
  })});
  await fs.writeFile(path.join(main.sibling,'note.md'),'PRIVATE RESTORE-SWAP CONTENT');
  await fs.rename(main.root,`${main.root}-original`);
  if (!await symlinkOrSkip(t,main.sibling,main.root,process.platform==='win32'?'junction':'dir')) return;
  await main.call('ready');
  assert.equal(main.sent.some(([name])=>name==='reader:sessionRestored'),false);
  assert.equal(JSON.stringify(main.sent).includes('PRIVATE RESTORE-SWAP CONTENT'),false);
  await main.drain();
  assert.deepEqual((await savedJSON(main,'reading-state.json')).tabs,[]);
});

test('reopening a document from a chosen parent folder updates only its authorized persisted root', async (t) => {
  const main = await loadMain(t);
  const file = path.join(main.root,'nested','chapter.md');
  await fs.writeFile(file,'# Nested chapter');
  main.setDialog({canceled:false,filePaths:[file]});
  const [doc] = await main.call('openFiles');
  await main.call('saveSession',{tabs:[{id:doc.id,scroll:333}],activeId:doc.id});
  assert.equal((await savedJSON(main,'reading-state.json')).tabs[0].root,path.dirname(file));
  main.setDialog({canceled:false,filePaths:[main.root]});
  const folder = await main.call('chooseFolder');
  const reopened = await main.call('openFolderFile',folder.id,'nested/chapter.md');
  assert.equal(reopened.id,doc.id);
  await main.drain();
  const saved = await savedJSON(main,'reading-state.json');
  assert.equal(saved.tabs.length,1);
  assert.equal(saved.tabs[0].root,main.root);
  assert.equal(saved.tabs[0].scroll,333);
  assert.equal(saved.recent[0].root,main.root);
});

test('ordered session snapshots retain tab order and active selection through restoration', async (t) => {
  const main = await loadMain(t,{profileFiles:({root})=>({
    'reading-state.json':{version:1,tabs:[{path:path.join(root,'second.md'),root,scroll:300},{path:path.join(root,'note.md'),root,scroll:123}],activePath:path.join(root,'note.md'),recent:[]},
  })});
  await fs.writeFile(path.join(main.root,'second.md'),'# Second document');
  await main.call('ready');
  const restored = main.sent.find(([name])=>name==='reader:sessionRestored')[1];
  assert.deepEqual(Array.from(restored.docs,doc=>doc.name),['second.md','note.md']);
  assert.deepEqual(Array.from(restored.docs,doc=>doc.savedScroll),[300,123]);
  assert.equal(restored.activeId,restored.docs[1].id);
  await main.call('saveSession',{tabs:[{id:restored.docs[1].id,scroll:222},{id:restored.docs[0].id,scroll:444}],activeId:restored.docs[0].id});
  const saved = await savedJSON(main,'reading-state.json');
  assert.deepEqual(saved.tabs.map(item=>path.basename(item.path)),['note.md','second.md']);
  assert.equal(saved.activePath,restored.docs[0].path);
});

test('pending refresh results cannot resurrect closed documents or override an opt-out', async (t) => {
  for (const action of ['close','disable']) await t.test(action,async child=>{
    const main = await loadMain(child);
    main.setDialog({canceled:false,filePaths:[path.join(main.root,'note.md')]});
    const [doc] = await main.call('openFiles');
    await main.call('ready');
    await fs.writeFile(doc.path,'# Changed while a refresh is pending');
    const originalOpen = fs.open;
    let interrupted = false;
    fs.open = async (file,...args)=>{
      const handle = await originalOpen(file,...args);
      if (file === doc.path) {
        const originalRead = handle.read.bind(handle);
        handle.read = async (...readArgs)=>{
          if (!interrupted) {
            interrupted = true;
            if (action === 'close') await main.call('closeFile',doc.id);
            else await main.call('setPreferences',{autoRefresh:false});
          }
          return originalRead(...readArgs);
        };
      }
      return handle;
    };
    try {await main.runTimers({repeat:true});}
    finally {fs.open = originalOpen;}
    assert.equal(interrupted,true);
    assert.equal(main.sent.some(([name])=>name==='reader:documentChanged'),false);
    if (action === 'close') await assert.rejects(main.call('reload',doc.id));
    else {
      await main.call('setPreferences',{autoRefresh:true});
      await main.runTimers({repeat:true});
      assert.equal(main.sent.find(([name])=>name==='reader:documentChanged')[1].doc.text,'# Changed while a refresh is pending');
    }
  });
});

test('editor IPC creates untitled, saves as UTF-8, and excludes untitled session paths',async t=>{
  const main=await loadMain(t);const doc=await main.call('newDocument');assert.equal(doc.path,'');
  await main.call('saveSession',{tabs:[{id:doc.id,scroll:20}],activeId:doc.id});
  assert.deepEqual((await savedJSON(main,'reading-state.json')).tabs,[]);
  const target=path.join(main.root,'new.md');main.setDialog({canceled:false,filePath:target});
  const saved=await main.call('saveDocument',doc.id,'# 新文档\n',false);
  assert.equal(saved.path,target);assert.equal(saved.text,'# 新文档\n');assert.equal(saved.dirty,false);
});
test('editor dirty duplicate open and refresh never replace original buffer; conflicting save refuses overwrite',async t=>{
  const main=await loadMain(t);const file=path.join(main.root,'note.md');main.setDialog({canceled:false,filePaths:[file]});const [doc]=await main.call('openFiles');
  await main.call('setDirty',doc.id,true);await fs.writeFile(file,'# External');
  const [again]=await main.call('openFiles');assert.equal(again.text,doc.text);assert.equal(again.id,doc.id);
  await main.call('ready');await main.runTimers({repeat:true});
  assert.ok(main.sent.some(([name,change])=>name==='reader:documentChanged'&&change.status==='conflict'));
  await assert.rejects(main.call('saveDocument',doc.id,'local'),/已被其他程序修改/);
  assert.equal(await fs.readFile(file,'utf8'),'# External');
});
test('editor Save As refuses another open document and native cancellation is non-mutating',async t=>{
  const main=await loadMain(t);const target=path.join(main.root,'note.md');main.setDialog({canceled:false,filePaths:[target]});await main.call('openFiles');
  const doc=await main.call('newDocument');main.setDialog({canceled:false,filePath:target});
  await assert.rejects(main.call('saveDocument',doc.id,'new',true),/另一个标签/);
  main.setDialog({canceled:true});assert.equal(await main.call('saveDocument',doc.id,'new'),null);
});
test('editor native close cancellation keeps window usable; second close waits again',async t=>{
  const main=await loadMain(t);main.window.close();await main.call('finishClose',false);assert.equal(main.window.isDestroyed(),false);
  main.window.close();assert.equal(main.sent.filter(([name])=>name==='reader:closeRequested').length,2);
  await main.call('finishClose',true);assert.equal(main.window.isDestroyed(),true);
});

test('Save As canonicalizes directory aliases before checking open targets',async t=>{
  const main=await loadMain(t);const target=path.join(main.root,'note.md');
  main.setDialog({canceled:false,filePaths:[target]});await main.call('openFiles');
  const alias=path.join(main.temp,'alias');await fs.symlink(main.root,alias,'dir');
  const doc=await main.call('newDocument');main.setDialog({canceled:false,filePath:path.join(alias,'note.md')});
  await assert.rejects(main.call('saveDocument',doc.id,'overwrite',true),/另一个标签/);
});
test('Windows save target comparison ignores path casing',()=>{
  const source=syncFs.readFileSync(path.join(__dirname,'../src/main.cjs'),'utf8');
  const definition=source.match(/function sameDocumentPath\(a,b\) \{[^\n]+/)[0];
  const compare=vm.runInNewContext(`${definition};sameDocumentPath`,{path:path.win32,process:{platform:'win32'}});
  assert.equal(compare('C:\\Notes\\File.md','c:\\notes\\FILE.MD'),true);
  assert.equal(compare('C:\\Notes\\File.md','C:\\Notes\\other.md'),false);
});
