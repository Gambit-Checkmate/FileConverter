import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
const platforms = ["linux-x64", "win-x64", "macos-arm64"];
const hash = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const pkg = (product) =>
  JSON.parse(
    fs.readFileSync(
      `packages/${product === "cli" ? "core" : "gui"}/package.json`,
      "utf8",
    ),
  );
function walk(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walk(path.join(directory, entry.name))
        : [path.join(directory, entry.name)],
    );
}
export function verify(directory, product, version, sha) {
  const metadata = JSON.parse(
    fs.readFileSync(path.join(directory, "metadata.json"), "utf8"),
  );
  if (
    !["cli", "gui"].includes(product) ||
    metadata.product !== product ||
    metadata.version !== version ||
    metadata.sha !== sha ||
    !/^[a-f0-9]{40}$/.test(sha) ||
    !platforms.includes(metadata.platform)
  )
    throw new Error(
      "Artifact identity does not match the tested release commit.",
    );
  if (!metadata.files?.length) throw new Error("No release files.");
  const files = metadata.files.map((entry) => {
    if (
      typeof entry.name !== "string" ||
      path.basename(entry.name) !== entry.name ||
      /[\\/]/.test(entry.name) ||
      entry.name === "metadata.json"
    )
      throw new Error("Invalid artifact filename.");
    const file = path.join(directory, entry.name);
    if (!fs.lstatSync(file).isFile() || hash(file) !== entry.sha256)
      throw new Error(`Artifact checksum mismatch: ${entry.name}`);
    return file;
  });
  const actual = fs
    .readdirSync(directory)
    .filter((name) => name !== "metadata.json")
    .sort();
  if (
    JSON.stringify(actual) !==
    JSON.stringify(metadata.files.map((e) => e.name).sort())
  )
    throw new Error("Unrecorded or duplicate release files.");
  return { ...metadata, files };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [command, product, directory] = process.argv.slice(2);
  if (!["cli", "gui"].includes(product)) throw new Error("Select cli or gui.");
  const version = pkg(product).version;
  if (command === "record") {
    const platform = path.basename(directory).replace(`${product}-`, "");
    if (!platforms.includes(platform)) throw new Error("Invalid platform.");
    fs.mkdirSync(directory, { recursive: true });
    if (product === "gui") {
      const files = walk("packages/gui/out/make/zip").filter((f) =>
        f.endsWith(`-${version}.zip`),
      );
      if (files.length !== 1)
        throw new Error(`Expected one desktop ZIP, got ${files.length}.`);
      fs.copyFileSync(files[0], path.join(directory, path.basename(files[0])));
    }
    const files = fs
      .readdirSync(directory)
      .filter((file) => file !== "metadata.json")
      .sort()
      .map((name) => ({ name, sha256: hash(path.join(directory, name)) }));
    const sha =
      process.env.GITHUB_SHA ||
      execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    fs.writeFileSync(
      path.join(directory, "metadata.json"),
      JSON.stringify(
        {
          product,
          platform,
          version,
          coreVersion: pkg("cli").version,
          sha,
          files,
        },
        null,
        2,
      ) + "\n",
    );
    verify(directory, product, version, sha);
  } else if (command === "verify-release") {
    const expected = process.env.CI_SHA;
    const tag = process.env.RELEASE_TAG;
    if (tag !== `${product === "cli" ? "fileconverter" : "gui"}-v${version}`)
      throw new Error("Release tag/version mismatch.");
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    if (head !== expected)
      throw new Error(
        "Release tag does not identify the successful CI commit.",
      );
    const paths = platforms
      .map((platform) => {
        const artifact = verify(
          path.join(directory, `${product}-${platform}`),
          product,
          version,
          expected,
        );
        if (
          artifact.platform !== platform ||
          artifact.coreVersion !== pkg("cli").version
        )
          throw new Error("Platform/engine mismatch.");
        const archives = artifact.files.filter((file) =>
          file.endsWith(product === "cli" ? ".tar.gz" : ".zip"),
        );
        if (archives.length !== 1)
          throw new Error("Expected one archive per platform.");
        if (product === "cli") {
          const tarballs = artifact.files.filter((file) =>
            file.endsWith(".tgz"),
          );
          if (tarballs.length !== (platform === "linux-x64" ? 1 : 0))
            throw new Error("Missing/duplicate npm package.");
        }
        return artifact.files;
      })
      .flat();
    const sums = path.join(directory, "SHA256SUMS.txt");
    const manifest = path.join(directory, "release-manifest.json");
    fs.writeFileSync(
      sums,
      paths.map((file) => `${hash(file)}  ${path.basename(file)}`).join("\n") +
        "\n",
    );
    fs.writeFileSync(
      manifest,
      JSON.stringify(
        {
          product,
          version,
          coreVersion: pkg("cli").version,
          sha: expected,
          files: paths.map((file) => ({
            name: path.basename(file),
            sha256: hash(file),
          })),
        },
        null,
        2,
      ) + "\n",
    );
    fs.writeFileSync(
      path.join(directory, `${product}-files.json`),
      JSON.stringify([...paths, sums, manifest]),
    );
    console.log(
      `Verified ${product} ${version} from ${head}: ${paths.length} files.`,
    );
  } else throw new Error("Expected record or verify-release.");
}
