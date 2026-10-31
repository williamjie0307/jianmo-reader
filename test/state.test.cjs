'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  DEFAULT_PREFERENCES, normalizePreferences, normalizeSavedState, atomicWriteJSON,
} = require('../src/state.cjs');

async function fixture(t) {
  const temp = await fs.mkdtemp(path.join(__dirname, '.state-test-'));
  t.after(() => fs.rm(temp, {recursive:true, force:true}));
  return temp;
}

test('default reading preferences are valid and returned as independent objects', () => {
  const normalized = normalizePreferences();
  assert.deepEqual(normalized, DEFAULT_PREFERENCES);
  assert.notEqual(normalized, DEFAULT_PREFERENCES);
  assert.ok(['sans','serif'].includes(normalized.fontFamily));
  assert.ok([1.6,1.8,2].includes(normalized.lineHeight));
  assert.ok(normalized.sidebarWidth >= 180 && normalized.sidebarWidth <= 480);
  assert.equal(typeof normalized.restoreSession, 'boolean');
  assert.equal(typeof normalized.autoRefresh, 'boolean');
  normalized.fontSize = 99;
  assert.notEqual(DEFAULT_PREFERENCES.fontSize, 99);
});

test('preference updates accept only supported keys and preserve the supplied base', () => {
  const base = normalizePreferences({theme:'dark',fontSize:24,sidebar:false,fontFamily:'serif',lineHeight:2,sidebarWidth:310,restoreSession:false,autoRefresh:false});
  const snapshot = {...base};
  const result = normalizePreferences({theme:'light',sidebarWidth:400,unexpected:'secret',text:'PRIVATE DOCUMENT TEXT'}, base);
  assert.deepEqual(base, snapshot);
  assert.deepEqual(result, {...snapshot,theme:'light',sidebarWidth:400});
  assert.equal(Object.hasOwn(result,'unexpected'), false);
  assert.equal(Object.hasOwn(result,'text'), false);
});

test('font sizes and sidebar widths are finite, rounded and clamped', () => {
  const low = normalizePreferences({fontSize:-20,sidebarWidth:-100});
  assert.equal(low.fontSize, 14);
  assert.equal(low.sidebarWidth, 180);
  const high = normalizePreferences({fontSize:500,sidebarWidth:10000});
  assert.equal(high.fontSize, 28);
  assert.equal(high.sidebarWidth, 480);
  const fractional = normalizePreferences({fontSize:20.6,sidebarWidth:300.6});
  assert.equal(fractional.fontSize, 21);
  assert.equal(fractional.sidebarWidth, 301);
  for (const value of [NaN,Infinity,-Infinity,'240',null,{},[]]) {
    const result = normalizePreferences({fontSize:value,sidebarWidth:value});
    assert.equal(result.fontSize, DEFAULT_PREFERENCES.fontSize);
    assert.equal(result.sidebarWidth, DEFAULT_PREFERENCES.sidebarWidth);
  }
});

test('invalid preferences never enable unsupported fonts, CSS values or truthy opt-ins', () => {
  const base = normalizePreferences({restoreSession:false,autoRefresh:false});
  for (const partial of [null,[],true,'dark',42,undefined]) assert.deepEqual(normalizePreferences(partial, base), base);
  const result = normalizePreferences({theme:'javascript:evil',fontFamily:'url(https://example.invalid)',lineHeight:'2',sidebar:'yes',restoreSession:'true',autoRefresh:1}, base);
  assert.deepEqual(result, base);
  for (const lineHeight of [1.6,1.8,2]) assert.equal(normalizePreferences({lineHeight}).lineHeight, lineHeight);
  for (const fontFamily of ['sans','serif']) assert.equal(normalizePreferences({fontFamily}).fontFamily, fontFamily);
});

test('preference normalization does not preserve prototype or unknown payload fields', () => {
  const malicious = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"theme":"dark","filePath":"/private.md"}');
  const normalized = normalizePreferences(malicious);
  assert.equal(normalized.theme, 'dark');
  assert.equal(Object.hasOwn(normalized, '__proto__'), false);
  assert.equal(Object.hasOwn(normalized, 'constructor'), false);
  assert.equal(Object.hasOwn(normalized, 'filePath'), false);
  assert.equal({}.polluted, undefined);
});

test('atomic JSON write creates the profile directory and leaves no temporary files', async (t) => {
  const temp = await fixture(t);
  const file = path.join(temp, 'new-profile', 'state.json');
  const value = {version:1,session:{tabs:[]},recent:[]};
  await atomicWriteJSON(file, value);
  assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')), value);
  assert.deepEqual(await fs.readdir(path.dirname(file)), ['state.json']);
  if (process.platform !== 'win32') assert.equal((await fs.stat(file)).mode & 0o077, 0, 'Local history should not be readable by other OS users.');
});

test('atomic JSON replacement overwrites a complete previous value', async (t) => {
  const temp = await fixture(t);
  const file = path.join(temp, 'state.json');
  await atomicWriteJSON(file, {version:1,marker:'previous',recent:['older']});
  await atomicWriteJSON(file, {version:1,marker:'new',recent:[]});
  assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')), {version:1,marker:'new',recent:[]});
  assert.deepEqual(await fs.readdir(temp), ['state.json']);
});

test('failed atomic replacement preserves the previous state and cleans up temporary data', async (t) => {
  const temp = await fixture(t);
  const file = path.join(temp, 'state.json');
  const previous = {marker:'last valid state'};
  await atomicWriteJSON(file, previous);
  const originalRename = fs.rename;
  fs.rename = async (from, to) => {
    if (to === file) throw Object.assign(new Error('Simulated replacement denial'), {code:'EACCES'});
    return originalRename(from, to);
  };
  try {await assert.rejects(atomicWriteJSON(file, {marker:'must not replace'}), /replacement denial/);}
  finally {fs.rename = originalRename;}
  assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')), previous);
  assert.deepEqual(await fs.readdir(temp), ['state.json']);
});

test('invalid, unsupported and malformed saved-state shapes normalize to an empty session', () => {
  const empty = {version:1,tabs:[],activePath:null,recent:[]};
  for (const value of [undefined,null,[],42,'{}',{}, {version:0,tabs:[]}, {version:2,tabs:[]}, {version:1,tabs:{},recent:'invalid',activePath:42}]) {
    assert.deepEqual(normalizeSavedState(value), empty);
  }
});

test('saved state rejects relative, outside-root, binary and invalid path entries', () => {
  const root = path.resolve('allowed');
  const valid = {path:path.join(root,'note.md'),root,scroll:300};
  const invalid = [
    {...valid,path:'note.md'}, {...valid,root:'allowed'},
    {...valid,path:path.resolve(root,'../allowed-other/secret.md')},
    {...valid,path:path.join(root,'script.js')}, {...valid,path:`${root}/null\0.md`},
    {...valid,path:path.join(root,`${'x'.repeat(4100)}.md`)}, null,
  ];
  const result = normalizeSavedState({version:1,tabs:[...invalid,valid],activePath:invalid[2].path,recent:[]});
  assert.deepEqual(result.tabs, [valid]);
  assert.equal(result.activePath, null);
});

test('saved tabs strip document text and unexpected fields, deduplicate and clamp scroll positions', () => {
  const root = path.resolve('allowed');
  const first = {path:path.join(root,'first.md'),root,scroll:-50,text:'PRIVATE TEXT',id:'renderer-id',extra:1};
  const second = {path:path.join(root,'second.md'),root,scroll:Infinity};
  const third = {path:path.join(root,'third.md'),root,scroll:1e12};
  const input = {version:1,tabs:[first,{...first,scroll:99},second,third],activePath:second.path,recent:[],text:'PRIVATE ROOT TEXT'};
  const before = JSON.stringify(input);
  const result = normalizeSavedState(input);
  assert.deepEqual(result.tabs, [{path:first.path,root,scroll:0},{path:second.path,root,scroll:0},{path:third.path,root,scroll:1e9}]);
  assert.equal(result.activePath, second.path);
  assert.equal(JSON.stringify(input), before);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  assert.deepEqual(Object.keys(result).sort(), ['activePath','recent','tabs','version']);
});

test('saved recent history accepts known-ID metadata only and removes duplicates', () => {
  const root = path.resolve('allowed');
  const first = {id:'11111111-1111-4111-8111-111111111111',path:path.join(root,'first.md'),root,openedAt:100,text:'PRIVATE TEXT',name:'untrusted title'};
  const second = {id:'22222222-2222-4222-8222-222222222222',path:path.join(root,'second.md'),root,openedAt:Infinity};
  const result = normalizeSavedState({version:1,tabs:[],recent:[first,{...first,id:second.id},{...second,id:first.id},second,{...second,id:'/private.md',path:path.join(root,'third.md')}]});
  assert.deepEqual(result.recent,[{id:first.id,path:first.path,root,openedAt:100},{id:second.id,path:second.path,root,openedAt:0}]);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});

test('saved state has bounded tab and recent history sizes', () => {
  const root = path.resolve('allowed');
  const items = Array.from({length:150}, (_, index) => ({id:`${String(index).padStart(8,'0')}-1111-4111-8111-111111111111`,path:path.join(root,`${index}.md`),root,scroll:index,openedAt:index}));
  const result = normalizeSavedState({version:1,tabs:items,recent:items});
  assert.equal(result.tabs.length, 100);
  assert.equal(result.recent.length, 20);
});

test('failed partial writes remove temporary metadata while preserving the last valid state', async (t) => {
  const temp = await fixture(t);
  const file = path.join(temp,'state.json');
  const previous = {marker:'last good state'};
  await atomicWriteJSON(file,previous);
  const originalWrite = fs.writeFile, originalOpen = fs.open;
  const isTemporary = target => typeof target==='string' && target.startsWith(`${file}.`) && target.endsWith('.tmp');
  const diskFull = () => Object.assign(new Error('Simulated disk full after partial write'),{code:'ENOSPC'});
  fs.writeFile = async (target,data,...args)=>{
    if (isTemporary(target)) {
      await originalWrite(target,String(data).slice(0,10),...args);
      throw diskFull();
    }
    return originalWrite(target,data,...args);
  };
  fs.open = async (target,...args)=>{
    const handle = await originalOpen(target,...args);
    if (isTemporary(target)) {
      const originalHandleWrite = handle.writeFile.bind(handle);
      handle.writeFile = async (data,...writeArgs)=>{
        await originalHandleWrite(String(data).slice(0,10),...writeArgs);
        throw diskFull();
      };
    }
    return handle;
  };
  try {await assert.rejects(atomicWriteJSON(file,{marker:'new private metadata'}),/disk full/);}
  finally {fs.writeFile = originalWrite;fs.open = originalOpen;}
  assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),previous);
  assert.deepEqual(await fs.readdir(temp),['state.json']);
});

test('a stale predictable temporary-file symlink is never followed or overwritten', async (t) => {
  const temp = await fixture(t);
  const file = path.join(temp,'state.json'), victim = path.join(temp,'private.md');
  await fs.writeFile(victim,'PRIVATE DOCUMENT MUST NOT CHANGE');
  try {await fs.symlink(victim,`${file}.tmp`);}
  catch (error) {
    if (['EPERM','EACCES','ENOTSUP'].includes(error.code)) {t.skip(`Symlink creation unavailable: ${error.code}`);return;}
    throw error;
  }
  await atomicWriteJSON(file,{version:1,tabs:[],recent:[]});
  assert.equal(await fs.readFile(victim,'utf8'),'PRIVATE DOCUMENT MUST NOT CHANGE');
  assert.equal((await fs.lstat(`${file}.tmp`)).isSymbolicLink(),true);
  assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),{version:1,tabs:[],recent:[]});
});
