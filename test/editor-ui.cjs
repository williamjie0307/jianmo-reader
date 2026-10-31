'use strict';
const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
const root=await fs.mkdtemp(path.join(os.tmpdir(),'jianmo-editor-ui-'));
const file=path.join(root,'编辑测试.md'),saved=path.join(root,'新建文档.md'),copy=path.join(root,'冲突副本.md');
await fs.writeFile(file,'# 编辑测试\r\n\r\n中文文字 hello hello\r\n');
const app=await electron.launch({args:['--no-sandbox',process.env.JIANMO_TEST_PACKAGED==='1'?'test/packaged-harness.cjs':'test/linux-harness.cjs',file],env:{...process.env,XDG_CONFIG_HOME:path.join(root,'config')},timeout:25000});
let count=0; const pass=s=>{console.log(`PASS ${++count}: ${s}`);};
try{
const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.waitForSelector('#article h1');await page.locator('[data-mode=split]').click();
const ed=page.locator('#source-editor');assert.equal(await ed.isVisible(),true);
await ed.fill('# 编辑测试\n\n中文文字 hello hello\n\n新增段落');
await page.waitForFunction(()=>document.querySelector('.tab.active').textContent.includes('●'));pass('编辑中文文字，未保存标记和实时预览');
await page.locator('#save-document').click();await page.waitForFunction(()=>document.querySelector('#status-document').textContent==='已保存');
assert.match(await fs.readFile(file,'utf8'),/新增段落/);assert.ok((await fs.readFile(file,'utf8')).includes('\r\n'));pass('保存写入真实磁盘并保留 CRLF');
const beforeIme=await ed.inputValue();await ed.evaluate(e=>{e.focus();e.dispatchEvent(new CompositionEvent('compositionstart'));e.value+='中文输入';e.dispatchEvent(new InputEvent('input',{isComposing:true}));e.dispatchEvent(new CompositionEvent('compositionend'));e.dispatchEvent(new InputEvent('input',{isComposing:false}));});await page.locator('#undo-edit').click();assert.equal(await ed.inputValue(),beforeIme);pass('模拟中文组合输入提交只需一次撤销，不重复入栈');
await ed.evaluate(e=>{const start=e.value.indexOf('中文文字');e.focus();e.setSelectionRange(start,start+4);});
await page.locator('#selection-size').selectOption('24');await page.locator('#apply-color').click();
await page.waitForFunction(()=>document.querySelector('#article span[style]')?.style.fontSize==='24px');
assert.equal(await page.locator('#article span[style]').textContent(),'中文文字');assert.equal(await page.locator('#article span[style]').evaluate(e=>e.style.color),'rgb(181, 74, 63)');pass('同一选中文字依次调整字号和颜色，预览可见且不是全局缩放');
const styled=await ed.inputValue();await page.locator('#undo-edit').click();assert.notEqual(await ed.inputValue(),styled);await page.locator('#redo-edit').click();assert.equal(await ed.inputValue(),styled);pass('格式操作可撤销重做');
await page.screenshot({path:'docs/editor-styled-1.2.0.png'});
await page.locator('#find-toggle').click();await page.locator('#find-input').fill('hello');await page.locator('#replace-input').fill('world');await page.locator('#replace-all').click();assert.match(await ed.inputValue(),/world world/);await page.locator('#find-close').click();pass('编辑区查找与全部替换');
await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:2});});await page.locator('.tab.active .tab-close').click();assert.equal(await page.locator('.tab').count(),1);pass('取消关闭保留未保存内容');
await fs.writeFile(file,'# 外部修改\n磁盘新内容');await page.waitForFunction(()=>!document.querySelector('#document-notice').hidden);assert.match(await ed.inputValue(),/world world/);await page.locator('#save-document').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('未覆盖'));assert.equal(await fs.readFile(file,'utf8'),'# 外部修改\n磁盘新内容');pass('外部冲突保留编辑，禁止覆盖磁盘版本');
await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},copy);await page.locator('#save-as').click();await page.waitForFunction(()=>document.querySelector('#status-document').textContent==='已保存');assert.match(await fs.readFile(copy,'utf8'),/span style=/);pass('另存为保留冲突副本与字体样式');
await page.locator('#new-document').click();await ed.fill('# 新建\n\n新的内容');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},saved);await page.locator('#save-document').click();await page.waitForFunction(()=>document.querySelector('#status-document').textContent==='已保存');assert.equal(await fs.readFile(saved,'utf8'),'# 新建\n\n新的内容');pass('新建与首次保存');
await ed.fill('不应丢失的内容');await app.evaluate(({BrowserWindow,dialog})=>{dialog.showMessageBox=async()=>({response:2});BrowserWindow.getAllWindows()[0].close();});await page.waitForTimeout(200);assert.equal(app.windows().length,1);assert.equal(await ed.inputValue(),'不应丢失的内容');pass('退出时取消，窗口和修改保留');
await page.screenshot({path:'docs/editor-1.2.0.png'});await page.locator('#theme-toggle').click();await page.screenshot({path:'docs/editor-dark-1.2.0.png'});
assert.deepEqual(errors,[]);pass('所有真实 Electron 编辑流程无渲染异常');
await fs.writeFile('docs/editor-ui-results-1.2.0.json',JSON.stringify({passed:count,windowsNative:false,harness:'Electron Linux, simulated singleton lock, real IPC/files',rendererErrors:errors},null,2));
await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
}finally{await app.close();await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
