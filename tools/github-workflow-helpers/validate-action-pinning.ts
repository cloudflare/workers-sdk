import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "glob";

/**
 * Matches `uses:` directives in GitHub Actions workflow YAML files.
 * Captures the action reference (everything after `uses:`), trimmed.
 *
 * Examples that match:
 *   - uses: actions/checkout@v4
 *     uses: dorny/paths-filter@de90cc6fb38fc0963ad72b210f1f284cd68cea36 # v3
 */
const USES_RE = /^\s*-?\s*uses:\s*(.+)$/;

/**
 * A valid SHA pin is exactly 40 lowercase hex characters.
 */
const SHA_RE = /^[0-9a-f]{40}$/;

/**
 * First-party GitHub action prefixes that are trusted and do not
 * need to be pinned to a commit SHA.
 */
const TRUSTED_PREFIXES = ["actions/"];

/**
 * Checks that all third-party GitHub Actions in workflow and composite
 * action files are pinned to a full commit SHA rather than a mutable
 * tag or branch reference.
 *
 * @param repoRoot - Absolute path to the repository root directory.
 * @returns An array of human-readable error strings (empty = all good).
 */
export function validateActionPinning(repoRoot: string): string[] {
	const patterns = [
		".github/workflows/*.yml",
		".github/workflows/*.yaml",
		".github/actions/*/action.yml",
		".github/actions/*/action.yaml",
	];

	const files = patterns.flatMap((pattern) =>
		globSync(pattern, { cwd: repoRoot })
	);

	const errors: string[] = [];

	for (const relPath of files) {
		const absPath = resolve(repoRoot, relPath);
		const content = readFileSync(absPath, "utf-8");
		const lines = content.split("\n");

		for (let i = 0; i < lines.length; i++) {
			const match = lines[i].match(USES_RE);
			if (!match) {
				continue;
			}

			const raw = match[1].trim();

			// Local actions (e.g. ./.github/actions/foo) — skip
			if (raw.startsWith("./") || raw.startsWith("../")) {
				continue;
			}

			// Trusted first-party actions — skip
			if (TRUSTED_PREFIXES.some((prefix) => raw.startsWith(prefix))) {
				continue;
			}

			// At this point it's a third-party action.
			// Expected format: owner/repo@<ref>  (possibly with a trailing comment)
			const atIndex = raw.indexOf("@");
			if (atIndex === -1) {
				errors.push(
					`${relPath}:${i + 1} — ${raw.split(/\s/)[0]} has no version reference at all`
				);
				continue;
			}

			// The ref is everything after @ up to the first space (comments follow a space)
			const afterAt = raw.slice(atIndex + 1).split(/\s/)[0];

			if (!SHA_RE.test(afterAt)) {
				errors.push(
					`${relPath}:${i + 1} — ${raw.split(/\s/)[0]} is not pinned to a commit SHA`
				);
			}
		}
	}

	return errors;
}

if (require.main === module) {
	console.log("::group::Checking GitHub Action pinning");
	const repoRoot = resolve(__dirname, "../..");
	const errors = validateActionPinning(repoRoot);
	if (errors.length > 0) {
		console.error(
			"::error::Action pinning checks:" + errors.map((e) => `\n- ${e}`).join("")
		);
	}
	console.log("::endgroup::");
	process.exit(errors.length > 0 ? 1 : 0);
}
