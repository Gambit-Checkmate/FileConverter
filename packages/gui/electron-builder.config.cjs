const path = require("node:path");

module.exports = {
  appId: "no.marentius.fileconverter",
  productName: "FileConverter",
  directories: {
    output: path.join(__dirname, "out/installers"),
    buildResources: path.join(__dirname, "icons"),
  },
  publish: null,
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    icon: path.join(__dirname, "icons/icon.ico"),
    artifactName: "FileConverter-Setup-${version}-win-x64.${ext}",
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "FileConverter",
    uninstallDisplayName: "FileConverter",
    runAfterFinish: true,
    deleteAppDataOnUninstall: false,
  },
  mac: {
    target: [{ target: "dmg", arch: ["arm64"] }],
    category: "public.app-category.utilities",
    icon: path.join(__dirname, "icons/icon.icns"),
    artifactName: "FileConverter-${version}-macos-arm64.${ext}",
  },
  dmg: {
    title: "FileConverter ${version}",
    contents: [
      { x: 130, y: 220, type: "file" },
      { x: 410, y: 220, type: "link", path: "/Applications" },
    ],
  },
  linux: {
    target: [
      { target: "AppImage", arch: ["x64"] },
      { target: "deb", arch: ["x64"] },
    ],
    executableName: "FileConverter",
    syncDesktopName: true,
    category: "Utility",
    icon: path.join(__dirname, "icons/icon.png"),
    artifactName: "FileConverter-${version}-linux-x64.${ext}",
    synopsis: "Local image, document, PDF and OCR conversion",
    maintainer: "Marentius <vetlenilseen@hotmail.com>",
  },
};
