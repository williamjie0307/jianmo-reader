'use strict';
const {app,BrowserWindow,Menu,dialog,ipcMain,protocol,session,shell} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {safeSave,snapshot}=require('./save.cjs');
const {isMarkdownPath,isPathInside,resolveWithin,readMarkdown,resolveImage,parseCommandLine} = require('./security.cjs');
const {DEFAULT_PREFERENCES,normalizePreferences,normalizeSavedState,atomicWriteJSON} = require('./state.cjs');
const APP_URL = 'reader://app/index.html';
const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src mdasset: data:; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
protocol.registerSchemesAsPrivileged([{scheme:'reader',privileges:{standard:true,secure:true,supportFetchAPI:true}},{scheme:'mdasset',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
app.setName('Jianmo Reader');
app.setAppUserModelId('local.jianmo.reader');
let win, rendererReady = false;
const documents = new Map(), roots = new Map();
let pendingFiles = parseCommandLine(process.argv);
let prefs = {...DEFAULT_PREFERENCES};
let saveQueue = Promise.resolve();
let storedState = normalizeSavedState(null), startupState = null, initialRestoreDone = false;
let refreshTimer, refreshRunning = false, closingWindow = false, allowWindowClose = false;
const changeStatus = new Map();
function sendEvent(name,data) { if(win&&!win.isDestroyed()&&!win.webContents.isDestroyed?.()) {try{win.webContents.send(`reader:${name}`,data);}catch{}} }
function publicHistory() { return storedState.recent.map(({id,path:file,openedAt})=>({id,path:file,name:path.basename(file),openedAt})); }
function queueWrite(file,value) {
  const copy=JSON.parse(JSON.stringify(value));
  saveQueue=saveQueue.then(()=>atomicWriteJSON(path.join(app.getPath('userData'),file),copy)).catch(()=>{sendEvent('error','阅读记录暂时无法保存，请检查本地磁盘空间。');});
  return saveQueue;
}
function persistState() { return queueWrite('reading-state.json',{...storedState,tabs:prefs.restoreSession?storedState.tabs:[],activePath:prefs.restoreSession?storedState.activePath:null}); }
function rememberDocument(doc) {
  const previous=storedState.recent.find(item=>item.path===doc.path);
  storedState.recent=[{id:previous?.id||crypto.randomUUID(),path:doc.path,root:doc.root,openedAt:Date.now()},...storedState.recent.filter(item=>item.path!==doc.path)].slice(0,20);
  const savedTab=storedState.tabs.find(item=>item.path===doc.path);
  if(savedTab)savedTab.root=doc.root;else storedState.tabs.push({path:doc.path,root:doc.root,scroll:0});
  storedState.activePath=doc.path;
  void persistState();sendEvent('historyChanged',publicHistory());
}
async function restoreStartup() {
  if(initialRestoreDone)return;initialRestoreDone=true;
  const snapshot=startupState;startupState=null;
  if(!prefs.restoreSession||!snapshot?.tabs.length)return;
  const restored=[],missing=[];
  for(const saved of snapshot.tabs) {
    try {
      const location=await resolveWithin(saved.root,path.relative(saved.root,saved.path).split(path.sep).join('/'));
      const doc=await openDocument(location,saved.root,{remember:false});
      restored.push({...doc,savedScroll:saved.scroll});
    }catch{missing.push(path.basename(saved.path));}
  }
  const active=restored.find(doc=>doc.path===snapshot.activePath)||restored[0];
  storedState.tabs=restored.map(doc=>({path:doc.path,root:documents.get(doc.id).root,scroll:doc.savedScroll}));
  storedState.activePath=active?.path||null;void persistState();
  if(restored.length)sendEvent('sessionRestored',{docs:restored,activeId:active?.id});
  if(missing.length)sendEvent('error',`${missing.length} 个上次打开的文件已移动或无法读取，其余标签已恢复。`);
}
async function checkOpenDocuments() {
  if(refreshRunning||!prefs.autoRefresh||!rendererReady||closingWindow)return;
  refreshRunning=true;
  try {for(const doc of [...documents.values()]) {
    if(!doc.path||doc.saving)continue;
    try {
      const location=await resolveWithin(doc.root,path.relative(doc.root,doc.path).split(path.sep).join('/'));
      const stat=await fs.stat(location);
      if(!stat.isFile())throw new Error('文件不再是普通文件');
      if(stat.mtimeMs===doc.mtime&&stat.size===doc.size&&!changeStatus.has(doc.id))continue;
      const data=await readMarkdown(location,doc.root);
      if(documents.get(doc.id)!==doc||doc.saving||!prefs.autoRefresh)continue;
      if(doc.dirty){if(data.digest!==doc.digest&&changeStatus.get(doc.id)!=='conflict'){changeStatus.set(doc.id,'conflict');sendEvent('documentChanged',{doc:publicDoc(doc),status:'conflict',message:'磁盘文件已被其他程序修改。你的编辑已保留；请另存为或重新载入后合并。'});}continue;}
      const updated={...doc,...data};documents.set(doc.id,updated);changeStatus.delete(doc.id);
      sendEvent('documentChanged',{doc:publicDoc(updated),status:'updated'});
    }catch(error){
      if(!documents.has(doc.id))continue;
      const status=error.code==='ENOENT'?'missing':'error';
      if(changeStatus.get(doc.id)!==status){changeStatus.set(doc.id,status);sendEvent('documentChanged',{doc:publicDoc(doc),status,message:status==='missing'?'文件已移动或删除，仍保留当前阅读内容。':`无法刷新文件：${error.message}`});}
    }
  }}finally{refreshRunning=false;}
}
const isTrusted = event => !!win && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && event.senderFrame.url === APP_URL;
function action(name, handler) {
  ipcMain.handle(`reader:${name}`, async (event,...args) => {
    if (!isTrusted(event)) throw new Error('不受信任的请求');
    return handler(...args);
  });
}
function sameDocumentPath(a,b) {if(!a||!b)return a===b;const normalize=value=>path.normalize(path.resolve(value));return process.platform==='win32'?normalize(a).toLowerCase()===normalize(b).toLowerCase():normalize(a)===normalize(b);}
function docById(id) {const doc = documents.get(id); if (!doc) throw new Error('此文件已经关闭'); return doc;}
function publicDoc(doc) {const {root,...publicValue} = doc; return publicValue;}
async function openDocument(file, grantedRoot, options={}) {
  const data = await readMarkdown(file,grantedRoot);
  const root = grantedRoot ? await fs.realpath(grantedRoot) : path.dirname(data.path);
  if (!isPathInside(root,data.path)) throw new Error('文件在授权目录之外');
  const previous = [...documents.values()].find(doc => doc.path === data.path);
  const doc = {...data, id:previous?.id || crypto.randomUUID(), root:grantedRoot ? root : (previous?.root || root)};
  if(previous?.dirty&&!options.discardDirty)return publicDoc(previous);
  documents.set(doc.id,doc);changeStatus.delete(doc.id);
  if(options.remember!==false)rememberDocument(doc);
  return publicDoc(doc);
}
async function openDocuments(files) {
  if (!Array.isArray(files) || files.length > 100 || files.some(p=>typeof p !== 'string')) throw new Error('一次最多打开 100 个 Markdown 文件');
  const opened = [], errors = [];
  for (const file of [...new Set(files)]) {
    try {opened.push(await openDocument(file));} catch(error) {errors.push(`${path.basename(file)}：${error.message}`);}
  }
  if (errors.length && win) dialog.showMessageBox(win,{type:'warning',title:'部分文件未能打开',message:'以下文件未能打开',detail:errors.slice(0,15).join('\n')});
  return opened;
}
async function deliverPending() {
  if (!rendererReady || !pendingFiles.length) return;
  const files = pendingFiles.splice(0);
  const docs = await openDocuments(files);
  if (docs.length && win && !win.isDestroyed()) win.webContents.send('reader:openFiles',docs);
}
function focusWindow() {if (win) {if (win.isMinimized()) win.restore(); win.show(); win.focus();}}
async function getDirectory(rootId,relative='') {
  const root = roots.get(rootId); if (!root) throw new Error('请先选择文件夹');
  const directory = await resolveWithin(root,relative);
  const before = await fs.stat(directory);
  const entries = await fs.readdir(directory,{withFileTypes:true});
  const checked = await resolveWithin(root,relative);
  const after = await fs.stat(checked);
  if (checked !== directory || before.dev !== after.dev || before.ino !== after.ino) throw new Error('目录已改变，请重新选择文件夹');
  const visible = entries.filter(e=>!e.name.startsWith('.') && !e.isSymbolicLink() && (e.isDirectory() || e.isFile() && isMarkdownPath(e.name)))
    .sort((a,b)=>(Number(b.isDirectory())-Number(a.isDirectory())) || a.name.localeCompare(b.name,'zh-CN',{numeric:true}));
  if (visible.length > 2000) throw new Error('此目录内容过多，请选择更小的文件夹');
  return visible.map(e=>({name:e.name,type:e.isDirectory()?'directory':'file',path:path.relative(root,path.join(directory,e.name)).split(path.sep).join('/')}));
}
function sendMenu(command) {win?.webContents.send('reader:menu',command);}
function buildMenu() {
  const command = (label,accelerator,cmd)=>({label,accelerator,click:()=>sendMenu(cmd)});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'文件',submenu:[command('新建文档','CmdOrCtrl+N','new'),command('保存','CmdOrCtrl+S','save'),command('另存为…','CmdOrCtrl+Shift+S','save-as'),{type:'separator'},command('打开 Markdown…','CmdOrCtrl+O','open'),command('打开文件夹…','CmdOrCtrl+Shift+O','folder'),{type:'separator'},command('重新载入当前文件','CmdOrCtrl+R','reload'),command('关闭标签','CmdOrCtrl+W','close-tab'),{type:'separator'},{label:'退出',role:'quit'}]},
    {label:'编辑',submenu:[command('撤销','CmdOrCtrl+Z','undo'),command('重做','CmdOrCtrl+Y','redo'),{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},command('加粗','CmdOrCtrl+B','bold'),command('斜体','CmdOrCtrl+I','italic'),command('查找替换','CmdOrCtrl+H','replace')]},
    {label:'阅读',submenu:[command('查找','CmdOrCtrl+F','find'),{role:'copy',label:'复制'},{role:'selectAll',label:'全选'},{type:'separator'},command('放大字号','CmdOrCtrl+=','font-increase'),command('缩小字号','CmdOrCtrl+-','font-decrease'),command('重置字号','CmdOrCtrl+0','font-reset'),command('显示 / 隐藏侧栏','CmdOrCtrl+Shift+B','sidebar'),command('切换明暗主题',undefined,'theme'),{type:'separator'},command('下一个标签','Ctrl+Tab','next-tab'),command('上一个标签','Ctrl+Shift+Tab','previous-tab'),{role:'togglefullscreen',label:'全屏阅读'}]},
    {label:'帮助',submenu:[{label:'关于简墨',click:()=>dialog.showMessageBox(win,{type:'info',title:'关于简墨',message:`简墨 · Jianmo Reader ${app.getVersion()}`,detail:'离线 Markdown 编辑器\n\n文件只在本机读写，不上传。文档脚本、远程图片和嵌入网页不会执行或联网。\n\n支持 Windows 10/11 x64；使用「打开方式」选择本程序，可将 .md 文件设为默认打开。'})}]}
  ]));
}
async function installHandlers() {
  await protocol.handle('reader', async request => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'app' || request.method !== 'GET') return new Response('Forbidden',{status:403});
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const file = await resolveWithin(path.join(__dirname,'../dist'),relative);
      const mime = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf'}[path.extname(file)];
      if (!mime) return new Response('Forbidden',{status:403});
      return new Response(await fs.readFile(file),{headers:{'Content-Type':mime,'Content-Security-Policy':CSP,'X-Content-Type-Options':'nosniff'}});
    } catch {return new Response('Not found',{status:404});}
  });
  await protocol.handle('mdasset', async request => {
    try {
      const url = new URL(request.url), doc = docById(url.hostname);
      if (request.method !== 'GET') return new Response('Forbidden',{status:403});
      const relative = decodeURIComponent(url.pathname.slice(1));
      const image = await resolveImage(doc.root,relative,path.dirname(doc.path));
      return new Response(image.buffer,{headers:{'Content-Type':image.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    } catch {return new Response('Image unavailable',{status:404});}
  });
  session.defaultSession.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  session.defaultSession.on('will-download',event=>event.preventDefault());
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{
    const allowed = /^(reader:|mdasset:|devtools:)/.test(details.url);
    callback({cancel:!allowed});
  });
  action('openFiles',async()=>{const result=await dialog.showOpenDialog(win,{title:'打开 Markdown',properties:['openFile','multiSelections'],filters:[{name:'Markdown 文档',extensions:['md','markdown','mdown']}]}); return result.canceled?[]:openDocuments(result.filePaths);});
  action('openPaths',paths=>openDocuments(paths));
  action('chooseFolder',async()=>{
    const result = await dialog.showOpenDialog(win,{title:'选择要浏览的文件夹',properties:['openDirectory']});
    if (result.canceled) return null;
    const root = await fs.realpath(result.filePaths[0]), id = crypto.randomUUID();
    roots.set(id,root);
    return {id,name:path.basename(root) || root,children:await getDirectory(id)};
  });
  action('listDirectory',getDirectory);
  action('openFolderFile',async(id,relative)=>{const root=roots.get(id);if(!root)throw new Error('请先选择文件夹');return openDocument(await resolveWithin(root,relative),root);});
  action('newDocument',()=>{const doc={id:crypto.randomUUID(),path:'',root:'',name:'未命名.md',text:'',encoding:'UTF-8',eol:'LF',bom:false,dirty:false};documents.set(doc.id,doc);return publicDoc(doc);});
  action('setDirty',(id,dirty)=>{const doc=docById(id);doc.dirty=Boolean(dirty);return true;});
  action('confirmDiscard',async id=>{const doc=docById(id);const result=await dialog.showMessageBox(win,{type:'question',title:'保存修改？',message:`“${doc.name}”有未保存的修改`,detail:'保存后再继续，或放弃这份文档的未保存修改。',buttons:['保存','不保存','取消'],defaultId:0,cancelId:2,noLink:true});return ['save','discard','cancel'][result.response]||'cancel';});
  action('saveDocument',async(id,text,saveAs=false)=>{
    const doc=docById(id);if(doc.saving)throw new Error('正在保存，请稍候');
    if(typeof text!=='string')throw new Error('无效的文档内容');
    doc.saving=true;
    try {
      let file=doc.path,expectedDigest=doc.digest,format=doc;
      if(saveAs||!file){
        const result=await dialog.showSaveDialog(win,{title:'另存为 Markdown（UTF-8）',defaultPath:file||doc.name,filters:[{name:'Markdown 文档',extensions:['md','markdown','mdown']}],properties:['showOverwriteConfirmation','createDirectory']});
        if(result.canceled||!result.filePath)return null;
        file=path.resolve(result.filePath);
        if(!isMarkdownPath(file))file+='.md';
        // Resolve existing directory aliases and target casing before comparing tabs.
        try {file=await fs.realpath(file);}catch(error){if(error.code!=='ENOENT')throw error;file=path.join(await fs.realpath(path.dirname(file)),path.basename(file));}
        const other=[...documents.values()].find(item=>item.id!==id&&sameDocumentPath(item.path,file));
        if(other)throw new Error('目标文件已在另一个标签中打开，请选择其他名称');
        expectedDigest=(await snapshot(file))?.digest;
        // A Save As to the original path is still a normal guarded save.
        if(sameDocumentPath(file,doc.path))expectedDigest=doc.digest;
        format={encoding:'UTF-8',bom:false,eol:doc.eol};
      }
      const data=await safeSave(file,text,format,{expectedDigest,allowCreate:!expectedDigest});
      const oldPath=doc.path;
      const updated={...doc,...data,root:sameDocumentPath(file,oldPath)?doc.root:path.dirname(data.path),dirty:false,saving:false};
      documents.set(id,updated);changeStatus.delete(id);
      if(oldPath&&oldPath!==data.path)storedState.tabs=storedState.tabs.filter(item=>item.path!==oldPath);
      rememberDocument(updated);return publicDoc(updated);
    }finally{doc.saving=false;}
  });
  action('finishClose',async allow=>{if(!closingWindow)return false;if(!allow){closingWindow=false;return false;}await saveQueue;allowWindowClose=true;if(win&&!win.isDestroyed())win.close();return true;});
  action('reload',async id=>{const doc=docById(id);if(!doc.path)throw new Error('新文档尚未保存');const file=await resolveWithin(doc.root,path.relative(doc.root,doc.path).split(path.sep).join('/'));return openDocument(file,doc.root,{discardDirty:true});});
  action('closeFile',id=>{const doc=documents.get(id);if(!doc)return false;documents.delete(id);changeStatus.delete(id);storedState.tabs=storedState.tabs.filter(item=>item.path!==doc.path);if(storedState.activePath===doc.path)storedState.activePath=storedState.tabs[0]?.path||null;void persistState();return true;});
  action('getHistory',()=>publicHistory());
  action('openRecent',async id=>{const recent=storedState.recent.find(item=>item.id===id);if(!recent)throw new Error('此最近记录已不存在');const location=await resolveWithin(recent.root,path.relative(recent.root,recent.path).split(path.sep).join('/'));return openDocument(location,recent.root);});
  action('clearHistory',()=>{storedState.recent=[];sendEvent('historyChanged',[]);return persistState();});
  action('saveSession',snapshot=>{
    if(!snapshot||!Array.isArray(snapshot.tabs)||snapshot.tabs.length>100)throw new Error('无效的阅读记录');
    const seen=new Set();storedState.tabs=[];
    for(const item of snapshot.tabs){const doc=documents.get(item?.id);if(!doc||!doc.path||seen.has(doc.id))continue;seen.add(doc.id);storedState.tabs.push({path:doc.path,root:doc.root,scroll:Number.isFinite(item.scroll)?Math.max(0,Math.min(1e9,item.scroll)):0});}
    const active=documents.get(snapshot.activeId);storedState.activePath=active&&seen.has(active.id)?active.path:storedState.tabs[0]?.path||null;return persistState();
  });
  action('openLink',async(id,href)=>{
    const doc = docById(id);
    if (typeof href !== 'string' || href.length > 10000) throw new Error('无效链接');
    if (/^https:\/\//i.test(href)) {
      const url = new URL(href); if (url.username || url.password) throw new Error('不支持含登录凭据的链接');
      const result=await dialog.showMessageBox(win,{type:'question',title:'打开外部链接？',message:'将在系统浏览器中打开此链接',detail:url.href,buttons:['取消','打开链接'],defaultId:0,cancelId:0,noLink:true});
      if (result.response===1) await shell.openExternal(url.href);
      return null;
    }
    const link = decodeURIComponent(href.split('#')[0].split('?')[0]);
    if (!isMarkdownPath(link)) throw new Error('仅支持 Markdown 文件链接和网页链接');
    const file=await resolveWithin(doc.root,link,path.dirname(doc.path));
    return openDocument(file,doc.root);
  });
  action('find',(text,options={})=>{
    if (typeof text!=='string'||text.length>1000) throw new Error('查找内容过长');
    if (!text) {win.webContents.stopFindInPage('clearSelection');return;}
    win.webContents.findInPage(text,{forward:options.forward!==false,findNext:!options.findNext,matchCase:!!options.matchCase});
  });
  action('stopFind',()=>win.webContents.stopFindInPage('clearSelection'));
  action('getPreferences',()=>prefs);
  action('setPreferences',partial=>{
    prefs=normalizePreferences(partial,prefs);
    void queueWrite('preferences.json',prefs);void persistState();
    return prefs;
  });
  action('getVersion',()=>app.getVersion());
  action('ready',async()=>{rendererReady=true;await restoreStartup();await deliverPending();});
}
async function createWindow() {
  rendererReady=false;closingWindow=false;allowWindowClose=false;
  win = new BrowserWindow({width:1280,height:880,minWidth:700,minHeight:500,title:'简墨 · Markdown 编辑器',backgroundColor:'#faf9f6',autoHideMenuBar:true,show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false,spellcheck:false}});
  win.once('ready-to-show',()=>win.show());
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  win.webContents.on('found-in-page',(_event,result)=>win.webContents.send('reader:findResult',result));
  win.on('close',event=>{
    if(allowWindowClose)return;event.preventDefault();if(closingWindow)return;closingWindow=true;sendEvent('requestSession');sendEvent('closeRequested');
  });
  win.on('closed',()=>{win=null;documents.clear();roots.clear();changeStatus.clear();});
  await win.loadURL(APP_URL);
}
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
else {
  app.on('second-instance',(_event,argv,cwd)=>{pendingFiles.push(...parseCommandLine(argv,cwd));focusWindow();void deliverPending();});
  app.on('open-file',(event,file)=>{event.preventDefault();pendingFiles.push(file);void deliverPending();});
  app.whenReady().then(async()=>{
    try {const file=path.join(app.getPath('userData'),'preferences.json');if((await fs.stat(file)).size<1024*1024)prefs=normalizePreferences(JSON.parse(await fs.readFile(file,'utf8')));}catch{}
    try {const file=path.join(app.getPath('userData'),'reading-state.json');if((await fs.stat(file)).size<1024*1024)storedState=normalizeSavedState(JSON.parse(await fs.readFile(file,'utf8')));}catch{}
    startupState=JSON.parse(JSON.stringify(storedState));
    await installHandlers();buildMenu();await createWindow();
    refreshTimer=setInterval(()=>void checkOpenDocuments(),1500);refreshTimer.unref?.();
  }).catch(error=>{dialog.showErrorBox('简墨无法启动',error.message);app.quit();});
  app.on('activate',()=>{if(!win)void createWindow();else focusWindow();});
  app.on('window-all-closed',()=>{if(process.platform!=='darwin'){clearInterval(refreshTimer);app.quit();}});
}
