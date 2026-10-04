export function desktopFiles(platform, version) {
  const files = {
    "win-x64": [`FileConverter-Setup-${version}-win-x64.exe`],
    "macos-arm64": [`FileConverter-${version}-macos-arm64.dmg`],
    "linux-x64": [
      `FileConverter-${version}-linux-x64.AppImage`,
      `FileConverter-${version}-linux-x64.deb`,
    ],
  };
  if (!files[platform]) throw new Error("Unsupported desktop platform.");
  return files[platform];
}

export function verifyDesktopFiles(files, platform, version) {
  if (
    JSON.stringify([...files].sort()) !==
    JSON.stringify(desktopFiles(platform, version).sort())
  ) {
    throw new Error("Missing, duplicate, or unexpected desktop installer.");
  }
}
