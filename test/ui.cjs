'use strict';
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
(async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'jianmo-ui-'));
  await fs.mkdir(path.join(root,'images'));await fs.mkdir(path.join(root,'papers'));
  await fs.copyFile('build/icon.png',path.join(root,'images','图 1.png'));
  const first=path.join(root,'研究笔记 一.md'),second=path.join(root,'second.md');
  const research=`# 研究笔记：让知识井然有序\n\n这是一份本地科研阅读示例。所有文件都留在你的电脑里。\n\n## 核心结论\n\n阅读研究笔记时，清晰的结构与可读的公式同样重要。\n\n| 参数 | 符号 | 数值 |\n| --- | --- | ---: |\n| 温度 | T | 298 K |\n| 压力 | P | 101.3 kPa |\n\n## 模型与推导\n\n行内公式 $E=mc^2$ 与下方的概率分布：\n\n$$\np(x)=\\frac{1}{\\sqrt{2\\pi\\sigma^2}}\\exp\\left(-\\frac{(x-\\mu)^2}{2\\sigma^2}\\right)\n$$\n\n\`\`\`python\nimport numpy as np\ndef normalize(x):\n    return (x - x.mean()) / x.std()\n\`\`\`\n\n## 图片与参考\n\n![本地图示](images/图%201.png)\n\n[下一份文档](second.md)\n\n![远程图片](https://example.com/tracker.png)\n\n<script>window.INJECTED=true</script>\n\n[危险链接](javascript:alert(1))\n\n## 长文阅读\n\n${'这是一段用于验证阅读位置的中文正文。阅读应该自然、安静、流畅。\n\n'.repeat(65)}\n\n## article\n\n文档标题不会影响应用界面。`;
  await fs.writeFile(first,research);await fs.writeFile(second,'# 第二份文档\n\n第二页包含独立标签。\n');
  await fs.writeFile(path.join(root,'papers','paper.md'),'# 文件树内文档\n\n![父目录图片](../images/图%201.png)');
  const cloud=process.env.JIANMO_CLOUD_TEST==='1';
  const executablePath=require('electron');
  const args=[...(cloud?['--no-sandbox']:[]),cloud?(process.env.JIANMO_TEST_PACKAGED==='1'?'test/packaged-harness.cjs':'test/linux-harness.cjs'):'.',first];
  const app=await electron.launch({executablePath,args,env:{...process.env,XDG_CONFIG_HOME:path.join(root,'config'),XDG_CACHE_HOME:process.env.XDG_CACHE_HOME || path.join(root,'cache')},timeout:25000});
  let count=0;const passed=label=>{count++;console.log(`PASS ${count}: ${label}`);};
  try {
    const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.waitForSelector('#article h1');
    await page.waitForFunction(()=>document.querySelector('#article h1')?.textContent.includes('研究笔记'));
    assert.equal(await page.locator('.tab').count(),1);passed('CLI startup loads Chinese filename into one real tab');
    assert.equal(await page.evaluate(()=>typeof window.require),'undefined');assert.equal(await page.evaluate(()=>window.INJECTED),undefined);assert.equal(await page.locator('#article script').count(),0);passed('isolated renderer and document script neutralization');
    assert.ok(await page.locator('#article .katex').count()>=2);assert.equal(await page.locator('#article table').count(),1);assert.ok(await page.locator('#article .hljs-keyword').count()>0);passed('real Markdown table, code highlighting and offline KaTeX');
    await page.locator('#article img').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('#article img')?.naturalWidth>0);assert.ok(await page.locator('#article .image-blocked').count()>0);passed('relative Chinese-space image loads; remote image blocked');
    await page.evaluate(()=>document.querySelector('#scroll-container').scrollTop=0);await page.screenshot({path:'docs/research-light.png'});
    await app.evaluate(({app},files)=>{for(const file of files)app.emit('second-instance',{},['reader.exe',file],process.cwd());},[second,second,first]);
    await page.waitForFunction(()=>document.querySelectorAll('.tab').length===2);await new Promise(r=>setTimeout(r,300));assert.equal(await page.locator('.tab').count(),2);passed('second-instance event adds new tab, concurrent duplicate opens deduplicate');
    await page.locator('.tab').filter({hasText:'研究笔记 一.md'}).click();
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.evaluate(()=>document.querySelector('#scroll-container').scrollTop=700);await new Promise(r=>setTimeout(r,150));
    await page.locator('.tab').filter({hasText:'second.md'}).click();await page.locator('.tab').filter({hasText:'研究笔记 一.md'}).click();await new Promise(r=>setTimeout(r,150));assert.ok(await page.locator('#scroll-container').evaluate(el=>el.scrollTop)>650);passed('per-tab reading position preserved');
    await page.locator('#outline .outline-link').filter({hasText:'核心结论'}).click();await new Promise(r=>setTimeout(r,500));assert.ok(await page.locator('#md-h-核心结论').evaluate(el=>Math.abs(el.getBoundingClientRect().top-document.querySelector('#scroll-container').getBoundingClientRect().top))<200);passed('outline jumps to headings');
    await page.locator('#find-toggle').click();await page.locator('#find-input').fill('研究笔记');await page.waitForFunction(()=>/\d/.test(document.querySelector('#find-result').textContent));assert.ok((await page.locator('#find-result').innerText()).includes('/'));await page.locator('#find-close').click();passed('native find returns real matches and closes');
    await page.locator('#appearance-toggle').click();await page.locator('#font-increase').click();await page.waitForFunction(()=>document.querySelector('#font-value').textContent==='19 px');await page.locator('[data-theme-choice="dark"]').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await page.locator('#appearance-toggle').click();await page.evaluate(()=>document.querySelector('#scroll-container').scrollTop=0);await page.screenshot({path:'docs/research-dark.png'});passed('font controls, dark theme and appearance popup');
    const prefs=await page.evaluate(()=>window.reader.getPreferences());assert.equal(prefs.fontSize,19);assert.equal(prefs.theme,'dark');const dataDirectory=await app.evaluate(({app})=>app.getPath('userData'));await new Promise(r=>setTimeout(r,80));const savedPreferences=JSON.parse(await fs.readFile(path.join(dataDirectory,'preferences.json'),'utf8'));assert.equal(savedPreferences.fontSize,19);assert.equal(savedPreferences.theme,'dark');passed('reading preferences actually persist to local file');
    await page.locator('#theme-toggle').click();await page.locator('#toggle-sidebar').click();assert.ok(await page.locator('#app').evaluate(el=>el.classList.contains('sidebar-hidden')));await page.locator('#toggle-sidebar').click();passed('sidebar collapses and restores');
    await app.evaluate(({dialog},root)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[root]});},root);await page.locator('#files-tab').click();await page.locator('#choose-folder').click();await page.waitForSelector('.folder-root');await page.locator('.tree-entry').filter({hasText:'papers'}).click();await page.locator('.tree-entry').filter({hasText:'paper.md'}).click();await page.waitForFunction(()=>document.querySelector('#article h1')?.textContent==='文件树内文档');await page.waitForFunction(()=>document.querySelector('#article img')?.naturalWidth>0);passed('opt-in folder lazy tree opens document with parent-directory image');
    const rejected=await page.evaluate(async()=>{try{await window.reader.openPaths(['/etc/private.md']);return false;}catch{return true;}});assert.ok(rejected);passed('arbitrary renderer file paths are rejected by preload');
    const closedId=await page.locator('.tab.active').getAttribute('data-doc-id');await page.locator('.tab.active .tab-close').click();assert.equal(await page.locator('.tab').count(),2);const revoked=await app.evaluate(async({net},id)=>(await net.fetch(`mdasset://${id}/image.png`)).status,closedId);assert.equal(revoked,404);passed('closing tab revokes main-process file/image capability');
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},first);await page.locator('#open-button').click();await page.waitForFunction(()=>document.querySelector('#article h1')?.textContent.includes('研究笔记'));await page.locator('#article a').filter({hasText:'下一份文档'}).click();await page.waitForFunction(()=>document.querySelector('#article h1')?.textContent==='第二份文档');assert.equal(await page.locator('.tab').count(),2);passed('local Markdown link switches to existing document without duplicate');
    await fs.writeFile(second,'# 已更新的文档\n\n外部编辑后可重新载入。');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('reader:menu','reload'));await page.waitForFunction(()=>document.querySelector('#article h1')?.textContent==='已更新的文档');passed('reload reflects actual filesystem edits');
    await page.setViewportSize({width:740,height:620});await page.screenshot({path:'docs/narrow-layout.png'});assert.ok(await page.locator('#article').evaluate(el=>el.clientWidth>300));passed('narrow desktop window remains readable');
    assert.deepEqual(errors,[]);passed('no renderer JavaScript errors across integrated flows');
    if(!cloud){
      const child=spawn(executablePath,['.',first],{env:process.env,stdio:'ignore'});await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});await page.waitForFunction(()=>document.querySelector('#article h1')?.textContent.includes('研究笔记'));assert.equal(app.windows().length,1);passed('real second operating-system process reuses window');
    }
    console.log(`PASS: ${count} integrated Electron assertions. ${cloud?'OS singleton lock simulated because cloud AF_UNIX is restricted.':'Native process singleton checked.'}`);
    await fs.writeFile('docs/ui-results.json',JSON.stringify({passed:count,cloudHarness:cloud,windowsNative:process.platform==='win32',rendererErrors:errors},null,2));
  } finally {await app.close();await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exit(1);});
