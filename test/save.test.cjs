'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const iconv=require('iconv-lite');
const {readMarkdown}=require('../src/security.cjs');
const {safeSave,encodeDocument}=require('../src/save.cjs');
async function fixture(t,bytes){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'jianmo-save-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'笔记.md');if(bytes!==undefined)await fs.writeFile(file,bytes);return {dir,file};}
test('atomic UTF-8 save preserves BOM and CRLF, updates hash',async t=>{const {file}=await fixture(t,Buffer.from('\uFEFF# 标题\r\n正文\r\n'));const doc=await readMarkdown(file);assert.equal(doc.bom,true);assert.equal(doc.eol,'CRLF');const saved=await safeSave(file,'# 标题\n新文字\n',doc);assert.notEqual(saved.digest,doc.digest);assert.equal(await fs.readFile(file,'utf8'),'\uFEFF# 标题\r\n新文字\r\n');});
for(const [label,encoding,bom] of [['UTF-16 LE','utf16-le',[255,254]],['UTF-16 BE','utf16-be',[254,255]],['GB18030','gb18030',[]]])test(`preserves ${label}`,async t=>{const {file}=await fixture(t,Buffer.concat([Buffer.from(bom),iconv.encode('原文\n',encoding)]));const doc=await readMarkdown(file);assert.equal(doc.encoding,label);await safeSave(file,'修改后的文字\n',doc);const saved=await readMarkdown(file);assert.equal(saved.encoding,label);assert.equal(saved.text,'修改后的文字\n');});
test('external edit conflicts and is not overwritten',async t=>{const {file}=await fixture(t,'original');const doc=await readMarkdown(file);await fs.writeFile(file,'external');await assert.rejects(()=>safeSave(file,'local',doc),/已被其他程序修改/);assert.equal(await fs.readFile(file,'utf8'),'external');});
test('deleted source conflicts; new document may be created explicitly',async t=>{const {file}=await fixture(t,'original');const doc=await readMarkdown(file);await fs.unlink(file);await assert.rejects(()=>safeSave(file,'local',doc),/已被其他程序修改/);const result=await safeSave(file,'new',{}, {allowCreate:true});assert.equal(result.text,'new');});
test('symlink target rejected',async t=>{const {dir,file}=await fixture(t,'safe');const link=path.join(dir,'link.md');await fs.symlink(file,link);await assert.rejects(()=>safeSave(link,'overwrite',{}),/符号链接/);assert.equal(await fs.readFile(file,'utf8'),'safe');});
test('size and invalid text rejected without touching original',async t=>{const {file}=await fixture(t,'safe');const doc=await readMarkdown(file);await assert.rejects(()=>safeSave(file,'\0',doc),/无效/);assert.throws(()=>encodeDocument('a'.repeat(21*1024*1024)),/20 MB/);assert.equal(await fs.readFile(file,'utf8'),'safe');});
test('failed save leaves no temporary files',async t=>{const {dir,file}=await fixture(t,'safe');const doc=await readMarkdown(file);await fs.writeFile(file,'external');await assert.rejects(()=>safeSave(file,'local',doc));assert.deepEqual(await fs.readdir(dir),['笔记.md']);});
test('malformed source encoding cannot be silently overwritten',async t=>{const {file}=await fixture(t,Buffer.from([0x81]));const doc=await readMarkdown(file);assert.equal(doc.encodingLossless,false);await assert.rejects(()=>safeSave(file,'new',doc),/编码/);assert.deepEqual(await fs.readFile(file),Buffer.from([0x81]));});
