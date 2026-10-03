const fs = require("node:fs");
const path = require("node:path");
const {
  assertAllowedExistingPath,
  assertSafeAbsolutePath,
} = require("./path-allowlist.cjs");
const optionKeys = new Set([
  "quality",
  "maxWidth",
  "maxHeight",
  "stripMetadata",
  "concurrency",
  "retries",
  "recursive",
  "language",
  "preset",
  "presetScope",
  "operation",
  "pages",
  "dpi",
  "outputFile",
  "projectDirectory",
]);
function directory(candidate, allowlist) {
  const real = assertAllowedExistingPath(candidate, allowlist);
  if (!fs.statSync(real).isDirectory()) throw new Error("Select a directory.");
  return real;
}
function validateRequest(action, payload, allowlist, destinations = new Set()) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new Error("Invalid request.");
  if (action === "info") return {};
  if (action.startsWith("presets:")) {
    const projectDirectory =
      payload.projectDirectory === undefined
        ? undefined
        : directory(payload.projectDirectory, allowlist);
    return {
      name: payload.name,
      description: payload.description,
      parameters: payload.parameters,
      type: payload.type,
      scope: payload.scope,
      projectDirectory,
    };
  }
  if (!["convert", "preview", "inputs:inspect"].includes(action))
    throw new Error("Unknown request.");
  if (
    !Array.isArray(payload.inputPaths) ||
    (!payload.inputPaths.length && action !== "inputs:inspect")
  )
    throw new Error("Select input files or a folder.");
  const inputPaths = payload.inputPaths.map((candidate) => {
    const real = assertAllowedExistingPath(candidate, allowlist);
    const stat = fs.statSync(real);
    if (!stat.isFile() && !stat.isDirectory())
      throw new Error("Input must be a file or folder.");
    return real;
  });
  const options = payload.options || {};
  if (
    typeof options !== "object" ||
    Array.isArray(options) ||
    Object.keys(options).some((key) => !optionKeys.has(key))
  )
    throw new Error("Invalid conversion options.");
  const safeOptions = { ...options };
  if (options.projectDirectory !== undefined)
    safeOptions.projectDirectory = directory(
      options.projectDirectory,
      allowlist,
    );
  let outputDir;
  if (options.outputFile !== undefined) {
    const safe = assertSafeAbsolutePath(options.outputFile);
    const canonical = path.join(
      fs.realpathSync(path.dirname(safe)),
      path.basename(safe),
    );
    if (!destinations.has(canonical))
      throw new Error("Output file was not selected through the save dialog.");
    safeOptions.outputFile = canonical;
    outputDir = path.dirname(canonical);
    if (
      fs.realpathSync(assertSafeAbsolutePath(payload.outputDir)) !== outputDir
    )
      throw new Error("Output folder does not match the selected output file.");
  } else if (payload.outputDir)
    outputDir = directory(payload.outputDir, allowlist);
  else if (action !== "inputs:inspect")
    throw new Error("Select an output folder.");
  return {
    inputPaths,
    outputDir,
    format: payload.format,
    options: safeOptions,
    recursive: !!payload.recursive,
  };
}
module.exports = { validateRequest };
