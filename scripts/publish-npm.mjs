import fs from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
const pkg = JSON.parse(fs.readFileSync("packages/core/package.json", "utf8"));
const files = JSON.parse(fs.readFileSync("artifacts/cli-files.json", "utf8"));
const tarballs = files.filter((file) => file.endsWith(".tgz"));
if (tarballs.length !== 1)
  throw new Error("Expected one verified npm tarball.");
const tarball = tarballs[0];
const packed = JSON.parse(
  execFileSync("tar", ["-xOf", tarball, "package/package.json"], {
    encoding: "utf8",
  }),
);
if (packed.name !== pkg.name || packed.version !== pkg.version)
  throw new Error("Verified tarball has the wrong npm package identity.");
const integrity = `sha512-${createHash("sha512").update(fs.readFileSync(tarball)).digest("base64")}`;
const npm = process.env.npm_execpath;
const existing = spawnSync(
  process.execPath,
  [npm, "view", `${pkg.name}@${pkg.version}`, "dist.integrity", "--json"],
  { encoding: "utf8" },
);
if (existing.status === 0) {
  if (JSON.parse(existing.stdout) !== integrity)
    throw new Error("This npm version already exists with different contents.");
  console.log(
    `${pkg.name}@${pkg.version} was already published with identical integrity.`,
  );
} else {
  let error;
  try {
    error = JSON.parse(existing.stdout || "{}").error;
  } catch {
    /* surface the npm error below */
  }
  if (error?.code !== "E404")
    throw new Error(`Cannot inspect npm registry: ${existing.stderr}`);
  execFileSync(
    process.execPath,
    [npm, "publish", tarball, "--provenance", "--access", "public"],
    { stdio: "inherit" },
  );
}
