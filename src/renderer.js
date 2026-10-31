import { createMarkdownRenderer } from './markdown.js';
import 'katex/dist/katex.min.css';
import './styles.css';

const $ = (selector) => document.querySelector(selector);
const api = window.reader;
const renderMarkdown = createMarkdownRenderer();
const icons = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  search: '<circle cx="10.7" cy="10.7" r="6.7"/><path d="m16 16 4.5 4.5"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  folderOpen: '<path d="M3 9V6a2 2 0 0 1 2-2h5l2 2h6a2 2 0 0 1 2 2v2M3 10h18l-3 10H4z"/>',
  moon: '<path d="M20.9 13a9 9 0 1 1-9.9-9.9A7 7 0 0 0 20.9 13Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  up: '<path d="m6 14 6-6 6 6"/>',
  down: '<path d="m6 10 6 6 6-6"/>',
  book: '<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1ZM12 5v15"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 14v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.file}</svg>`;
for (const [id, name] of Object.entries({ 'open-tab': 'plus', 'toggle-sidebar': 'sidebar', 'open-icon': 'folderOpen', 'find-toggle': 'search', 'theme-toggle': 'moon', 'choose-folder': 'plus', 'find-previous': 'up', 'find-next': 'down', 'find-close': 'close', 'status-icon': 'book', 'drop-icon': 'upload' })) $(`#${id}`).innerHTML = icon(name);

const welcomeText = `# 让阅读，回归文字。

一份文档，一段安静的时光。欢迎来到 **简墨**，你的本地 Markdown 阅读空间。

> 去掉纷扰，让值得读的内容，留在视线中央。

## 从这里开始

点击右上角的 **打开文件**，或将 Markdown 文件拖到窗口里。也可以在 Windows 中双击文件，用简墨打开。

每份文档都有自己的标签页。来回切换或下次打开简墨时，我们会留住你上次读到的位置。也可以在阅读设置中关闭恢复。

- **快速打开** · 按下 \`Ctrl + O\`，支持一次选择多个文件
- **专注阅读** · 按下 \`Ctrl + Shift + B\`，收起或展开侧栏
- **随手查找** · 按下 \`Ctrl + F\`，找到需要的那句话

## 细节，也值得好好呈现

中文段落有舒适的字距与行距，英文与数字也各得其所。无论是工作笔记、技术文档，还是长长的阅读清单，都可以慢慢看。

### 清晰的代码

\`\`\`javascript
// 给专注留一点空间
const reading = {
  theme: 'paper',
  distractions: 0,
  curiosity: Infinity
};

function takeYourTime(page) {
  return page.read({ atYourOwnPace: true });
}
\`\`\`

### 整齐的表格

| 阅读所需 | 简墨为你准备 |
| :--- | :--- |
| 多份文档 | 一个窗口，多个标签 |
| 文章脉络 | 随文生成大纲，点击直达 |
| 个人习惯 | 黑体 / 宋体、字号、行距与深浅外观 |
| 顺手导航 | 拖动侧栏边缘调宽，随手打开最近文档 |
| 离线安心 | 内容本地渲染，不加载远程图片 |

### 公式，自然展开

行内公式也能融入文字：$E = mc^2$。复杂一点的想法，可以独占一行：

$$
\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}
$$

## 把注意力交还给内容

左侧可以在 **大纲** 与 **文件** 之间切换。想读一个文件夹里的笔记时，主动选择它，简墨才会展开其中的文件。

- [x] 轻轻打开一份文档
- [x] 找到舒服的阅读节奏
- [ ] 留一点时间，给新的想法

---

愿每一次打开，都有值得停留的文字。
`;
const welcomeDoc = { id: '__welcome__', name: '欢迎使用', path: '', text: welcomeText, encoding: 'UTF-8', welcome: true };
const state = {
  docs: new Map([[welcomeDoc.id, { ...welcomeDoc, scroll: 0 }]]),
  active: welcomeDoc.id,
  preferences: { theme: 'system', fontSize: 18, sidebar: true, sidebarWidth: 260, fontFamily: 'sans', lineHeight: 1.8, restoreSession: true, autoRefresh: true },
  sidebarTab: 'outline',
  folder: null,
  folderGeneration: 0,
  headings: [],
  matchCase: false,
  toastTimer: null,
  findTimer: null,
  scrollPending: false,
  rendering: 0,
  history: [],
  sessionTimer: null,
  sessionReady: false,
  scrollRestore: null,
};

function toast(message, isError = false) {
  const target = $('#toast');
  clearTimeout(state.toastTimer);
  target.textContent = message;
  target.classList.toggle('error', isError);
  target.hidden = false;
  state.toastTimer = setTimeout(() => { target.hidden = true; }, isError ? 6500 : 3400);
}
function reportError(error) { toast(error?.message || '暂时无法完成，请重试。', true); }
async function perform(action) { try { return await action(); } catch (error) { reportError(error); return null; } }
function activeDoc() { return state.docs.get(state.active); }
function saveScroll() {
  const doc = activeDoc();
  if (doc && state.scrollRestore?.docId !== doc.id) doc.scroll = $('#scroll-container').scrollTop;
}
function flushSession() {
  clearTimeout(state.sessionTimer);
  if (!state.sessionReady || !api?.saveSession) return;
  saveScroll();
  const tabs = [...state.docs.values()].filter((doc) => !doc.welcome).map((doc) => ({ id: doc.id, scroll: doc.scroll || 0 }));
  api.saveSession({ tabs, activeId: tabs.some((tab) => tab.id === state.active) ? state.active : null });
}
function scheduleSession() {
  clearTimeout(state.sessionTimer);
  state.sessionTimer = setTimeout(flushSession, 180);
}
function cancelScrollRestore() {
  if (state.scrollRestore) clearTimeout(state.scrollRestore.timer);
  state.scrollRestore = null;
  $('#scroll-container').classList.remove('restoring-position');
}
function capturePosition() {
  const scroller = $('#scroll-container');
  const top = scroller.getBoundingClientRect().top;
  let anchor;
  for (const heading of state.headings) {
    if (heading.element && heading.element.getBoundingClientRect().top <= top + 1) anchor = heading;
  }
  return { scroll: scroller.scrollTop, anchor: anchor?.id, offset: anchor ? anchor.element.getBoundingClientRect().top - top : 0 };
}
function restoreReadingPosition(doc, generation, position = { scroll: doc.scroll || 0 }) {
  cancelScrollRestore();
  const restoration = { docId: doc.id, generation, position, timer: null };
  state.scrollRestore = restoration;
  $('#scroll-container').classList.add('restoring-position');
  const apply = () => {
    if (state.scrollRestore !== restoration || state.active !== doc.id || generation !== state.rendering) return;
    const scroller = $('#scroll-container');
    const anchor = position.anchor && state.headings.find((heading) => heading.id === position.anchor)?.element;
    const target = anchor ? scroller.scrollTop + anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top - position.offset : position.scroll;
    scroller.scrollTop = Math.max(0, target);
    updateReadingPosition();
  };
  const settle = () => {
    if (state.scrollRestore !== restoration) return;
    apply();
    cancelScrollRestore();
    saveScroll();
    if (!doc.welcome) scheduleSession();
  };
  const loaded = () => {
    requestAnimationFrame(() => {
      apply();
      if ([...$('#article').querySelectorAll('img')].every((image) => image.complete)) requestAnimationFrame(settle);
    });
  };
  const images = [...$('#article').querySelectorAll('img')];
  for (const image of images) {
    // Local images above the saved reading point need dimensions before scroll
    // restoration can be accurate; lazy loading may otherwise skip them.
    if (position.scroll > 0 && image.offsetTop < position.scroll + $('#scroll-container').clientHeight) image.loading = 'eager';
    if (!image.complete) { image.addEventListener('load', loaded, { once: true }); image.addEventListener('error', loaded, { once: true }); }
  }
  // Restore synchronously for text-only documents. Waiting multiple animation
  // frames can overwrite a quick scroll or lose it when switching tabs again.
  if (images.every((image) => image.complete)) { settle(); return; }
  apply();
  restoration.timer = setTimeout(settle, 5000);
  requestAnimationFrame(loaded);
  document.fonts?.ready.then(() => { if (state.scrollRestore === restoration) loaded(); });
}

function addDocuments(documents) {
  if (!Array.isArray(documents) || !documents.length) return;
  saveScroll();
  let latestId;
  for (const doc of documents) {
    if (!doc || typeof doc.id !== 'string' || typeof doc.text !== 'string') continue;
    doc.text = doc.text.replace(/\r\n?/g, '\n');
    const previous = state.docs.get(doc.id);
    if (previous?.dirty) { latestId = doc.id; continue; }
    state.docs.set(doc.id, { ...doc, savedText: doc.text, scroll: previous?.scroll || 0, rendered: previous?.text === doc.text ? previous.rendered : null });
    latestId = doc.id;
  }
  if (!latestId) return;
  state.docs.delete(welcomeDoc.id);
  activate(latestId, false);
}
function restoreSession(session) {
  if (!Array.isArray(session?.docs)) return;
  const docs = session.docs.filter((doc) => doc && typeof doc.id === 'string' && typeof doc.text === 'string').map(doc => ({...doc, text: doc.text.replace(/\r\n?/g, '\n')}));
  if (!docs.length) return;
  cancelScrollRestore();
  for (const doc of docs) state.docs.set(doc.id, { ...doc, scroll: Number.isFinite(doc.savedScroll) ? Math.max(0, doc.savedScroll) : 0 });
  state.docs.delete(welcomeDoc.id);
  activate(state.docs.has(session.activeId) ? session.activeId : docs[0].id, false);
}
function activate(id, preserve = true) {
  if (!state.docs.has(id)) return;
  if (preserve) saveScroll();
  cancelScrollRestore();
  state.active = id;
  api?.stopFind();
  renderTabs();
  syncEditor();
  renderArticle();
  renderOpenFiles();
  scheduleSession();
}
async function closeDocument(id) {
  if (operationLock) return;
  if (!(await guardDocument(state.docs.get(id)))) return;
  const ids = [...state.docs.keys()];
  const index = ids.indexOf(id);
  if (index < 0) return;
  const doc = state.docs.get(id);
  const wasActive = state.active === id;
  state.docs.delete(id);
  if (!doc.welcome) perform(() => api?.closeFile(id));
  if (!state.docs.size) state.docs.set(welcomeDoc.id, { ...welcomeDoc, scroll: 0 });
  if (wasActive) activate(ids[index + 1] || ids[index - 1] || welcomeDoc.id, false);
  else { renderTabs(); renderOpenFiles(); }
  scheduleSession();
}
function renderTabs() {
  const tabs = $('#tabs');
  tabs.replaceChildren();
  for (const doc of state.docs.values()) {
    const tab = document.createElement('div');
    tab.className = `tab${doc.id === state.active ? ' active' : ''}${doc.notice ? ' has-notice' : ''}`;
    tab.dataset.docId = doc.id;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(doc.id === state.active));
    tab.setAttribute('aria-controls', 'article');
    tab.tabIndex = doc.id === state.active ? 0 : -1;
    tab.title = `${doc.path || '欢迎使用简墨'}${doc.notice ? ` · ${doc.notice.message}` : ''}`;
    const mark = document.createElement('span');
    mark.className = 'tab-file-icon'; mark.innerHTML = icon(doc.welcome ? 'book' : 'file');
    const name = document.createElement('span'); name.className = 'tab-name'; name.textContent = `${doc.dirty ? '● ' : ''}${doc.name}`;
    const close = document.createElement('button');
    close.className = 'tab-close'; close.title = '关闭标签 (Ctrl+W)'; close.setAttribute('aria-label', `关闭 ${doc.name}`); close.innerHTML = icon('close');
    close.addEventListener('click', (event) => { event.stopPropagation(); closeDocument(doc.id); });
    tab.append(mark, name, close);
    tab.addEventListener('click', () => activate(doc.id));
    tab.addEventListener('auxclick', (event) => { if (event.button === 1) { event.preventDefault(); closeDocument(doc.id); } });
    tab.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(doc.id); }
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); cycleTabs(event.key === 'ArrowRight' ? 1 : -1); $('#tabs .active')?.focus(); }
      if (event.key === 'Delete') closeDocument(doc.id);
    });
    tabs.append(tab);
  }
  requestAnimationFrame(() => $('#tabs .active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
}
function renderArticle(position) {
  const doc = activeDoc();
  const generation = ++state.rendering;
  try {
    doc.rendered ||= renderMarkdown(doc.text, doc.id);
  } catch (error) {
    $('#article').textContent = '这份文档暂时无法渲染。请检查内容或重新打开。';
    reportError(error); return;
  }
  $('#article').innerHTML = doc.rendered.html;
  $('#article').classList.toggle('welcome-article', Boolean(doc.welcome));
  $('#document-label').textContent = doc.welcome ? '开始阅读' : doc.name;
  $('#document-label').title = doc.path || '';
  $('#document-meta').textContent = doc.welcome ? '你的离线 Markdown 阅读空间' : parentName(doc.path);
  $('#document-meta').title = doc.path || '';
  $('#status-document').textContent = doc.welcome ? '阅读示例' : doc.dirty ? '未保存' : '已保存';
  $('#status-words').textContent = `约 ${doc.rendered.wordCount.toLocaleString('zh-CN')} 字`;
  $('#status-time').textContent = `${Math.max(1, Math.ceil(doc.rendered.wordCount / 450))} 分钟`;
  $('#status-encoding').textContent = doc.encoding || 'UTF-8';
  document.title = doc.welcome ? '简墨 · 让阅读，回归文字' : `${doc.name} — 简墨`;
  state.headings = doc.rendered.headings.map((heading) => ({ ...heading, element: $('#article').querySelector(`#${CSS.escape(heading.id)}`) }));
  renderOutline();
  renderDocumentNotice();
  restoreReadingPosition(doc, generation, position);
  requestAnimationFrame(() => {
    if (generation !== state.rendering) return;
    if (!$('#find-bar').hidden && $('#find-input').value) search(false);
  });
}
function renderDocumentNotice() {
  const notice = activeDoc()?.notice;
  $('#document-notice').hidden = !notice;
  $('#document-notice-text').textContent = notice?.message || '';
}
function documentChanged(change) {
  const incoming = change?.doc;
  const previous = incoming?.id && state.docs.get(incoming.id);
  if (!previous || previous.welcome) return;
  if (previous.dirty) { previous.notice = { message: '磁盘文件已变化；保留你的编辑。请另存为副本，或重新载入并放弃编辑。' }; renderDocumentNotice(); renderTabs(); return; }
  if (change.status === 'updated' && typeof incoming.text === 'string') {
    incoming.text = incoming.text.replace(/\r\n?/g, '\n');
    const active = state.active === incoming.id;
    const position = active ? capturePosition() : null;
    if (active) saveScroll();
    state.docs.set(incoming.id, { ...previous, ...incoming, savedText: incoming.text, history: null, historyIndex: 0, scroll: previous.scroll || 0, rendered: previous.text === incoming.text ? previous.rendered : null, notice: null });
    if (active) { syncEditor(); renderArticle(position); }
  } else if (change.status === 'missing' || change.status === 'error') {
    previous.notice = { status: change.status, message: change.message || (change.status === 'missing' ? '文件已移走或删除，当前保留上次读取的内容。' : '暂时无法读取文件，当前保留上次读取的内容。') };
    if (state.active === previous.id) renderDocumentNotice();
  } else return;
  renderTabs(); renderOpenFiles();
}
function parentName(path) {
  const parts = String(path || '').split(/[\\/]/).filter(Boolean);
  return parts.length > 1 ? parts.slice(-3, -1).join(' / ') : '本地文档';
}
function renderOutline() {
  const container = $('#outline'); container.replaceChildren();
  $('#heading-count').textContent = state.headings.length || '';
  if (!state.headings.length) {
    const empty = document.createElement('p'); empty.className = 'sidebar-empty'; empty.textContent = '这份文档还没有标题。'; container.append(empty); return;
  }
  const minLevel = Math.min(...state.headings.map((heading) => heading.level));
  for (const heading of state.headings) {
    const button = document.createElement('button');
    button.className = `outline-link level-${Math.min(4, heading.level - minLevel)}`;
    button.dataset.heading = heading.id;
    button.textContent = heading.text; button.title = heading.text;
    button.addEventListener('click', () => scrollToHeading(heading.id));
    container.append(button);
  }
}
function scrollToHeading(id) {
  cancelScrollRestore();
  const heading = state.headings.find((item) => item.id === id || item.anchor === id);
  if (heading?.element) {
    heading.element.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    heading.element.tabIndex = -1;
    heading.element.focus({ preventScroll: true });
  }
}
function renderHistory(history = state.history) {
  state.history = Array.isArray(history) ? history.filter((item) => item && typeof item.id === 'string' && typeof item.path === 'string').slice(0, 12) : [];
  const list = $('#recent-file-list'); list.replaceChildren();
  $('#clear-history').disabled = !state.history.length;
  if (!state.history.length) { const empty = document.createElement('p'); empty.className = 'sidebar-empty'; empty.textContent = '最近打开的本地文件会显示在这里。'; list.append(empty); }
  for (const item of state.history) {
    const button = document.createElement('button'); button.className = 'file-item recent-file'; button.title = item.path;
    const details = document.createElement('span');
    const name = document.createElement('span'); name.className = 'recent-file-name'; name.textContent = item.name || item.path.split(/[\\/]/).pop();
    const folder = document.createElement('span'); folder.className = 'recent-file-path'; folder.textContent = parentName(item.path);
    details.append(name, folder); button.innerHTML = icon('file'); button.append(details);
    button.addEventListener('click', async () => {
      button.disabled = true;
      const doc = await perform(() => api.openRecent(item.id));
      button.disabled = false;
      if (doc) addDocuments([doc]);
    });
    list.append(button);
  }
}
function updateReadingPosition() {
  const scroller = $('#scroll-container');
  const progress = scroller.scrollHeight - scroller.clientHeight;
  $('#status-progress').textContent = `${progress > 1 ? Math.min(100, Math.round(scroller.scrollTop / progress * 100)) : 100}%`;
  const top = scroller.getBoundingClientRect().top + 100;
  let selected = state.headings[0];
  for (const heading of state.headings) {
    if (!heading.element) continue;
    if (heading.element.getBoundingClientRect().top <= top) selected = heading;
    else break;
  }
  for (const node of $('#outline').children) {
    const current = node.dataset.heading === selected?.id;
    node.classList.toggle('active', current);
    if (current) node.setAttribute('aria-current', 'location'); else node.removeAttribute('aria-current');
  }
}
function renderOpenFiles() {
  const list = $('#open-file-list'); list.replaceChildren();
  const docs = [...state.docs.values()].filter((doc) => !doc.welcome);
  $('#file-count').textContent = String(docs.length);
  if (!docs.length) { const empty = document.createElement('p'); empty.className = 'sidebar-empty'; empty.textContent = '打开的文档会出现在这里。'; list.append(empty); }
  for (const doc of docs) {
    const button = document.createElement('button'); button.className = `file-item${doc.id === state.active ? ' active' : ''}`;
    const name = document.createElement('span'); name.textContent = `${doc.dirty ? '● ' : ''}${doc.name}`;
    button.innerHTML = icon('file'); button.append(name); button.title = doc.path;
    button.addEventListener('click', () => activate(doc.id)); list.append(button);
  }
}
function selectSidebar(tab) {
  state.sidebarTab = tab;
  for (const mode of ['outline', 'files']) {
    $(`#${mode}-tab`).classList.toggle('active', tab === mode);
    $(`#${mode}-tab`).setAttribute('aria-selected', String(tab === mode));
    $(`#${mode}-panel`).hidden = tab !== mode;
  }
}
let choosingFolder = false;
async function chooseFolder() {
  if (choosingFolder) return;
  choosingFolder = true;
  const folder = await perform(() => api.chooseFolder());
  choosingFolder = false;
  if (!folder) return;
  state.folder = folder; state.folderGeneration += 1;
  if (!state.preferences.sidebar) updatePreferences({ sidebar: true });
  selectSidebar('files');
  const tree = $('#folder-tree'); tree.replaceChildren();
  const root = document.createElement('div'); root.className = 'folder-root'; root.innerHTML = icon('folderOpen');
  const name = document.createElement('span'); name.textContent = folder.name; root.append(name); root.title = folder.name; tree.append(root);
  const entries = document.createElement('div'); entries.className = 'folder-entries'; tree.append(entries);
  renderFolderEntries(entries, folder.children || [], folder.id, state.folderGeneration, 0);
}
function renderFolderEntries(container, entries, rootId, generation, depth) {
  if (!entries.length) { const empty = document.createElement('p'); empty.className = 'folder-no-files'; empty.textContent = '没有可显示的 Markdown 文件'; container.append(empty); return; }
  for (const entry of entries) {
    const wrapper = document.createElement('div'); wrapper.className = 'tree-node';
    const button = document.createElement('button'); button.className = 'tree-entry'; button.style.setProperty('--depth', depth);
    const directory = entry.type === 'directory';
    button.innerHTML = `${directory ? `<span class="tree-chevron">${icon('chevron')}</span>` : '<span class="tree-spacer"></span>'}${icon(directory ? 'folder' : 'file')}`;
    const name = document.createElement('span'); name.textContent = entry.name; button.append(name); button.title = entry.path;
    wrapper.append(button); container.append(wrapper);
    if (!directory) { button.addEventListener('click', async () => { const doc = await perform(() => api.openFolderFile(rootId, entry.path)); if (doc) addDocuments([doc]); }); continue; }
    button.setAttribute('aria-expanded', 'false');
    let children = null; let loading = false;
    button.addEventListener('click', async () => {
      if (loading) return;
      if (children) { children.hidden = !children.hidden; button.setAttribute('aria-expanded', String(!children.hidden)); return; }
      loading = true; button.classList.add('loading');
      const list = entry.children || await perform(() => api.listDirectory(rootId, entry.path));
      loading = false; button.classList.remove('loading');
      if (!list || generation !== state.folderGeneration || !button.isConnected) return;
      children = document.createElement('div'); children.className = 'tree-children'; wrapper.append(children);
      button.setAttribute('aria-expanded', 'true'); renderFolderEntries(children, list, rootId, generation, depth + 1);
    });
  }
}
function applyPreferences() {
  const prefs = state.preferences;
  const isDark = prefs.theme === 'dark' || (prefs.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  document.documentElement.style.setProperty('--reading-size', `${prefs.fontSize}px`);
  document.documentElement.style.setProperty('--reading-line-height', prefs.lineHeight);
  document.documentElement.dataset.fontFamily = prefs.fontFamily;
  applySidebarWidth();
  $('#font-value').textContent = `${prefs.fontSize} px`; $('#status-font').textContent = `${prefs.fontSize} px`;
  $('#font-decrease').disabled = prefs.fontSize <= 14; $('#font-increase').disabled = prefs.fontSize >= 28;
  for (const button of document.querySelectorAll('[data-theme-choice]')) { const selected = button.dataset.themeChoice === prefs.theme; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); }
  for (const button of document.querySelectorAll('[data-font-choice]')) { const selected = button.dataset.fontChoice === prefs.fontFamily; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); }
  for (const button of document.querySelectorAll('[data-line-height]')) { const selected = Number(button.dataset.lineHeight) === prefs.lineHeight; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); }
  $('#restore-session').checked = prefs.restoreSession;
  $('#auto-refresh').checked = prefs.autoRefresh;
  $('#theme-toggle').innerHTML = icon(isDark ? 'sun' : 'moon');
  $('#theme-toggle').title = isDark ? '切换浅色模式' : '切换深色模式';
  $('#theme-toggle').setAttribute('aria-label', $('#theme-toggle').title);
  requestAnimationFrame(updateReadingPosition);
}
function sidebarBounds() {
  const available = $('.workspace').clientWidth - 420 - 6;
  return { min: 180, max: Math.max(180, Math.min(480, available)), tooNarrow: available < 180 };
}
function applySidebarWidth() {
  const bounds = sidebarBounds();
  const width = Math.round(Math.max(bounds.min, Math.min(bounds.max, state.preferences.sidebarWidth)));
  const visible = state.preferences.sidebar && !bounds.tooNarrow;
  document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
  $('#app').classList.toggle('sidebar-hidden', !state.preferences.sidebar);
  $('#app').classList.toggle('sidebar-auto-hidden', bounds.tooNarrow);
  $('#toggle-sidebar').setAttribute('aria-expanded', String(visible));
  $('#sidebar').inert = !visible;
  $('#sidebar-resizer').setAttribute('aria-valuenow', String(width));
  $('#sidebar-resizer').setAttribute('aria-valuemax', String(bounds.max));
  $('#sidebar-resizer').setAttribute('aria-valuetext', `${width} 像素`);
}
let sidebarDrag = null;
function finishSidebarDrag(event) {
  if (!sidebarDrag || (event?.pointerId !== undefined && event.pointerId !== sidebarDrag.pointerId)) return;
  const { pointerId, moved, originalWidth } = sidebarDrag;
  sidebarDrag = null;
  $('#app').classList.remove('resizing-sidebar');
  if ($('#sidebar-resizer').hasPointerCapture(pointerId)) $('#sidebar-resizer').releasePointerCapture(pointerId);
  if (event?.type === 'pointercancel') { state.preferences.sidebarWidth = originalWidth; applySidebarWidth(); }
  else if (moved) updatePreferences({ sidebarWidth: state.preferences.sidebarWidth });
}
$('#sidebar-resizer').addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || sidebarDrag) return;
  event.preventDefault();
  $('#sidebar-resizer').focus();
  sidebarDrag = { pointerId: event.pointerId, startX: event.clientX, startWidth: $('#sidebar').getBoundingClientRect().width, originalWidth: state.preferences.sidebarWidth, moved: false };
  $('#sidebar-resizer').setPointerCapture(event.pointerId);
  $('#app').classList.add('resizing-sidebar');
});
$('#sidebar-resizer').addEventListener('pointermove', (event) => {
  if (!sidebarDrag || event.pointerId !== sidebarDrag.pointerId) return;
  const bounds = sidebarBounds();
  state.preferences.sidebarWidth = Math.round(Math.max(bounds.min, Math.min(bounds.max, sidebarDrag.startWidth + event.clientX - sidebarDrag.startX)));
  sidebarDrag.moved = true;
  applySidebarWidth();
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) $('#sidebar-resizer').addEventListener(name, finishSidebarDrag);
window.addEventListener('blur', () => finishSidebarDrag());
$('#sidebar-resizer').addEventListener('keydown', (event) => {
  const bounds = sidebarBounds();
  const current = $('#sidebar').getBoundingClientRect().width;
  const step = event.shiftKey ? 30 : 10;
  const values = { ArrowLeft: current - step, ArrowRight: current + step, Home: bounds.min, End: bounds.max };
  if (!(event.key in values)) return;
  event.preventDefault();
  updatePreferences({ sidebarWidth: Math.max(bounds.min, Math.min(bounds.max, values[event.key])) });
});
let preferenceGeneration = 0;
async function updatePreferences(partial) {
  state.preferences = { ...state.preferences, ...partial };
  applyPreferences();
  const generation = ++preferenceGeneration;
  const saved = await perform(() => api.setPreferences(partial));
  if (saved && generation === preferenceGeneration) { state.preferences = { ...state.preferences, ...saved }; applyPreferences(); }
}
function changeFont(delta) { updatePreferences({ fontSize: Math.max(14, Math.min(28, state.preferences.fontSize + delta)) }); }
function toggleTheme() { updatePreferences({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' }); }
function setAppearance(open) { $('#appearance-panel').hidden = !open; $('#appearance-toggle').setAttribute('aria-expanded', String(open)); }
function showFind() {
  setAppearance(false); $('#find-bar').hidden = false; $('#find-input').focus(); $('#find-input').select();
  if ($('#find-input').value) search(false);
}
function hideFind() {
  clearTimeout(state.findTimer); $('#find-bar').hidden = true; $('#find-result').textContent = ''; api?.stopFind(); $('#scroll-container').focus({ preventScroll: true });
}
function search(findNext = true, forward = true) {
  clearTimeout(state.findTimer);
  const text = $('#find-input').value;
  if (!text) { api?.stopFind(); $('#find-result').textContent = ''; return; }
  if (editorMode !== 'read' && !activeDoc().welcome) { findInEditor(findNext, forward); return; }
  perform(() => api.find(text, { forward, findNext, matchCase: state.matchCase }));
}
function cycleTabs(direction) {
  const ids = [...state.docs.keys()]; const index = ids.indexOf(state.active);
  activate(ids[(index + direction + ids.length) % ids.length]);
}
let openingFiles = false;
async function openFiles() {
  if (openingFiles) return;
  openingFiles = true;
  const docs = await perform(() => api.openFiles());
  openingFiles = false;
  addDocuments(docs);
}
async function reloadFile() {
  const doc = activeDoc(); if (doc.welcome || !doc.path || !(await guardDocument(doc))) return;
  lockEditing(true);
  try { const refreshed = await perform(() => api.reload(doc.id));
    if (refreshed && state.docs.has(doc.id)) { doc.dirty = false; documentChanged({ doc: refreshed, status: 'updated' }); toast('文档已重新载入'); }
  } finally { lockEditing(false); }
}
function menuAction(action) {
  if (operationLock || composing) return;
  const actions = { new: newDocument, save: () => saveDocument(), 'save-as': () => saveDocument(true), undo: () => historyEdit(-1), redo: () => historyEdit(1), replace: () => { if (!activeDoc().welcome) setMode('split'); showFind(); }, bold: () => formatText('bold'), italic: () => formatText('italic'), open: openFiles, folder: chooseFolder, find: showFind, 'font-increase': () => changeFont(1), 'font-decrease': () => changeFont(-1), 'font-reset': () => updatePreferences({ fontSize: 18 }), sidebar: () => updatePreferences({ sidebar: !state.preferences.sidebar }), theme: toggleTheme, 'next-tab': () => cycleTabs(1), 'previous-tab': () => cycleTabs(-1), 'close-tab': () => closeDocument(state.active), reload: reloadFile };
  actions[action]?.();
}

$('#open-tab').addEventListener('click', openFiles); $('#open-button').addEventListener('click', openFiles);
$('#toggle-sidebar').addEventListener('click', () => menuAction('sidebar'));
$('#outline-tab').addEventListener('click', () => selectSidebar('outline')); $('#files-tab').addEventListener('click', () => selectSidebar('files'));
$('#choose-folder').addEventListener('click', chooseFolder); $('#folder-empty').addEventListener('click', chooseFolder);
$('#theme-toggle').addEventListener('click', toggleTheme);
$('#appearance-toggle').addEventListener('click', () => setAppearance($('#appearance-panel').hidden));
$('#status-font').addEventListener('click', () => setAppearance($('#appearance-panel').hidden));
$('#font-decrease').addEventListener('click', () => changeFont(-1)); $('#font-increase').addEventListener('click', () => changeFont(1)); $('#font-reset').addEventListener('click', () => updatePreferences({ fontSize: 18 }));
for (const button of document.querySelectorAll('[data-theme-choice]')) button.addEventListener('click', () => updatePreferences({ theme: button.dataset.themeChoice }));
for (const button of document.querySelectorAll('[data-font-choice]')) button.addEventListener('click', () => updatePreferences({ fontFamily: button.dataset.fontChoice }));
for (const button of document.querySelectorAll('[data-line-height]')) button.addEventListener('click', () => updatePreferences({ lineHeight: Number(button.dataset.lineHeight) }));
$('#restore-session').addEventListener('change', (event) => updatePreferences({ restoreSession: event.target.checked }));
$('#auto-refresh').addEventListener('change', (event) => updatePreferences({ autoRefresh: event.target.checked }));
$('#notice-reload').addEventListener('click', reloadFile);
$('#notice-close').addEventListener('click', () => closeDocument(state.active));
$('#clear-history').addEventListener('click', async () => {
  $('#clear-history').disabled = true;
  try { await api.clearHistory(); renderHistory([]); } catch (error) { $('#clear-history').disabled = !state.history.length; reportError(error); }
});
$('#find-toggle').addEventListener('click', showFind); $('#find-close').addEventListener('click', hideFind);
$('#find-previous').addEventListener('click', () => search(true, false)); $('#find-next').addEventListener('click', () => search(true, true));
$('#find-case').addEventListener('click', () => { state.matchCase = !state.matchCase; $('#find-case').setAttribute('aria-pressed', String(state.matchCase)); search(false); });
$('#find-input').addEventListener('input', () => { clearTimeout(state.findTimer); state.findTimer = setTimeout(() => search(false), 150); });
$('#find-input').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); search(true, !event.shiftKey); } });
$('#scroll-container').addEventListener('scroll', () => {
  saveScroll(); scheduleSession();
  if (state.scrollPending) return;
  state.scrollPending = true;
  requestAnimationFrame(() => { state.scrollPending = false; updateReadingPosition(); });
}, { passive: true });
for (const name of ['wheel', 'touchstart', 'pointerdown']) $('#scroll-container').addEventListener(name, cancelScrollRestore, { passive: true });
$('#scroll-container').addEventListener('keydown', (event) => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) cancelScrollRestore(); });
window.addEventListener('resize', () => { applySidebarWidth(); updateReadingPosition(); });
window.addEventListener('pagehide', flushSession);
window.addEventListener('beforeunload', flushSession);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyPreferences);

document.addEventListener('click', (event) => {
  if (!event.target.closest('#appearance-panel, #appearance-toggle, #status-font')) setAppearance(false);
});
$('#article').addEventListener('click', async (event) => {
  const link = event.target.closest('a'); if (!link) return;
  event.preventDefault(); event.stopPropagation();
  const href = link.getAttribute('href'); if (!href) return;
  if (href.startsWith('#')) {
    let hash; try { hash = decodeURIComponent(href.slice(1)); } catch { return; }
    scrollToHeading(hash); return;
  }
  const doc = activeDoc(); if (doc.welcome) return;
  const next = await perform(() => api.openLink(doc.id, href));
  if (next) {
    addDocuments([next]);
    if (href.includes('#')) {
      let hash; try { hash = decodeURIComponent(href.slice(href.indexOf('#') + 1)); } catch { return; }
      requestAnimationFrame(() => { if (state.active === next.id) scrollToHeading(hash); });
    }
  }
});
$('#article').addEventListener('auxclick', (event) => { if (event.target.closest('a')) event.preventDefault(); });
$('#article').addEventListener('error', (event) => {
  const image = event.target;
  if (image.tagName !== 'IMG' || !image.isConnected) return;
  const placeholder = document.createElement('span'); placeholder.className = 'image-blocked image-error';
  const label = document.createElement('span'); label.textContent = image.alt || '图片无法显示';
  const hint = document.createElement('small'); hint.textContent = '请检查相对路径，或打开图片所在的文件夹';
  label.append(hint); placeholder.append(label); image.replaceWith(placeholder);
}, true);

// Native menu accelerators are handled by the main process. Keyboard navigation
// without an accelerator (Escape and tab-strip arrows) stays in the renderer.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!$('#appearance-panel').hidden) { setAppearance(false); $('#appearance-toggle').focus(); }
    else if (!$('#find-bar').hidden) hideFind();
    $('#drop-overlay').hidden = true;
  }
});
let dragDepth = 0;
function fileDrag(event) { return [...(event.dataTransfer?.types || [])].includes('Files'); }
document.addEventListener('dragenter', (event) => { if (fileDrag(event)) { event.preventDefault(); dragDepth += 1; $('#drop-overlay').hidden = false; } });
document.addEventListener('dragover', (event) => { event.preventDefault(); if (fileDrag(event)) event.dataTransfer.dropEffect = 'copy'; });
document.addEventListener('dragleave', (event) => { if (fileDrag(event)) { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#drop-overlay').hidden = true; } });
document.addEventListener('drop', async (event) => {
  event.preventDefault(); dragDepth = 0; $('#drop-overlay').hidden = true;
  const files = [...(event.dataTransfer?.files || [])];
  const markdownFiles = files.filter((file) => /\.(?:md|markdown|mdown)$/i.test(file.name));
  if (!markdownFiles.length) { toast('请拖入 .md、.markdown 或 .mdown 文件'); return; }
  const paths = markdownFiles.map((file) => api.pathForFile(file)).filter(Boolean);
  if (!paths.length) { toast('无法读取文件路径，请使用“打开文件”。', true); return; }
  const docs = await perform(() => api.openPaths(paths)); addDocuments(docs);
});

async function initialize() {
  renderTabs(); renderArticle(); renderOpenFiles(); renderHistory(); applyPreferences();
  if (!api) { toast('请在简墨桌面应用中打开此页面。', true); return; }
  api.onCloseRequested?.(async () => { lockEditing(true); try { for (const doc of state.docs.values()) { if (!(await guardDocument(doc))) { await api.finishClose(false); return; } } flushSession(); await api.finishClose(true); } finally { lockEditing(false); } });
  api.onOpenFiles(addDocuments);
  api.onSessionRestored?.(restoreSession);
  api.onSessionRequested?.(flushSession);
  api.onDocumentChanged?.(documentChanged);
  api.onHistoryChanged?.(renderHistory);
  api.onMenu(menuAction);
  api.onError?.((message) => toast(typeof message === 'string' ? message : message?.message || '文件未能打开', true));
  api.onFindResult((result) => { if (!$('#find-bar').hidden) $('#find-result').textContent = result.matches ? `${result.activeMatchOrdinal || 1} / ${result.matches}` : '无结果'; });
  const preferences = await perform(() => api.getPreferences());
  if (preferences) { state.preferences = { ...state.preferences, ...preferences }; applyPreferences(); }
  const history = await perform(() => api.getHistory?.());
  if (history) renderHistory(history);
  state.sessionReady = true;
  api.ready();
}
let operationLock = false;
function lockEditing(value) { operationLock = value; $('#source-editor').readOnly = value; }
let editorMode = 'read', previewTimer, saving = new Set(), guarding = new Set();
const editor = $('#source-editor');
function syncEditor() {
  const doc = activeDoc();
  if (editor.value !== doc.text) editor.value = doc.text;
  editor.scrollTop = doc.editScroll || 0;
  editor.setSelectionRange(doc.selectionStart || 0, doc.selectionEnd || 0);
  setMode(doc.welcome ? 'read' : (doc.mode || editorMode));
}
function setMode(mode) {
  editorMode = mode; const doc = activeDoc();
  if (!doc.welcome) doc.mode = mode;
  $('#document-workspace').dataset.mode = mode;
  editor.hidden = mode === 'read' || doc.welcome;
  $('#scroll-container').hidden = mode === 'edit' && !doc.welcome;
  $('#format-toolbar').hidden = mode === 'read' || doc.welcome;
  for (const b of document.querySelectorAll('[data-mode]')) { b.classList.toggle('selected', b.dataset.mode === mode); b.setAttribute('aria-pressed', String(b.dataset.mode === mode)); b.disabled = doc.welcome && b.dataset.mode !== 'read'; }
  for (const id of ['replace-input','replace-one','replace-all']) $(`#${id}`).hidden = mode === 'read' || doc.welcome;
  $('#save-document').disabled = doc.welcome; $('#save-as').disabled = doc.welcome;
}
function recordText(value, selectionStart = editor.selectionStart, selectionEnd = editor.selectionEnd, record = true) {
  const doc = activeDoc(); if (doc.welcome) return;
  if (value === doc.text) return;
  doc.savedText ??= doc.text;
  if (record) {
    doc.history ||= [{ text: doc.text, start: doc.selectionStart || 0, end: doc.selectionEnd || 0 }]; doc.historyIndex ??= 0;
    doc.history.splice(doc.historyIndex + 1);
    doc.history.push({ text: value, start: selectionStart, end: selectionEnd });
    // Keep undo memory bounded for large documents.
    while (doc.history.length > 2 && (doc.history.length > 100 || doc.history.reduce((n, h) => n + h.text.length, 0) > 20 * 1024 * 1024)) doc.history.shift();
    doc.historyIndex = doc.history.length - 1;
  }
  doc.text = value; doc.selectionStart = selectionStart; doc.selectionEnd = selectionEnd;
  doc.dirty = value !== doc.savedText; doc.rendered = null;
  api.setDirty?.(doc.id, doc.dirty).catch(reportError);
  $('#status-document').textContent = doc.dirty ? '未保存' : '已保存';
  renderTabs(); clearTimeout(previewTimer);
  previewTimer = setTimeout(() => { if (state.active === doc.id) renderArticle(capturePosition()); }, 220);
}
let composing = false;
editor.addEventListener('compositionstart', () => { composing = true; const doc = activeDoc(); doc.savedText ??= doc.text; doc.dirty = true; api.setDirty?.(doc.id, true).catch(reportError); });
editor.addEventListener('compositionend', () => { composing = false; recordText(editor.value); const doc = activeDoc(); doc.dirty = doc.text !== doc.savedText; api.setDirty?.(doc.id, doc.dirty).catch(reportError); renderTabs(); });
editor.addEventListener('input', e => { if (!composing && !e.isComposing) recordText(editor.value); });
for (const event of ['select','keyup','click']) editor.addEventListener(event, () => { const doc = activeDoc(); doc.selectionStart = editor.selectionStart; doc.selectionEnd = editor.selectionEnd; });
editor.addEventListener('scroll', () => { activeDoc().editScroll = editor.scrollTop; });
function replaceSelection(text, start = editor.selectionStart, end = editor.selectionEnd) {
  editor.focus(); editor.setRangeText(text, start, end, 'select'); recordText(editor.value);
}
function historyEdit(direction) {
  if (operationLock) return;
  if (editorMode === 'read') return;
  const doc = activeDoc(), target = (doc.historyIndex || 0) + direction;
  if (!doc.history || target < 0 || target >= doc.history.length) return;
  doc.historyIndex = target; const item = doc.history[target]; editor.value = item.text; editor.focus(); editor.setSelectionRange(item.start, item.end); recordText(item.text,item.start,item.end,false);
}
function formatText(kind) {
  if (operationLock) return;
  if (activeDoc().welcome) return;
  if (editorMode === 'read') setMode('split');
  const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd), text = selected || '文字';
  const formats = { bold: `**${text}**`, italic: `*${text}*`, strike: `~~${text}~~`, heading: `## ${text}`, list: text.split('\n').map(l=>`- ${l}`).join('\n'), task: text.split('\n').map(l=>`- [ ] ${l}`).join('\n'), quote: text.split('\n').map(l=>`> ${l}`).join('\n'), code: `\n\`\`\`\n${selected || '代码'}\n\`\`\`\n`, link: `[${selected || '链接文字'}](https://example.com)`, table: '\n| 列一 | 列二 |\n| --- | --- |\n| 内容 | 内容 |\n' };
  if (formats[kind]) replaceSelection(formats[kind]);
}
function applyTextStyle(style) {
  if (operationLock) return;
  if (editor.selectionStart === editor.selectionEnd) { toast('请先在左侧编辑区选中要调整的文字'); return; }
  const text = editor.value.slice(editor.selectionStart, editor.selectionEnd);
  if (text.includes('\n')) { toast('请逐段选择文字应用样式，避免跨段 HTML 影响 Markdown'); return; }
  const existing = /^<span style="((?:color: #[0-9a-fA-F]{6}|font-size: \d{2}px)(?:; (?:color: #[0-9a-fA-F]{6}|font-size: \d{2}px))?)">([^\n]*)<\/span>$/.exec(text);
  const property = style.split(':')[0];
  const styles = existing ? existing[1].split('; ').filter(value => !value.startsWith(property + ':')).concat(style).join('; ') : style;
  const escaped = existing ? existing[2] : text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  replaceSelection(`<span style="${styles}">${escaped}</span>`); $('#style-hint').hidden = false;
}
async function newDocument() {
  if (operationLock) return;
  const doc = await perform(() => api.newDocument()); if (!doc) return;
  addDocuments([doc]); setMode('split'); editor.focus();
}
async function saveDocument(saveAs = false, doc = activeDoc()) {
  if (!doc || doc.welcome || saving.has(doc.id)) return false;
  saving.add(doc.id); const submitted = doc.text;
  try {
    const saved = await api.saveDocument(doc.id, submitted, saveAs); if (!saved) return false;
    const currentText = doc.text, history = doc.history, historyIndex = doc.historyIndex;
    Object.assign(doc, saved, { text: currentText, savedText: submitted, dirty: currentText !== submitted, history, historyIndex, notice: null, rendered: null });
    await api.setDirty?.(doc.id, doc.dirty);
    renderTabs(); renderOpenFiles(); if (state.active === doc.id) renderArticle(capturePosition());
    toast(doc.dirty ? '已保存提交的版本；后续修改尚未保存' : '已保存到本机'); return !doc.dirty;
  } catch (error) { reportError(error); return false; } finally { saving.delete(doc.id); }
}
async function guardDocument(doc) {
  if (composing) { toast('请先完成中文输入，再关闭或重新载入'); return false; }
  if (saving.has(doc?.id)) { toast('正在保存，请稍候再关闭'); return false; }
  if (!doc?.dirty) return true;
  if (guarding.has(doc.id)) return false;
  guarding.add(doc.id);
  try { const choice = await api.confirmDiscard(doc.id); if (choice === 'save') return await saveDocument(false,doc); return choice === 'discard'; }
  catch(error) { reportError(error); return false; } finally { guarding.delete(doc.id); }
}
function findMatches() {
  const needle = $('#find-input').value; if (!needle) return [];
  const haystack = state.matchCase ? editor.value : editor.value.toLocaleLowerCase();
  const query = state.matchCase ? needle : needle.toLocaleLowerCase();
  const matches=[]; let i=0; while ((i=haystack.indexOf(query,i)) !== -1) { matches.push(i); i += query.length; } return matches;
}
function findInEditor(next = true, forward = true) {
  const matches=findMatches(), length=$('#find-input').value.length;
  let index = forward ? matches.findIndex(i=>i >= (next ? editor.selectionEnd : 0)) : matches.findLastIndex(i=>i < editor.selectionStart);
  if (index<0) index=forward ? 0 : matches.length-1;
  $('#find-result').textContent = matches.length ? `${index+1} / ${matches.length}` : '无结果';
  if (matches.length) { if (next) editor.focus(); editor.setSelectionRange(matches[index], matches[index]+length); const line=editor.value.slice(0,matches[index]).split('\n').length; editor.scrollTop=Math.max(0,(line-3)*parseFloat(getComputedStyle(editor).lineHeight)); }
}
function replaceMatch(all = false) {
  if (operationLock) return;
  if (editorMode === 'read') return;
  const matches=findMatches(), query=$('#find-input').value, replacement=$('#replace-input').value;
  if (!matches.length) return;
  if (all) { let result=editor.value; for (const i of matches.reverse()) result=result.slice(0,i)+replacement+result.slice(i+query.length); replaceSelection(result,0,editor.value.length); toast(`已替换 ${matches.length} 处`); }
  else { if (!matches.includes(editor.selectionStart) || editor.selectionEnd-editor.selectionStart!==query.length) {findInEditor(false);return;} replaceSelection(replacement); findInEditor(true); }
}
for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click',()=>setMode(b.dataset.mode));
for (const b of document.querySelectorAll('[data-format]')) b.addEventListener('click',()=>formatText(b.dataset.format));
$('#new-document').addEventListener('click',newDocument); $('#save-document').addEventListener('click',()=>saveDocument()); $('#save-as').addEventListener('click',()=>saveDocument(true));
$('#undo-edit').addEventListener('click',()=>historyEdit(-1)); $('#redo-edit').addEventListener('click',()=>historyEdit(1));
$('#selection-size').addEventListener('change',e=>{if(e.target.value) applyTextStyle(`font-size: ${e.target.value}px`); e.target.value='';});
$('#apply-color').addEventListener('click',()=>applyTextStyle(`color: ${$('#selection-color').value}`));
$('#replace-one').addEventListener('click',()=>replaceMatch()); $('#replace-all').addEventListener('click',()=>replaceMatch(true));
editor.addEventListener('keydown',e=>{
  if (operationLock) return;
  if (e.isComposing || composing || e.keyCode === 229) return;
  if ((e.ctrlKey||e.metaKey) && ['z','y'].includes(e.key.toLowerCase())) { e.preventDefault(); historyEdit(e.key.toLowerCase()==='y'||e.shiftKey?1:-1); }
  if (e.key==='Tab') { e.preventDefault(); replaceSelection('  '); }
});
syncEditor();

initialize();
