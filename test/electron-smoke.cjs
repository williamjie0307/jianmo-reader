const {_electron:electron}=require('playwright');
const path=require('node:path');
const fs=require('node:fs/promises');
(async()=>{
  const app=await electron.launch({executablePath:path.resolve('node_modules/electron/dist/electron'),args:['--no-sandbox','test/linux-harness.cjs'],env:{...process.env,DISPLAY:'127.0.0.1:99',XDG_CONFIG_HOME:'/tmp/jianmo-test-config',XDG_CACHE_HOME:'/tmp/jianmo-cache'},timeout:25000});
  try {
    app.process().stderr.on('data',s=>process.stderr.write(s));
    const page=await app.firstWindow({timeout:15000});
    page.on('console',m=>console.log('UI:',m.type(),m.text()));
    page.on('pageerror',e=>console.error('PAGE:',e));
    await page.waitForSelector('#article h1',{timeout:15000});
    console.log('TITLE',await page.title());
    console.log('TEXT',(await page.locator('#article').innerText()).slice(0,100));
    await page.screenshot({path:'docs/welcome-light.png'});
    console.log('SMOKE PASSED');
  } finally {await app.close();}
})().catch(e=>{console.error(e);process.exit(1)});
