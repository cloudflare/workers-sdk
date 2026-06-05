import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFile, writeFile } from "./files";
import { detectPackageManager } from "./packageManagers";

/**
 * Build-script packages that C3 itself requires through the dependencies it
 * installs (wrangler → `esbuild`, `workerd`; wrangler → miniflare → `sharp`).
 * These are the only packages C3 pre-approves; build scripts introduced by a
 * framework generator (`@parcel/watcher`, `@swc/core`, `lmdb`, …) are the
 * generator's or the user's responsibility, not ours.
 *
 * Listing a package here that isn't actually in the dependency graph is a
 * no-op: pnpm only consults `allowBuilds` entries for packages it resolves.
 */
const APPROVED_BUILDS = ["esbuild", "workerd", "sharp"] as const;
const APPROVED_BUILDS_SET = new Set<string>(APPROVED_BUILDS);

/**
 * pnpm 10.x defaults `strictDepBuilds` to `false`, so dependency build scripts
 * that haven't been explicitly approved produce a warning and the install
 * still succeeds. pnpm 11.x flipped that default to `true`, so the same
 * situation fails the install with `ERR_PNPM_IGNORED_BUILDS`.
 *
 * Wrangler depends on `workerd` and `esbuild`, and (via miniflare) on `sharp`.
 * Without pre-approval, every C3 scaffold that installs Wrangler will fail on
 * pnpm 11. This helper writes — or minimally merges into — a
 * `pnpm-workspace.yaml` in the generated project that approves exactly those
 * three packages.
 *
 * Behaviour:
 *
 * 1. **No existing `pnpm-workspace.yaml`** — write a fresh file approving
 *    `esbuild`, `workerd`, `sharp`.
 * 2. **Existing file, no `allowBuilds` block** — append our `allowBuilds`
 *    block at the end, leaving the rest of the file untouched.
 * 3. **Existing file with `allowBuilds`** — for *our* three keys only:
 *    convert a placeholder value (anything other than `true`/`false`) to
 *    `true`; add the entry if it's missing; respect an explicit
 *    `true`/`false` if the user (or a generator) already decided.
 *    **Never** touch any other entry — framework-introduced build approvals
 *    are out of scope for C3.
 *
 * No-op for non-pnpm package managers.
 */
export const writePnpmBuildApprovals = (projectPath: string) => {
	const { npm } = detectPackageManager();
	if (npm !== "pnpm") {
		return;
	}

	const yamlPath = join(projectPath, "pnpm-workspace.yaml");

	if (!existsSync(yamlPath)) {
		writeFile(yamlPath, freshWorkspaceYaml());
		return;
	}

	const original = readFile(yamlPath);
	const updated = mergeAllowBuilds(original);
	if (updated !== original) {
		writeFile(yamlPath, updated);
	}
};

const FRESH_HEADER = [
	"# Pre-approve build scripts for the packages C3 itself installs that need",
	"# them: `workerd` downloads the platform binary, `esbuild` and `sharp`",
	"# (via miniflare) download/build native bindings. Without these, pnpm 11+",
	"# aborts the install with ERR_PNPM_IGNORED_BUILDS.",
];

// Scoped package names start with `@`, which YAML 1.1 parsers may interpret
// as a node anchor reference. Quote those to be safe; everything else is a
// plain identifier and doesn't need quoting.
const formatEntry = (pkg: string) =>
	pkg.startsWith("@") ? `  '${pkg}': true` : `  ${pkg}: true`;

const freshWorkspaceYaml = () =>
	[
		...FRESH_HEADER,
		"allowBuilds:",
		...APPROVED_BUILDS.map(formatEntry),
		"",
	].join("\n");

// Matches a YAML entry inside `allowBuilds:` indented 2 spaces, capturing the
// key (optionally single- or double-quoted, allowing `@scope/name`) and the
// raw value.
const ALLOW_BUILDS_ENTRY = /^( {2})(['"]?)([^'":]+)\2:\s*(.*)$/;

/**
 * Merge approvals for our own build-script packages into an existing
 * `pnpm-workspace.yaml` body. Exported for unit testing.
 */
export const mergeAllowBuilds = (original: string): string => {
	const eol = detectEol(original);
	const lines = original.split(/\r?\n/);

	const headerIdx = lines.findIndex((line) => /^allowBuilds:\s*$/.test(line));

	if (headerIdx === -1) {
		// No allowBuilds block: append a fresh one for our three keys.
		const needsLeadingBlank =
			lines.length > 0 && lines[lines.length - 1] !== "";
		const block = [
			...(needsLeadingBlank ? [""] : []),
			...FRESH_HEADER,
			"allowBuilds:",
			...APPROVED_BUILDS.map(formatEntry),
			"",
		].join(eol);
		return original.replace(/(\r?\n)?$/, eol + block);
	}

	// Walk the existing allowBuilds block. For *our* keys only, convert
	// non-boolean placeholders to `true`. Never touch other keys.
	const seenOurKeys = new Set<string>();
	let blockEnd = lines.length;
	for (let i = headerIdx + 1; i < lines.length; i++) {
		const line = lines[i];
		if (line.trim() === "") {
			continue;
		}
		if (!line.startsWith("  ")) {
			blockEnd = i;
			break;
		}
		const match = line.match(ALLOW_BUILDS_ENTRY);
		if (!match) {
			continue;
		}
		const [, indent, quote, key, value] = match;
		if (!APPROVED_BUILDS_SET.has(key)) {
			continue;
		}
		seenOurKeys.add(key);
		const trimmed = value.trim();
		if (trimmed !== "true" && trimmed !== "false") {
			// Placeholder (or any other unrecognised value) — approve.
			lines[i] = `${indent}${quote}${key}${quote}: true`;
		}
		// If the user explicitly wrote `true` or `false`, respect it.
	}

	const missing = APPROVED_BUILDS.filter((pkg) => !seenOurKeys.has(pkg)).map(
		formatEntry
	);
	if (missing.length > 0) {
		lines.splice(blockEnd, 0, ...missing);
	}

	return lines.join(eol);
};

const detectEol = (text: string): string =>
	text.includes("\r\n") ? "\r\n" : "\n";

/**
 * Heuristic: did this error originate from pnpm refusing to run dependency
 * build scripts? `runCommand` rejects with an Error whose `message` is the
 * combined raw stdout/stderr of the failed install, so we substring-match
 * the pnpm error code printed verbatim by both pnpm 10 (with
 * `strictDepBuilds: true`) and pnpm 11 (default).
 */
export const isPnpmIgnoredBuildsError = (error: unknown): error is Error => {
	if (!(error instanceof Error)) {
		return false;
	}
	return error.message.includes("ERR_PNPM_IGNORED_BUILDS");
};

/**
 * Actionable guidance to append when an install fails with
 * `ERR_PNPM_IGNORED_BUILDS`. C3 only pre-approves the build scripts it owns
 * (`esbuild`, `workerd`, `sharp`); when a framework generator pulls in
 * additional native build-script dependencies, that's outside our scope —
 * we point the user at the standard pnpm approval flow.
 */
export const getPnpmIgnoredBuildsGuidance = () =>
	[
		"pnpm refused to run dependency build scripts (ERR_PNPM_IGNORED_BUILDS).",
		"",
		"create-cloudflare only pre-approves build scripts for the packages it",
		"installs itself. The packages listed in the pnpm output above were",
		"introduced by a framework generator and need to be approved separately.",
		"",
		"Inside the generated project, run:",
		"",
		"  pnpm approve-builds",
		"",
		"to review and approve them interactively, then re-run the install.",
	].join("\n");
