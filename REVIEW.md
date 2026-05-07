# Review Guidelines

This file provides guidance when reviewing PRs in this repository. For general development guidelines, see [AGENTS.md](./AGENTS.md).

## Code Quality

- Avoid using global variables. Repository maintainers will reject code that introduces global variables.
- When a function needs to return multiple related objects, prefer changing the function signature to return an object with named properties (e.g., `return { wrangler, registry }`) rather than using `Object.defineProperty` to attach additional properties to one of the return values.
- When implementing multiple similar validation checks (like BOM detection in different formats), prefer using data structures like arrays of objects to reduce code duplication. For example, when checking for different byte patterns, use an array of objects with shape `{name: string, buffer: Buffer}` and loop over the array instead of writing separate conditional blocks for each pattern.

## CI Failures

- Test failures in CI are often flakes that can be rerun rather than actual issues requiring code fixes. If a test fails on one OS but passes on another, it is likely a flake and should be rerun at least twice before investigating further.

## Changesets

- Changesets should target users of the tools (e.g. Wrangler users) rather than maintainers. Avoid including implementation details like "moves X from hybridModules to nativeModules" or "removes polyfill implementation" or "adds comprehensive tests". Instead, focus on user-facing impact and benefits.
- Do NOT prefix changeset titles with a "type" (e.g. `fix:`, `feat:`, `chore:`). The changeset title should be a plain description without conventional commit prefixes.

### Semver Classification

- **Minor (new features):** Adding support for new frameworks (even in experimental mode), new commands/flags/options, new API capabilities or exports, behavior changes that add functionality.
- **Patch (bug fixes and improvements):** Fixing bugs where something was not working correctly, dependency updates, internal refactoring without user-facing changes, performance improvements, error message improvements.
- The description text matters less than the actual change. A changeset described as "Support X" is adding a new feature (minor), while "filters out invalid X" is fixing a bug (patch). Analyze what the change actually does for users rather than relying on keywords.

## Version Packages PR Review

When reviewing Version Packages PRs, use a structured two-pass review process:

1. **Pass 1 - Extract Facts:** For each changeset, identify filename/slug, package(s) affected, declared classification (from front-matter), description, and source PR number.
2. **Pass 2 - Analyze and Compare:** For each changeset, determine recommended classification, rationale, and whether it matches the declared classification.
3. **Pass 3 - Report Only Mismatches:** Only flag changesets where declared does not match recommended. State: "Currently classified as X, should be Y because..."

Use the semver classification guidelines above to determine correct classification.
