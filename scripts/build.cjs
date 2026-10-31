const esbuild = require('esbuild');
const fs = require('node:fs/promises');
(async()=>{
  await fs.mkdir('dist',{recursive:true});
  await esbuild.build({entryPoints:['src/renderer.js'],outdir:'dist',bundle:true,minify:true,sourcemap:false,assetNames:'assets/[name]-[hash]',loader:{'.woff2':'file','.woff':'file','.ttf':'file'},target:'chrome144'});
  await fs.copyFile('src/index.html','dist/index.html');
})();
