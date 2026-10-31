'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {isMarkdownPath,isPathInside} = require('./security.cjs');
const DEFAULT_PREFERENCES = Object.freeze({theme:'light',fontSize:18,sidebar:true,sidebarWidth:260,fontFamily:'sans',lineHeight:1.8,restoreSession:true,autoRefresh:true});
function normalizePreferences(input,base=DEFAULT_PREFERENCES) {
  const prefs={...DEFAULT_PREFERENCES,...base};
  if (!input || typeof input!=='object' || Array.isArray(input)) return prefs;
  if (['light','dark','system'].includes(input.theme)) prefs.theme=input.theme;
  if (Number.isFinite(input.fontSize)) prefs.fontSize=Math.max(14,Math.min(28,Math.round(input.fontSize)));
  if (Number.isFinite(input.sidebarWidth)) prefs.sidebarWidth=Math.max(180,Math.min(480,Math.round(input.sidebarWidth)));
  if (['sans','serif'].includes(input.fontFamily)) prefs.fontFamily=input.fontFamily;
  if ([1.6,1.8,2].includes(input.lineHeight)) prefs.lineHeight=input.lineHeight;
  for(const key of ['sidebar','restoreSession','autoRefresh']) if(typeof input[key]==='boolean') prefs[key]=input[key];
  return prefs;
}
function validLocation(item) {
  if(!item || typeof item!=='object' || typeof item.path!=='string' || typeof item.root!=='string') return false;
  if(item.path.length>4096||item.root.length>4096||item.path.includes('\0')||item.root.includes('\0')) return false;
  return path.isAbsolute(item.path)&&path.isAbsolute(item.root)&&isMarkdownPath(item.path)&&isPathInside(item.root,item.path);
}
function normalizeSavedState(value) {
  const result={version:1,tabs:[],activePath:null,recent:[]};
  if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1) return result;
  const paths=new Set(),recentPaths=new Set(),recentIds=new Set();
  for(const item of Array.isArray(value.tabs)?value.tabs.slice(0,100):[]) {
    if(!validLocation(item)||paths.has(item.path))continue;
    paths.add(item.path);
    result.tabs.push({path:item.path,root:item.root,scroll:Number.isFinite(item.scroll)?Math.max(0,Math.min(1e9,item.scroll)):0});
  }
  if(typeof value.activePath==='string'&&paths.has(value.activePath))result.activePath=value.activePath;
  for(const item of Array.isArray(value.recent)?value.recent.slice(0,20):[]) {
    if(!validLocation(item)||recentPaths.has(item.path)||typeof item.id!=='string'||!/^[a-f\d-]{36}$/i.test(item.id)||recentIds.has(item.id))continue;
    recentPaths.add(item.path);recentIds.add(item.id);
    result.recent.push({id:item.id,path:item.path,root:item.root,openedAt:Number.isFinite(item.openedAt)?Math.max(0,item.openedAt):0});
  }
  return result;
}
async function atomicWriteJSON(file,value) {
  await fs.mkdir(path.dirname(file),{recursive:true});
  const temporary=`${file}.${randomUUID()}.tmp`;
  let created=false,handle;
  try {
    handle=await fs.open(temporary,'wx',0o600);created=true;
    await handle.writeFile(JSON.stringify(value,null,2),{encoding:'utf8'});
    await handle.close();handle=null;
    await fs.rename(temporary,file);
  } finally {
    if(handle)await handle.close().catch(()=>{});
    if(created)await fs.unlink(temporary).catch(()=>{});
  }
}
module.exports={DEFAULT_PREFERENCES,normalizePreferences,normalizeSavedState,atomicWriteJSON};
