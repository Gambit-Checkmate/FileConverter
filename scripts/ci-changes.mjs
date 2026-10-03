import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
export function affected(files) {
  let core = false,
    gui = false;
  for (const file of files) {
    if (
      file.endsWith(".md") ||
      file.startsWith("docs/") ||
      file.startsWith("packages/gui/docs/") ||
      file.startsWith(".github/ISSUE_TEMPLATE/") ||
      ["LICENSE", ".gitignore"].includes(file)
    )
      continue;
    if (file.startsWith("packages/core/")) core = true;
    else if (file.startsWith("packages/gui/")) gui = true;
    else if (
      file === "package.json" ||
      file === "package-lock.json" ||
      file.startsWith("scripts/") ||
      file.startsWith("test/") ||
      file.startsWith(".github/workflows/") ||
      file.startsWith("release-please") ||
      file === ".release-please-manifest.json"
    )
      core = gui = true;
    else core = gui = true;
  }
  return { core, gui: core || gui };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const event = JSON.parse(
    fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"),
  );
  const base = event.pull_request?.base.sha || event.before;
  const head = event.pull_request?.head.sha || process.env.GITHUB_SHA;
  const valid = /^[0-9a-f]{40}$/;
  let result = { core: true, gui: true };
  if (valid.test(base || "") && valid.test(head || "") && !/^0+$/.test(base)) {
    const args = event.pull_request ? [`${base}...${head}`] : [base, head];
    const files = execFileSync(
      "git",
      ["diff", "--no-renames", "--name-only", "-z", ...args],
      {
        encoding: "utf8",
      },
    )
      .split("\0")
      .filter(Boolean);
    result = affected(files);
  }
  const lines =
    Object.entries(result)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n";
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(process.env.GITHUB_OUTPUT, lines);
  process.stdout.write(lines);
}
