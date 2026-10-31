'use strict';
// On Linux this sandbox cannot create Wine's Unix-domain socket. Use the same
// pure-JavaScript uninstaller extractor electron-builder uses on modern macOS.
// No application code or installed security setting is changed by this build.
const fs = require('node:fs/promises');
const path = require('node:path');
const {build,Platform,Arch} = require('electron-builder');
if (process.platform !== 'win32') {
  const {NsisTarget} = require('app-builder-lib/out/targets/nsis/NsisTarget');
  const {UninstallerReader,nsisTemplatesDir} = require('app-builder-lib/out/targets/nsis/nsisUtil');
  NsisTarget.prototype.computeScriptAndSignUninstaller = async function(defines,commands,installerPath,sharedHeader,archs) {
    const script = await fs.readFile(path.join(nsisTemplatesDir,'installer.nsi'),'utf8');
    const uninstallerPath = path.join(this.outDir,`${path.basename(installerPath,'exe')}__uninstaller.exe`);
    defines.BUILD_UNINSTALLER = null;
    defines.UNINSTALLER_OUT_FILE = path.win32.join('Z:',uninstallerPath);
    await this.executeMakensis(defines,commands,sharedHeader + await this.computeFinalScript(script,false,archs));
    await UninstallerReader.exec(installerPath,uninstallerPath);
    await this.packager.signIf(uninstallerPath);
    delete defines.BUILD_UNINSTALLER;
    defines.UNINSTALLER_OUT_FILE = uninstallerPath;
    return {script,isCustomScript:false};
  };
}
build({targets:Platform.WINDOWS.createTarget(['nsis'],Arch.x64),publish:'never',...(process.env.JIANMO_ELECTRON_DIST?{config:{electronDist:process.env.JIANMO_ELECTRON_DIST}}:{})}).catch(error=>{console.error(error);process.exit(1);});
