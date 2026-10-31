const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const esbuild = require('esbuild');
const { chromium, _electron: electron } = require('playwright');

let browser, server, base, bundle, temporary;
test.before(async () => {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'jianmo-renderer-'));
  bundle = path.join(temporary, 'markdown-test.js');
  esbuild.buildSync({ entryPoints: ['src/markdown.js'], outfile: bundle, bundle: true, format: 'iife', globalName: 'MarkdownTest', platform: 'browser' });
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  if (process.env.JIANMO_RENDERER_TEST_ELECTRON === '1') {
    const harness = path.join(temporary, 'electron-renderer.cjs');
    fs.writeFileSync(harness, `const {app,BrowserWindow}=require('electron'); app.whenReady().then(()=>{ new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}}).loadURL('about:blank'); });`);
    const app = await electron.launch({ args: ['--no-sandbox', harness], env: { ...process.env, DISPLAY: process.env.DISPLAY || '127.0.0.1:99', XDG_CONFIG_HOME: path.join(temporary, 'config'), XDG_CACHE_HOME: path.join(temporary, 'cache') } });
    browser = {
      close: () => app.close(),
      newPage: async (options = {}) => {
        const pageReady = app.waitForEvent('window');
        await app.evaluate(({ BrowserWindow }, viewport) => { const window = new BrowserWindow({ show: true, width: viewport.width, height: viewport.height, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } }); window.loadURL('about:blank'); }, options.viewport || { width: 1280, height: 900 });
        return pageReady;
      },
    };
  } else {
    browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  }
  server = http.createServer((req, res) => {
    const name = req.url === '/' ? 'index.html' : req.url.slice(1);
    const file = path.join(process.cwd(), 'dist', name);
    if (!file.startsWith(path.join(process.cwd(), 'dist') + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    const ext = path.extname(file);
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2' })[ext] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
});
async function markdownPage() { const page = await browser.newPage(); await page.addScriptTag({ path: bundle }); return page; }
async function readerPage(options = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript((options) => {
    if (options.holdImages) {
      window.__holdImages = true;
      const complete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'complete').get;
      Object.defineProperty(HTMLImageElement.prototype, 'complete', { get() { return window.__holdImages ? false : complete.call(this); } });
      // Keep this offline test deterministic: simulate delayed image decoding
      // until the test releases the loaded image and its final dimensions.
      document.addEventListener('load', (event) => { if (window.__holdImages && event.target.tagName === 'IMG') event.stopImmediatePropagation(); }, true);
    }
    const calls = [];
    const events = {};
    let preferences = { theme: 'light', fontSize: 18, sidebar: true, sidebarWidth: 260, fontFamily: 'sans', lineHeight: 1.8, restoreSession: true, autoRefresh: true, ...options.preferences };
    window.__mock = { calls, events, emit: (docs) => events.open(docs), openResult: [], recentResult: null, reloadResult: null, folder: { id: 'root1', name: '研究笔记', children: [{ name: '主题', type: 'directory', path: '主题' }, { name: '目录.md', type: 'file', path: '目录.md' }] } };
    window.reader = {
      getPreferences: async () => preferences,
      setPreferences: async (next) => { calls.push(['setPreferences', next]); preferences = { ...preferences, ...next }; return preferences; },
      openFiles: async () => window.__mock.openResult,
      openPaths: async (paths) => { calls.push(['openPaths', paths]); return []; },
      chooseFolder: async () => window.__mock.folder,
      listDirectory: async (id, path) => { calls.push(['listDirectory', id, path]); return [{ name: '深处.md', path: '主题/深处.md', type: 'file' }]; },
      openFolderFile: async (id, path) => { calls.push(['openFolderFile', id, path]); return { id: 'folderfile', path, name: '深处.md', text: '# 来自文件夹' }; },
      closeFile: async (id) => calls.push(['closeFile', id]),
      reload: async (id) => { calls.push(['reload', id]); return window.__mock.reloadResult; },
      saveSession: (session) => calls.push(['saveSession', session]),
      getHistory: async () => options.history || [],
      openRecent: async (id) => { calls.push(['openRecent', id]); return window.__mock.recentResult; },
      clearHistory: async () => { calls.push(['clearHistory']); events.history([]); },
      openLink: async (id, href) => { calls.push(['openLink', id, href]); return null; },
      find: async (text, options) => { calls.push(['find', text, options]); events.find({ matches: 3, activeMatchOrdinal: options.forward ? 2 : 1 }); },
      stopFind: () => calls.push(['stopFind']),
      onOpenFiles: (callback) => { events.open = callback; },
      onMenu: (callback) => { events.menu = callback; },
      onFindResult: (callback) => { events.find = callback; },
      onSessionRestored: (callback) => { events.session = callback; },
      onSessionRequested: (callback) => { events.sessionRequested = callback; },
      onDocumentChanged: (callback) => { events.changed = callback; },
      onHistoryChanged: (callback) => { events.history = callback; },
      ready: () => { if (options.session) events.session(options.session); window.__mock.ready = true; },
      pathForFile: (file) => file.name,
    };
  }, options);
  await page.goto(base);
  await page.waitForFunction(() => window.__mock?.ready);
  return page;
}
const doc = (id, text, name = `${id}.md`) => ({ id, text, name, path: `C:\\笔记\\${name}`, encoding: 'UTF-8', size: text.length });

test('Markdown safely renders Chinese headings, tables, code, tasks and offline math', async () => {
  const page = await markdownPage();
  const value = await page.evaluate(() => {
    const render = MarkdownTest.createMarkdownRenderer();
    const output = render('# 中文标题\n\n## 重复\n\n## 重复\n\n| A | B |\n| - | - |\n| 一 | 二 |\n\n```js\nconst value = 1;\n```\n\n- [x] 完成\n- [ ] 待办\n\n$x^2$\n\n$$\\frac{1}{2}$$', 'doc1');
    document.body.innerHTML = output.html;
    return { headings: output.headings, wordCount: output.wordCount, tables: document.querySelectorAll('table').length, code: document.querySelectorAll('.hljs-keyword').length, math: document.querySelectorAll('.katex').length, checks: [...document.querySelectorAll('input')].map((input) => ({ disabled: input.disabled, checked: input.checked })) };
  });
  assert.deepEqual(value.headings.map((heading) => heading.id), ['md-h-中文标题', 'md-h-重复', 'md-h-重复-1']);
  assert.equal(value.tables, 1); assert.equal(value.code, 1); assert.equal(value.math, 2);
  assert.deepEqual(value.checks, [{ disabled: true, checked: true }, { disabled: true, checked: false }]);
  assert.ok(value.wordCount > 10);
  await page.close();
});

test('Untrusted documents cannot inject DOM, scripts, remote images or trusted math links', async () => {
  const page = await markdownPage();
  const hostile = fs.readFileSync('test/fixtures/security-smoke.md', 'utf8');
  const value = await page.evaluate((source) => {
    const output = MarkdownTest.createMarkdownRenderer()(source, 'safe-doc');
    document.body.innerHTML = output.html;
    return { ran: Boolean(globalThis.__markdownScriptExecuted), badTags: document.body.querySelectorAll('script, iframe, object, embed, form, svg[onload]').length, eventAttrs: [...document.querySelectorAll('*')].some((node) => [...node.attributes].some((attr) => /^on/i.test(attr.name))), images: [...document.images].map((image) => image.getAttribute('src')), unsafeLinks: [...document.querySelectorAll('a')].filter((link) => /^(javascript|file|data):/i.test(link.getAttribute('href'))).length, blocked: document.querySelectorAll('.image-blocked').length, mathLinks: document.querySelectorAll('.katex a, .katex img').length };
  }, hostile);
  assert.equal(value.ran, false); assert.equal(value.badTags, 0); assert.equal(value.eventAttrs, false); assert.equal(value.unsafeLinks, 0); assert.equal(value.mathLinks, 0);
  assert.ok(value.blocked >= 3);
  assert.ok(value.images.every((src) => src.startsWith('mdasset://safe-doc/')));
  await page.close();
});

test('Image rewrite rejects schemes, SVG, control characters and disguised data payloads', async () => {
  const page = await markdownPage();
  const value = await page.evaluate(() => {
    const sources = ['https://example.com/a.png', '//example.com/a.png', 'file:///etc/passwd', '/tmp/image.png', 'C:\\image.png', 'javascript:alert(1)', 'image.svg', 'a\x00.png', 'data:image/png;base64,PHN2Zz4=', 'data:image/svg+xml;base64,PHN2Zz4='];
    return { rejected: sources.map((src) => MarkdownTest.imageSource(src, 'd')), valid: MarkdownTest.imageSource('图片%20示例.png', 'd'), png: MarkdownTest.imageSource('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', 'd') };
  });
  assert.deepEqual(value.rejected, Array(10).fill(null));
  assert.equal(value.valid, 'mdasset://d/%E5%9B%BE%E7%89%87%20%E7%A4%BA%E4%BE%8B.png');
  assert.ok(value.png.startsWith('data:image/png'));
  await page.close();
});

test('UI opens and deduplicates tabs, restores scroll, closes to welcome, and starts in reading mode', async () => {
  const page = await readerPage();
  assert.equal(await page.locator('#article h1').textContent(), '让阅读，回归文字。');
  assert.equal(await page.locator('#source-editor').isVisible(), false);
  const first = doc('first', '# 第一份\n\n' + '这是长段落，适合慢慢阅读。\n\n'.repeat(130));
  const second = doc('second', '# 第二份\n\n一行文字。');
  await page.evaluate((docs) => window.__mock.emit(docs), [first]);
  await page.locator('#scroll-container').evaluate((node) => { node.scrollTop = 650; });
  await page.evaluate((docs) => window.__mock.emit(docs), [second]);
  assert.equal(await page.locator('#tabs .tab').count(), 2);
  await page.locator('[data-doc-id=first]').click();
  await page.waitForTimeout(80);
  assert.ok(await page.locator('#scroll-container').evaluate((node) => Math.abs(node.scrollTop - 650)) < 5);
  await page.evaluate((docs) => window.__mock.emit(docs), [first]);
  assert.equal(await page.locator('#tabs .tab').count(), 2);
  await page.locator('[data-doc-id=first] .tab-close').click();
  assert.equal(await page.locator('#article h1').textContent(), '第二份');
  await page.locator('[data-doc-id=second] .tab-close').click();
  assert.equal(await page.locator('#article h1').textContent(), '让阅读，回归文字。');
  await page.close();
});

test('Outline anchors stay within article and external links use the main-process API', async () => {
  const page = await readerPage();
  await page.evaluate((docs) => window.__mock.emit(docs), [doc('links', '# article\n\n[跳到段落](#末尾)\n\n[外部链接](https://example.com)\n\n' + '段落文字。\n\n'.repeat(40) + '\n## 末尾\n\n结尾。')]);
  assert.equal(await page.locator('#article').count(), 1);
  await page.locator('#article a').first().click();
  await page.waitForTimeout(500);
  assert.ok(await page.locator('#scroll-container').evaluate((node) => node.scrollTop) > 1000);
  await page.locator('#article a').nth(1).click();
  const calls = await page.evaluate(() => window.__mock.calls.filter((call) => call[0] === 'openLink'));
  assert.deepEqual(calls, [['openLink', 'links', 'https://example.com']]);
  assert.equal(page.url(), `${base}/`);
  await page.close();
});

test('Folder tree loads subdirectories only on demand and caches collapsed entries', async () => {
  const page = await readerPage();
  await page.locator('#files-tab').click(); await page.locator('#folder-empty').click();
  assert.equal(await page.locator('.tree-entry').count(), 2);
  assert.equal(await page.evaluate(() => window.__mock.calls.filter((call) => call[0] === 'listDirectory').length), 0);
  await page.locator('.tree-entry').first().click();
  assert.equal(await page.locator('.tree-entry').count(), 3);
  await page.locator('.tree-entry').first().click(); await page.locator('.tree-entry').first().click();
  assert.equal(await page.evaluate(() => window.__mock.calls.filter((call) => call[0] === 'listDirectory').length), 1);
  await page.getByRole('button', { name: '深处.md', exact: true }).click();
  assert.equal(await page.locator('#article h1').textContent(), '来自文件夹');
  await page.close();
});

test('Appearance and find controls persist settings, respect bounds, and support Escape', async () => {
  const page = await readerPage();
  await page.locator('#appearance-toggle').click(); await page.locator('[data-theme-choice=dark]').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  for (let i = 0; i < 10; i++) await page.locator('#font-increase').click();
  assert.equal(await page.locator('#font-value').textContent(), '28 px');
  assert.equal(await page.locator('#font-increase').isDisabled(), true);
  await page.keyboard.press('Escape'); assert.equal(await page.locator('#appearance-panel').isVisible(), false);
  await page.locator('#find-toggle').click(); await page.locator('#find-input').fill('阅读');
  await page.waitForTimeout(250); assert.equal(await page.locator('#find-result').textContent(), '2 / 3');
  await page.locator('#find-case').click(); assert.equal(await page.locator('#find-case').getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Escape'); assert.equal(await page.locator('#find-bar').isVisible(), false);
  await page.locator('#toggle-sidebar').click(); assert.equal(await page.locator('#sidebar').isVisible(), false);
  await page.close();
});

test('Welcome page has no browser exceptions or remote resource requests', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; const requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (!request.url().startsWith(base)) requests.push(request.url()); });
  await page.goto(base); await page.waitForTimeout(150);
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  if (process.env.JIANMO_SCREENSHOT_DIR) { fs.mkdirSync(process.env.JIANMO_SCREENSHOT_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.JIANMO_SCREENSHOT_DIR, 'renderer-welcome.png'), fullPage: false }); }
  await page.close();
});

test('Typography controls select Chinese font stacks, comfortable line spacing and independent code font', async () => {
  const page = await readerPage();
  await page.locator('#appearance-toggle').click();
  assert.equal(await page.locator('[data-font-choice=sans]').getAttribute('aria-pressed'), 'true');
  const sans = await page.locator('#article').evaluate((node) => getComputedStyle(node).fontFamily);
  assert.match(sans, /Microsoft YaHei/);
  assert.doesNotMatch(sans, /YaHei UI/);
  const codeBefore = await page.locator('#article pre code').first().evaluate((node) => getComputedStyle(node).fontFamily);
  await page.locator('[data-font-choice=serif]').click();
  assert.equal(await page.locator('html').getAttribute('data-font-family'), 'serif');
  assert.match(await page.locator('#article').evaluate((node) => getComputedStyle(node).fontFamily), /SimSun/);
  assert.equal(await page.locator('#article pre code').first().evaluate((node) => getComputedStyle(node).fontFamily), codeBefore);
  await page.locator('[data-line-height="2"]').click();
  const spacing = await page.locator('#article').evaluate((node) => { const css = getComputedStyle(node); return Number.parseFloat(css.lineHeight) / Number.parseFloat(css.fontSize); });
  assert.equal(spacing, 2);
  await page.locator('#restore-session').uncheck();
  await page.locator('#auto-refresh').uncheck();
  const settings = await page.evaluate(() => window.__mock.calls.filter((call) => call[0] === 'setPreferences').map((call) => call[1]));
  assert.ok(settings.some((prefs) => prefs.fontFamily === 'serif'));
  assert.ok(settings.some((prefs) => prefs.lineHeight === 2));
  assert.ok(settings.some((prefs) => prefs.restoreSession === false));
  assert.ok(settings.some((prefs) => prefs.autoRefresh === false));
  if (process.env.JIANMO_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.JIANMO_SCREENSHOT_DIR, 'renderer-reading-settings.png') });
  await page.close();
});

test('Sidebar supports pointer capture, persisted drag width, keyboard bounds and non-destructive narrow layouts', async () => {
  const page = await readerPage();
  const separator = page.locator('#sidebar-resizer');
  const box = await separator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 180);
  await page.mouse.down();
  await page.mouse.move(box.x + 83, box.y + 220, { steps: 4 });
  await page.mouse.up();
  assert.equal(await separator.getAttribute('aria-valuenow'), '340');
  assert.ok(await page.evaluate(() => window.__mock.calls.some((call) => call[0] === 'setPreferences' && call[1].sidebarWidth === 340)));
  await separator.focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await separator.getAttribute('aria-valuenow'), '350');
  await page.keyboard.press('Shift+ArrowLeft');
  assert.equal(await separator.getAttribute('aria-valuenow'), '320');
  await page.keyboard.press('Home');
  assert.equal(await separator.getAttribute('aria-valuenow'), '180');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await separator.getAttribute('aria-valuenow'), '180');
  await page.keyboard.press('End');
  assert.equal(await separator.getAttribute('aria-valuenow'), '480');
  await page.setViewportSize({ width: 760, height: 700 });
  await page.waitForTimeout(60);
  assert.equal(await separator.getAttribute('aria-valuenow'), '334');
  assert.ok(await page.locator('.reading-pane').evaluate((node) => node.clientWidth) >= 420);
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.waitForTimeout(60);
  assert.equal(await separator.getAttribute('aria-valuenow'), '480');
  await page.setViewportSize({ width: 570, height: 700 });
  await page.waitForTimeout(60);
  assert.equal(await page.locator('#sidebar').isVisible(), false);
  assert.equal(await separator.isVisible(), false);
  assert.ok(await page.locator('.reading-pane').evaluate((node) => node.clientWidth) >= 420);
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.waitForTimeout(60);
  assert.equal(await page.locator('#sidebar').isVisible(), true);
  assert.equal(await separator.getAttribute('aria-valuenow'), '480');
  await page.close();
});

test('Session restoration retains order, active tab and scroll, and flushes only real document IDs', async () => {
  const first = { ...doc('restored-a', '# 第一篇\n\n' + '恢复后的长段落。\n\n'.repeat(160)), savedScroll: 750 };
  const second = { ...doc('restored-b', '# 第二篇\n\n' + '另一个长段落。\n\n'.repeat(120)), savedScroll: 450 };
  const page = await readerPage({ session: { docs: [first, second], activeId: first.id } });
  await page.waitForTimeout(120);
  assert.deepEqual(await page.locator('#tabs .tab').evaluateAll((nodes) => nodes.map((node) => node.dataset.docId)), [first.id, second.id]);
  assert.equal(await page.locator('#tabs .active').getAttribute('data-doc-id'), first.id);
  assert.ok(Math.abs(await page.locator('#scroll-container').evaluate((node) => node.scrollTop) - 750) < 3);
  await page.locator('[data-doc-id=restored-b]').click();
  await page.waitForTimeout(120);
  assert.ok(Math.abs(await page.locator('#scroll-container').evaluate((node) => node.scrollTop) - 450) < 3);
  await page.locator('#scroll-container').evaluate((node) => { node.scrollTop = 950; });
  await page.waitForTimeout(260);
  const save = await page.evaluate(() => window.__mock.calls.filter((call) => call[0] === 'saveSession').at(-1)[1]);
  assert.deepEqual(save, { tabs: [{ id: first.id, scroll: 750 }, { id: second.id, scroll: 950 }], activeId: second.id });
  await page.locator('#scroll-container').evaluate((node) => { node.scrollTop = 1050; });
  await page.evaluate(() => window.__mock.events.sessionRequested());
  assert.equal(await page.evaluate(() => window.__mock.calls.filter((call) => call[0] === 'saveSession').at(-1)[1].tabs[1].scroll), 1050);
  await page.locator('[data-doc-id=restored-b] .tab-close').click();
  await page.locator('[data-doc-id=restored-a] .tab-close').click();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  assert.deepEqual(await page.evaluate(() => window.__mock.calls.filter((call) => call[0] === 'saveSession').at(-1)[1]), { tabs: [], activeId: null });
  await page.close();
});

test('Changed files refresh without focus theft, preserve position and retain readable content when missing', async () => {
  const page = await readerPage();
  const first = doc('changes-a', '# 文档 A\n\n' + '前半段正文。\n\n'.repeat(60) + '## 读到这里\n\n' + '阅读位置段落。\n\n'.repeat(70));
  const second = doc('changes-b', '# 文档 B\n\n旧文字');
  await page.evaluate((docs) => window.__mock.emit(docs), [first, second]);
  await page.locator('[data-doc-id=changes-a]').click();
  await page.waitForTimeout(100);
  await page.locator('#scroll-container').evaluate((node) => { node.scrollTop = 750; });
  const updatedSecond = { ...second, text: '# 文档 B 已更新\n\n新文字' };
  await page.evaluate((value) => window.__mock.events.changed({ doc: value, status: 'updated' }), updatedSecond);
  assert.equal(await page.locator('#article h1').textContent(), '文档 A');
  assert.equal(await page.locator('#tabs .tab').count(), 2);
  await page.evaluate((value) => window.__mock.events.changed({ doc: value, status: 'updated' }), { ...first, text: first.text + '\n\n新增尾部内容。' });
  await page.waitForTimeout(100);
  assert.ok(Math.abs(await page.locator('#scroll-container').evaluate((node) => node.scrollTop) - 750) < 3);
  assert.match(await page.locator('#article').textContent(), /新增尾部内容/);
  await page.evaluate((value) => window.__mock.events.changed({ doc: value, status: 'missing' }), { id: first.id });
  assert.equal(await page.locator('#document-notice').isVisible(), true);
  assert.match(await page.locator('#document-notice-text').textContent(), /保留上次/);
  assert.match(await page.locator('#article').textContent(), /新增尾部内容/);
  await page.locator('[data-doc-id=changes-b]').click();
  assert.equal(await page.locator('#document-notice').isVisible(), false);
  assert.equal(await page.locator('#article h1').textContent(), '文档 B 已更新');
  await page.locator('[data-doc-id=changes-a]').click();
  assert.equal(await page.locator('#document-notice').isVisible(), true);
  await page.evaluate((value) => { window.__mock.reloadResult = value; }, first);
  await page.locator('#notice-reload').click();
  assert.equal(await page.locator('#document-notice').isVisible(), false);
  await page.evaluate(() => window.__mock.events.changed({ doc: { id: 'changes-a' }, status: 'error', message: '暂时无法读取，仍保留上次内容。' }));
  assert.match(await page.locator('#document-notice-text').textContent(), /暂时无法读取/);
  await page.locator('#notice-close').click();
  assert.equal(await page.locator('#tabs .tab').count(), 1);
  assert.equal(await page.locator('#article h1').textContent(), '文档 B 已更新');
  await page.close();
});

test('Recent files use stable history IDs, stay bounded and clear without closing open tabs', async () => {
  const history = Array.from({ length: 16 }, (_, i) => ({ id: `history-${i}`, path: `C:\\笔记\\${i}.md`, name: `${i}.md`, openedAt: Date.now() - i }));
  const page = await readerPage({ history });
  await page.locator('#files-tab').click();
  assert.equal(await page.locator('.recent-file').count(), 12);
  assert.ok(await page.locator('#recent-file-list').evaluate((node) => node.clientHeight) <= 228);
  await page.evaluate((value) => { window.__mock.recentResult = value; }, doc('actual-document-id', '# 最近打开的文件'));
  await page.locator('.recent-file').first().click();
  assert.equal(await page.locator('#article h1').textContent(), '最近打开的文件');
  assert.ok(await page.evaluate(() => window.__mock.calls.some((call) => call[0] === 'openRecent' && call[1] === 'history-0')));
  await page.locator('#clear-history').click();
  assert.equal(await page.locator('.recent-file').count(), 0);
  assert.equal(await page.locator('#clear-history').isDisabled(), true);
  assert.equal(await page.locator('#tabs .tab').count(), 1);
  assert.equal(await page.locator('#article h1').textContent(), '最近打开的文件');
  await page.evaluate(() => window.__mock.events.history([{ id: 'new-history', path: 'C:\\新目录\\新的.md', name: '<script>新的.md' }]));
  assert.equal(await page.locator('.recent-file').count(), 1);
  assert.equal(await page.locator('#recent-file-list script').count(), 0);
  assert.match(await page.locator('.recent-file').textContent(), /<script>新的.md/);
  await page.close();
});

test('Auto-refresh preserves the current heading offset when content above it changes', async () => {
  const page = await readerPage();
  const before = '# 标题\n\n' + '前文。\n\n'.repeat(35);
  const after = '## 当前章节\n\n' + '读到的内容。\n\n'.repeat(100);
  const original = doc('heading-position', before + after);
  await page.evaluate((docs) => window.__mock.emit(docs), [original]);
  const offset = await page.evaluate(() => {
    const scroller = document.querySelector('#scroll-container');
    const heading = document.querySelector('#article h2');
    scroller.scrollTop += heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top + 150;
    return heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  });
  await page.evaluate((value) => window.__mock.events.changed({ doc: value, status: 'updated' }), { ...original, text: before + '新增的前文。\n\n'.repeat(15) + after });
  await page.waitForTimeout(60);
  const current = await page.evaluate(() => document.querySelector('#article h2').getBoundingClientRect().top - document.querySelector('#scroll-container').getBoundingClientRect().top);
  assert.ok(Math.abs(current - offset) < 3);
  await page.close();
});

test('Late image layout restores the saved position without overwriting newer reader input', async () => {
  const image = `![本地图片](data:image/png;base64,${fs.readFileSync('test/fixtures/security/pixel.png').toString('base64')})`;
  const original = { ...doc('late-image', '# 图片文档\n\n' + image + '\n\n' + '图片后的内容。\n\n'.repeat(25)), savedScroll: 3000 };
  const session = { docs: [original], activeId: original.id };
  const page = await readerPage({ holdImages: true, session });
  assert.equal(await page.locator('#article img').count(), 1);
  await page.evaluate(() => window.__mock.events.sessionRequested());
  assert.equal(await page.evaluate(() => window.__mock.calls.filter((call) => call[0] === 'saveSession').at(-1)[1].tabs[0].scroll), 3000);
  await page.evaluate(() => {
    const image = document.querySelector('#article img');
    image.style.height = '4200px';
    window.__holdImages = false;
    image.dispatchEvent(new Event('load'));
  });
  await page.waitForFunction(() => Math.abs(document.querySelector('#scroll-container').scrollTop - 3000) < 3, null, { timeout: 3000 });
  const restored = await page.locator('#scroll-container').evaluate((node) => ({ top: node.scrollTop, height: node.scrollHeight, className: node.className, complete: node.querySelector('img')?.complete, hold: window.__holdImages, image: node.querySelector('img')?.outerHTML }));
  assert.ok(Math.abs(restored.top - 3000) < 3, JSON.stringify(restored));
  await page.evaluate((session) => { window.__holdImages = true; window.__mock.events.session(session); }, session);
  await page.evaluate(() => {
    const scroller = document.querySelector('#scroll-container');
    scroller.dispatchEvent(new WheelEvent('wheel'));
    const image = document.querySelector('#article img');
    image.style.height = '4200px';
    scroller.scrollTop = 150;
    window.__holdImages = false;
    image.dispatchEvent(new Event('load'));
  });
  await page.waitForTimeout(100);
  assert.ok(Math.abs(await page.locator('#scroll-container').evaluate((node) => node.scrollTop) - 150) < 3);
  await page.close();
});


test('Editor span accepts only bounded font size and hex color; arbitrary HTML remains text', async () => {
  const page = await markdownPage();
  const result = await page.evaluate(() => {
    const render = MarkdownTest.createMarkdownRenderer();
    document.body.innerHTML = render('<span style="font-size: 24px; color: #b54a3f">中文 &amp; English</span>\n\n<span style="color: red; position: fixed">bad</span>\n\n<img src="https://example.com/remote.png">\n\n<span style="font-size: 999px">huge</span>', 'a').html;
    return { spans: [...document.querySelectorAll('span')].map(e=>({text:e.textContent,size:e.style.fontSize,color:e.style.color})), images: document.images.length };
  });
  assert.equal(result.spans.length, 1); assert.equal(result.spans[0].text, '中文 & English'); assert.equal(result.spans[0].size, '24px'); assert.equal(result.spans[0].color, 'rgb(181, 74, 63)'); assert.equal(result.images, 0); await page.close();
});
