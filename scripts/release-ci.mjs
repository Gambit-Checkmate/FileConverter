import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
export function selectRun(runs, sha) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Invalid release commit.");
  const matching = runs.filter(
    (run) =>
      run.headSha === sha && run.event === "push" && run.headBranch === "main",
  );
  const run =
    matching.find(
      (run) => run.status === "completed" && run.conclusion === "success",
    ) ||
    matching.find((run) =>
      ["queued", "in_progress", "waiting", "pending", "requested"].includes(
        run.status,
      ),
    );
  if (!run || !Number.isSafeInteger(run.databaseId) || run.databaseId < 1)
    throw new Error("No successful or running main CI for the release commit.");
  return run;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const repo = process.env.GITHUB_REPOSITORY;
  const runs = JSON.parse(
    execFileSync(
      "gh",
      [
        "run",
        "list",
        "--repo",
        repo,
        "--workflow",
        "ci.yml",
        "--commit",
        sha,
        "--branch",
        "main",
        "--event",
        "push",
        "--limit",
        "20",
        "--json",
        "databaseId,headSha,headBranch,event,status,conclusion",
      ],
      { encoding: "utf8" },
    ),
  );
  const run = selectRun(runs, sha);
  // Main may have advanced after the release PR merge. Await that tag's CI,
  // not the unrelated workflow_run that happened to wake the release planner.
  if (run.conclusion !== "success")
    execFileSync(
      "gh",
      [
        "run",
        "watch",
        String(run.databaseId),
        "--repo",
        repo,
        "--exit-status",
        "--interval",
        "10",
      ],
      { stdio: "inherit" },
    );
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `run=${run.databaseId}\nsha=${sha}\n`,
  );
}
