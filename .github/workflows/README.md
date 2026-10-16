# Vite plugin v1 workflows

- test-and-check.yml runs validation, plugin/private-package unit tests, and integration fixture tests.
- vite-plugin-playgrounds.yml runs dev and build/preview browser tests on Vite 6, 7, and 8; Vite 8 also runs on macOS and Windows.
- e2e-vite.yml tests installation through supported package managers. Remote tests require the ci:run-remote-tests PR label or the merge queue; fork PRs never receive credentials.
- prerelease.yml builds and preview-publishes only the plugin through pkg.pr.new.
- changesets.yml versions and releases only the plugin from vite-plugin-v1, using npm's v1 dist-tag.
- codeowners.yml and the rerun-codeowners workflow pair preserve required ownership approvals and re-evaluate them after reviews. Changeset release branches are skipped.
- bonk-pr-review.yml reviews new same-repository PRs from Cloudflare org members, excluding changeset release PRs.
- validate-pr-description.yml keeps PR test, changeset, and documentation declarations consistent.

CI, playground, and E2E jobs use the signed Turbo remote cache. Cache keys include the target base branch, operating system, and Node version. PRs, branch pushes, and merge-queue runs normalize the base branch to the same name. Playground keys also include the selected Vite major, the plugin build hash captured before compatibility downgrades, and shared test configuration/helpers. Checks run lint, types, and formatting through Turbo.

Dependency installation uses a frozen lockfile. Release builds skip shared caches and omit package source maps. Every external GitHub Action remains pinned to a full commit SHA.

Test job names preserve the status contexts required by the repository rules for vite-plugin-v1.
