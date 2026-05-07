# Review Guidelines

This file provides guidance to Devin Review when reviewing PRs in this repository.

## Code Quality

- Avoid using global variables. Repository maintainers will reject code that introduces global variables.
- When a function needs to return multiple related objects, prefer changing the function signature to return an object with named properties (e.g., `return { wrangler, registry }`) rather than using `Object.defineProperty` to attach additional properties to one of the return values.
- When implementing multiple similar validation checks (like BOM detection in different formats), prefer using data structures like arrays of objects to reduce code duplication. For example, when checking for different byte patterns, use an array of objects with shape `{name: string, buffer: Buffer}` and loop over the array instead of writing separate conditional blocks for each pattern.

## Formatting and Pre-Submission

- All changes must pass `pnpm fix` followed by `pnpm check` before committing. The repo has strict formatting requirements enforced by Prettier that must be satisfied for PRs to pass CI.

## Testing

- Use the `runInTmpDir()` utility instead of mocking filesystem operations. The repository maintainers prefer real filesystem operations in tests over mocking. The `runInTmpDir()` utility creates isolated temporary directories, handles cleanup automatically in `afterEach` hooks, and allows tests to write actual files and assert against them using `readFileSync()` and similar real filesystem operations.
- Do not mock the logger directly. Instead, use the standardized `mockConsoleMethods()` helper from `packages/wrangler/src/__tests__/helpers/mock-console.ts` to capture stdout/stderr. Use the pattern `const std = mockConsoleMethods()` in test setup, then access captured output via `std.out`, `std.err`, `std.warn` properties. Assert against captured output using `expect(std.out).toMatchInlineSnapshot()`.
- You can run specific test files locally using `pnpm -w test:ci -F wrangler -- [test-file-name]`. For example, to run R2 tests specifically, use `pnpm -w test:ci -F wrangler -- r2.test.ts`.

## CI Failures

- Test failures in CI are often flakes that can be rerun rather than actual issues requiring code fixes. If a test fails on one OS but passes on another, it is likely a flake and should be rerun at least twice before investigating further.
- The "v3 Maintenance / Open backport PR for patches (pull_request)" CI failure can be ignored as it is not a blocking issue. When this failure occurs, label the original PR with the `skip-v3-pr` label and then manually create a v3 backport PR.
- A "v3 Maintenance / Is original PR merged (pull_request)" CI failure on backport PRs that says something like "PR #NNNN is not merged." is expected. This CI job prevents merging backport PRs until the original PR has been merged first, and will succeed once the original PR is merged.

## Changesets

- Every change to package code requires a changeset or it will not trigger a release.
- Changesets should target users of the tools (e.g. Wrangler users) rather than maintainers. Avoid including implementation details like "moves X from hybridModules to nativeModules" or "removes polyfill implementation" or "adds comprehensive tests". Instead, focus on user-facing impact and benefits. The changeset file content will be copied to the changelog, so it should be written from the user's perspective about what changed for them.
- Do NOT prefix changeset titles with a "type" (e.g. `fix:`, `feat:`, `chore:`). The changeset title should be a plain description without conventional commit prefixes.

### Semver Classification

- **Minor (new features):** Adding support for new frameworks (even in experimental mode), new commands/flags/options, new API capabilities or exports, behavior changes that add functionality.
- **Patch (bug fixes and improvements):** Fixing bugs where something was not working correctly, dependency updates, internal refactoring without user-facing changes, performance improvements, error message improvements.
- The description text matters less than the actual change. A changeset described as "Support X" is adding a new feature (minor), while "filters out invalid X" is fixing a bug (patch). Analyze what the change actually does for users rather than relying on keywords.

## Pull Requests

- PRs should always begin as drafts. Once CI is green and the discussion with the initiator is resolved, they can be marked as ready for review.
- PRs need changesets and tests to prove the problem is fixed. Simply implementing the code fix is not sufficient.
- PR descriptions must include Tests, Documentation, and V3 back-port sections in markdown checkbox format. Use the PR template found at `.github/pull_request_template.md`. The PR validation will fail if these sections are written as plain text instead of checkboxes and if at least one checkbox in each section is not ticked.

## Backport PRs

- Branch names for backport PRs should be `v3-backport-<PR_NUMBER>` where `<PR_NUMBER>` is the number of the GitHub PR being backported.
- Backport PRs should target the `v3-maintenance` branch and be labeled with the `v3-backport` label.
- Only backport PRs that affect wrangler or its dependencies.
- Only backport bug fixes, not new features, nor fixes to features that were still in beta when Wrangler V4 was released.
- Update the description of the original PR to include a link to the newly created backport PR.
- If cherry-picking results in more than 3-4 merge conflicts, switch to manually porting just the core functionality instead of trying to resolve extensive merge conflicts.

## Cloudflare Workers Specifics

- When removing or modifying scheduled functions in Cloudflare Workers, remember to update both the code in the Worker file and the corresponding cron trigger in the `wrangler.toml` configuration file.

## Adding Native Node.js Module Support (unenv-preset)

- The authoritative source for Node.js module compatibility flags and dates is the workerd repository's `compatibility-date.capnp` file at https://github.com/cloudflare/workerd/blob/main/src/workerd/io/compatibility-date.capnp.
- If the module is marked as `$experimental` in workerd (no `$impliedByAfterDate`), follow the pattern used by other experimental modules in `preset.ts`.
- The pattern for adding a new module override involves:
  - Creating a `get<Module>Overrides()` function similar to existing ones (e.g., `getVmOverrides()`)
  - Adding the override to `getCloudflarePreset()` and spreading into `dynamicNativeModules` and `dynamicHybridModules`
  - Adding tests to `packages/wrangler/e2e/unenv-preset/preset.test.ts`
  - Adding test functions to `packages/wrangler/e2e/unenv-preset/worker/index.ts`

## Dependencies

- Always run `pnpm i` after updating dependencies to also update the package lock file.

## PR Feedback

- Only make changes to the PR if the feedback is a clear command that mentions "Devin". Otherwise, engage with the commenter to discuss the best approach.
- Do not make any changes if a comment starts with "nit", "question", or "minor", even if it sounds like a command.
- Unless very sure that a suggestion is correct, ask clarifying questions and outline proposed changes for confirmation before actioning.

## Version Packages PR Review

When reviewing Version Packages PRs, use a structured two-pass review process:

1. **Pass 1 - Extract Facts:** For each changeset, identify filename/slug, package(s) affected, declared classification (from front-matter), description, and source PR number.
2. **Pass 2 - Analyze and Compare:** For each changeset, determine recommended classification, rationale, and whether it matches the declared classification.
3. **Pass 3 - Report Only Mismatches:** Only flag changesets where declared does not match recommended. State: "Currently classified as X, should be Y because..."

Use the semver classification guidelines above to determine correct classification.
