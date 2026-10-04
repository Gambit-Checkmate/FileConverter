# Releases and CI/CD

## Decision: independent product versions, automatic engine dependency updates

FileConverter has two deliverables: the public `@fileconverter/core` npm CLI/library and the private Electron desktop app. Keep them in the same npm workspace and release them with independent semantic versions, using the existing release-please manifest mode and `node-workspace` plugin.

| Change                  | CLI/core                              | Desktop                                              |
| ----------------------- | ------------------------------------- | ---------------------------------------------------- |
| GUI feature or fix      | No release                            | Minor or patch according to its conventional commits |
| CLI/core feature or fix | Minor or patch                        | At least a patch to bundle the new core version      |
| Both packages change    | Each gets its own appropriate version | Includes the newly released core                     |
| Documentation only      | Normally no release                   | Normally no release                                  |

A desktop update does not need a new CLI version. A newly shipped desktop binary that embeds a different core version does need a desktop version, even when its UI is unchanged. The version numbers do **not** have to match. For example, core `1.9.0` may ship inside desktop `1.8.3`. The About dialog shows both versions.

The CLI and shared engine are currently one package. Consequently, even a CLI-only core release schedules a desktop dependency patch. This deliberate conservative rule keeps the bundled package current and traceable, without introducing a third product/package or a custom release bot. If CLI-only release volume becomes a problem, separating the CLI wrapper from the engine is the appropriate future change; skipping desktop bumps while silently replacing its embedded dependency is not.

The GUI pins an exact core version in its manifest. npm workspaces link the matching local core during development; release-please updates that version and the root lockfile atomically. Desktop packaging copies the core built from the same checkout, and its production dependencies come from the tested root lockfile. It never depends on the core's new npm version already being public.

## Alternatives considered

- **Shared versions (previous model):** easy to operate, but GUI-only changes republish an unchanged npm package, and a shared changelog mixes unrelated products. No longer the best fit for two deliverables.
- **Independent versions with manual dependency updates:** avoids automatic desktop patches, but requires remembering engine updates and invites stale bundled dependencies. More ongoing work for this project.
- **Changesets:** supports independent packages and explicitly authored release intent, including consumers. Useful for a larger team that wants manual release declarations. Here it adds a second change-description workflow while Conventional Commits and release-please already exist.
- **A third CLI-wrapper package:** can distinguish CLI-only from engine changes exactly, but adds another public package, migration, dependency edge, and release stream. That cost is not justified by this repository's current size.
- **Independent release-please packages with automatic consumer bumps (selected):** achieves GUI-only releases, dependency consistency, atomic version updates, and conventional-commit automation with the existing tool.

## Version and history ownership

- `packages/core/package.json` and `packages/core/CHANGELOG.md`: npm CLI/library version and history; tags remain `fileconverter-vX.Y.Z` for compatibility.
- `packages/gui/package.json` and `packages/gui/CHANGELOG.md`: desktop version and history; tags are `gui-vX.Y.Z`.
- Root `package.json`: private workspace/tooling manifest, with no product version.
- `.release-please-manifest.json`: last released versions for both packages.

Both products start the independent scheme at their already published `1.8.2` baseline. `bootstrap-sha` is the existing `fileconverter-v1.8.2` commit, so pending engine parity and desktop redesign changes are included rather than lost or replaying the full history. Historical shared release notes remain in the core changelog. Do not manually bump versions: merge the generated release PR after its checks pass.

## CI

`CI` always runs a small changes/automation job and a stable aggregate `CI` check. Branch protection requires the aggregate check, so an intentionally skipped product is acceptable but a failed or cancelled affected product is not.

- Core changes: lint, build, all unit/integration/E2E tests and coverage on Node 22 and 24; standalone CLI archives on Linux x64, Windows x64, and macOS arm64; desktop tests/installers on those three platforms because the app consumes core.
- GUI-only changes: desktop tests/installers on the three supported platforms.
- Shared lockfile, tooling, release configuration, or workflow changes: validate both products.
- Documentation-only changes: automation/aggregate checks, without expensive product rebuilds.
- Superseded PR runs are cancelled. Each main commit has its own concurrency group, so later pushes do not replace its queued CI run. In-flight publication is not cancelled.

The root lockfile is used by production staging with `npm ci`. Native packages are installed on the target platform. CLI staging executes `--version` before archiving, and the Linux job additionally creates the exact npm tarball. Desktop downloads are NSIS setup on Windows, DMG on macOS, and DEB/AppImage on Linux. CI verifies installation shortcuts/application-menu integration and runs native conversion through the worker from the installed or extracted application, not the checkout.

Every artifact records its product/version, embedded core version, platform, source SHA, and SHA-256 checksums. Downloads remain available as CI artifacts for 14 days.

## CD

`release.yml` retains its filename for the existing npm trusted publisher configuration. It runs only after successful main push CI from this repository and skips outdated CI completions when main has moved ahead. release-please opens one combined release PR when both packages need updates.

After a checked release PR is merged:

1. Main CI builds the release commit and uploads its verified artifacts.
2. release-please creates product-specific draft releases and tags.
3. Each product downloads artifacts from a successful main CI run for that **exact tagged commit**, verifies all three platforms, hashes, package versions, and the tag's commit against the CI SHA. If main has advanced, it locates (and, when necessary, waits for) the tagged commit’s CI rather than using an unrelated later CI completion.
4. CLI publication uploads its archives and publishes the verified `.tgz` using npm OIDC/provenance. An already published version is accepted only if its integrity matches, enabling safe retry after partial success.
5. Desktop publication uploads the Windows NSIS setup, macOS DMG, and Linux DEB/AppImage independently. It never needs npm publication to finish first.
6. A product's draft is published only after its required uploads/publication succeed. Desktop releases are marked GitHub's latest; CLI releases remain separately discoverable.

Each release includes `SHA256SUMS.txt` and `release-manifest.json`. CD does not reinstall dependencies or rebuild packages. A failed publish leaves that product's release draft; use **Re-run failed jobs** while its CI artifacts are retained. Do not rerun the entire release planner to recover a partially published release. Never move or reuse published version tags.

The existing `RELEASE_PLEASE_TOKEN` is retained so generated PRs trigger CI. npm uses its existing trusted publisher for `.github/workflows/release.yml`; no npm token is added. Read access is the workflow default, with write access confined to the relevant release jobs and OIDC permission confined to npm publication.

## Research and verification

Primary documentation:

- [Semantic Versioning](https://semver.org/): version ownership and the meaning of patch/minor/major changes.
- [release-please manifest mode and node-workspace](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md): independent packages, combined PRs, dependency propagation, and root lockfile updates.
- [release-please action outputs and token behavior](https://github.com/googleapis/release-please-action#outputs): per-package release signals and CI on generated PRs.
- [npm workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces/): local linking of workspace packages.
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/): OIDC and provenance.
- [GitHub workflow_run](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run): release gating after CI.
- [Changesets workflow](https://github.com/changesets/changesets/blob/main/docs/intro-to-using-changesets.md): the explicit release-intent alternative.

The selected plugin was exercised locally with the real release-please implementation: GUI-only releases touched only GUI; core-only releases patch-bumped GUI and updated its exact dependency; simultaneous features retained independent version increments. Automation tests verify path selection and rejection of wrong-commit, wrong-version, tampered, and unrecorded artifacts. Cross-platform CI checks the actual archives.
