// Test-only harness: this cloud kernel forbids AF_UNIX singleton sockets.
// Simulate the lock to test real main/renderer IPC and protocols. This file is
// explicitly excluded from the packaged application. Windows lock behavior is
// checked separately at code/event level and still needs Windows-native QA.
const {app} = require('electron');
app.requestSingleInstanceLock = () => true;
require('../src/main.cjs');
