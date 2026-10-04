const path = require("node:path");

module.exports = {
  outDir: "../out",
  packagerConfig: {
    name: "FileConverter",
    appBundleId: "no.marentius.fileconverter",
    asar: false,
    icon: path.join(__dirname, "icons/icon"),
    prune: false,
    electronZipDir: process.env.ELECTRON_ZIP_DIR || undefined,
    ignore: [/\.tgz$/],
  },
  makers: [],
};
