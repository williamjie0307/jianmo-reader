// Test the exact packaged ASAR with a Linux Electron runtime. Windows executable
// startup and installer execution still require Windows-native validation.
const {app}=require('electron');
app.requestSingleInstanceLock=()=>true;
require('../release/win-unpacked/resources/app.asar/src/main.cjs');
