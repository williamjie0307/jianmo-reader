'use strict';
const {contextBridge,ipcRenderer,webUtils} = require('electron');
const droppedPaths = new Set();
const invoke = (name, ...args) => ipcRenderer.invoke(`reader:${name}`, ...args);
const listen = (name, cb) => {
  if (typeof cb !== 'function') return () => {};
  const listener = (_event, payload) => cb(payload);
  ipcRenderer.on(`reader:${name}`, listener);
  return () => ipcRenderer.removeListener(`reader:${name}`, listener);
};
contextBridge.exposeInMainWorld('reader', {
  newDocument:()=>invoke('newDocument'),saveDocument:(id,text,saveAs=false)=>invoke('saveDocument',id,text,saveAs),confirmDiscard:id=>invoke('confirmDiscard',id),setDirty:(id,dirty)=>invoke('setDirty',id,dirty),onCloseRequested:cb=>listen('closeRequested',cb),finishClose:allow=>invoke('finishClose',allow),
  openFiles:()=>invoke('openFiles'),openPaths:paths=>{if(!Array.isArray(paths)||paths.some(p=>!droppedPaths.has(p)))return Promise.reject(new Error('请将文件拖入窗口'));paths.forEach(p=>droppedPaths.delete(p));return invoke('openPaths',paths);},
  chooseFolder:()=>invoke('chooseFolder'),listDirectory:(id,relative)=>invoke('listDirectory',id,relative),
  openFolderFile:(id,relative)=>invoke('openFolderFile',id,relative),
  reload:id=>invoke('reload',id),closeFile:id=>invoke('closeFile',id),
  openLink:(id,href)=>invoke('openLink',id,href),
  find:(text,options)=>invoke('find',text,options),stopFind:()=>invoke('stopFind'),
  getPreferences:()=>invoke('getPreferences'),setPreferences:prefs=>invoke('setPreferences',prefs),
  onOpenFiles:cb=>listen('openFiles',cb),onMenu:cb=>listen('menu',cb),onFindResult:cb=>listen('findResult',cb),
  onError:cb=>listen('error',cb),
  getHistory:()=>invoke('getHistory'),openRecent:id=>invoke('openRecent',id),clearHistory:()=>invoke('clearHistory'),
  saveSession:snapshot=>invoke('saveSession',snapshot),
  onHistoryChanged:cb=>listen('historyChanged',cb),onSessionRestored:cb=>listen('sessionRestored',cb),onDocumentChanged:cb=>listen('documentChanged',cb),onSessionRequested:cb=>listen('requestSession',cb),
  pathForFile:file=>{const filePath=webUtils.getPathForFile(file);if(filePath)droppedPaths.add(filePath);return filePath;},getVersion:()=>invoke('getVersion'),ready:()=>invoke('ready')
});
