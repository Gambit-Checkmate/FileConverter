const path = require('node:path');

module.exports = {
  outDir: '../out',
  packagerConfig: {
    name: 'FileConverter',
    asar: false,
    icon: path.join(__dirname, 'icons/icon'),
    prune: false,
    electronZipDir: process.env.ELECTRON_ZIP_DIR || undefined,
    ignore: [/\.tgz$/],
  },
  makers: [{ name: '@electron-forge/maker-zip', platforms: ['darwin', 'linux', 'win32'] }],
};
