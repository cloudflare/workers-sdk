# Changesets

Every non-trivial change to the project - those that should appear in the changelog - must be captured in a "changeset".

We use the [`changesets`](https://github.com/changesets/changesets/blob/main/README.md) tool for creating changesets, publishing versions and updating the changelog.

## Creating a Changeset

```sh
pnpm changeset
```

1. Select which packages are affected by the change
2. Choose whether the version requires a major, minor, or patch release
3. Write a description of the change (see format below)
4. Include the generated changeset in your commit:
   ```sh
   git add .changeset/*.md
   ```

## Version Types

- **patch**: Bug fixes, small improvements, documentation fixes
- **minor**: New features, new CLI commands, new configuration options, deprecations, and changes to experimental/beta/pre-1.0 features (including breaking changes to those features). When adding or changing experimental features, call this out explicitly in the changeset description.
- **major**: Breaking changes to stable features (when deprecations take effect, or functional breaking behavior is added). Note: breaking changes to experimental/beta features do NOT require a major version bump.

**Important restrictions:**

- Major versions for `wrangler` are currently **forbidden**. This rule will be removed when we are preparing for the next major release of `wrangler`.
- Major versions for other packages require strong justification
- If the change collects more analytics, it should be a minor even though there is no user-visible change.

## Changeset Message Format

```
<TITLE>

<BODY>
```

- **TITLE**: A single sentence with an imperative description of the change
- **BODY**: One or more paragraphs explaining the reason for the change and anything notable about the approach. Aim for more than one sentence but less than three paragraphs to keep it succinct and useful. Larger changes may warrant more detail.

### Good Examples

For a new feature (minor):

```markdown
---
"wrangler": minor
---

Add `wrangler d1 export` command for exporting D1 databases to SQL files

You can now export your D1 database to a local SQL file:

`wrangler d1 export my-database --output backup.sql`

This is useful for creating backups or migrating data between databases.
```

For a bug fix (patch):

```markdown
---
"wrangler": patch
---

Fix `wrangler dev` failing to start when `wrangler.toml` contains Unicode characters

Previously, projects with non-ASCII characters in configuration values would fail with "Invalid UTF-8 sequence". This is now handled correctly.
```

### Bad Examples (avoid these)

- "fix bug" - What bug? What was the symptom?
- "update dependency" - Which one? Why? Any user impact?
- "Add new feature" - What feature? How do you use it?
- "refactor" - Why does this warrant a release? What's the user impact?

## Formatting Rules

### Markdown Headers

Changeset descriptions must **NOT** use h1 (`#`), h2 (`##`), or h3 (`###`) headers.

The changelog uses h3 for section headers, so any headers in changeset content must be h4 (`####`) or smaller. This prevents formatting issues in the generated changelog.

### Code Examples

For new features or significant changes, consider including a brief usage example. Examples can be helpful for users to understand new functionality, but they are not mandatory—use your judgment based on how self-explanatory the change is.

When showing Wrangler configuration examples, use `wrangler.json` (with JSONC syntax for comments) rather than `wrangler.toml`.

## Multiple Changesets

If your PR makes multiple distinct user-facing changes, create separate changesets so each gets its own changelog entry. Don't lump unrelated changes together, and don't mix different types of changes (e.g., bug fix + new feature) in a single changeset.

## Package Coverage

Each changeset should reference all packages that have user-facing changes:

- If a change affects multiple packages, list them all in the changeset
- Alternatively, create separate changesets for each package if the changes warrant different descriptions
- Changesets automatically releases packages affected through runtime dependencies. Include consumers of bundled `devDependencies` explicitly, because Changesets does not bump their versions automatically.

## When a Changeset is NOT Required

- Changes that are purely internal refactoring with no user-facing impact
- Changes only to devDependencies
- Documentation-only changes within a package
- Test-only changes
- CI/workflow changes that don't affect package behavior

## npm Prereleases

To release an npm package as a prerelease while other packages continue receiving stable releases, add an `npmPrerelease` object to its `workers-sdk` metadata:

```json
{
	"workers-sdk": {
		"npmPrerelease": {
			"tag": "beta",
			"numbered": true
		}
	}
}
```

The tag is appended to versions and used as the npm dist-tag. The `latest` tag is reserved for stable releases and cannot be used for a prerelease. Numbered prereleases advance a counter such as `2.0.0-beta.0`, `2.0.0-beta.1`, and so on. Unnumbered prereleases advance the package's patch version instead, producing versions such as `5.20260723.0-beta` and `5.20260723.1-beta`.

Add a changeset when starting a prerelease. Miniflare requires a major changeset when beginning a new major prerelease because its minor version remains aligned with workerd. While a prerelease is active, major, minor, and patch changesets all advance it by one release. Updating workerd updates Miniflare's date and resets its patch to `0`.

Change `tag` and add a changeset to move to another stage such as `beta` or `rc`. To graduate, remove `npmPrerelease` and add a changeset. The prerelease suffix will be removed while retaining the target version.

## File Example

Here's a complete example of a patch changeset file:

```markdown
---
"wrangler": patch
---

Replace the word "publish" with "deploy" everywhere

We should be consistent with the word that describes how we get a worker to the edge. The command is `deploy`, so let's use that everywhere.
```
