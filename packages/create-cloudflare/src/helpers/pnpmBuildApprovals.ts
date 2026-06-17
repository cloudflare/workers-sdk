import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFile, writeFile } from "./files";
import { detectPackageManager } from "./packageManagers";

// Build-script packages C3 pre-approves: wrangler depends on `esbuild` and
// `workerd`, and (via miniflare) on `sharp`. Framework-introduced build
// scripts are out of scope.
const APPROVED_BUILDS = ["esbuild", "workerd", "sharp"] as const;
const APPROVED_BUILDS_SET = new Set<string>(APPROVED_BUILDS);

/**
 * Write or merge `allowBuilds` entries for `APPROVED_BUILDS` into the
 * generated project's `pnpm-workspace.yaml`. Without these, pnpm 11+ aborts
 * the install with `ERR_PNPM_IGNORED_BUILDS`. No-op for non-pnpm package
 * managers. Preserves any pre-existing entries the user/generator added.
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

// Quote scoped names (`@…`) so YAML 1.1 doesn't treat `@` as a node anchor.
const formatEntry = (pkg: string) =>
	pkg.startsWith("@") ? `  '${pkg}': true` : `  ${pkg}: true`;

const freshWorkspaceYaml = () =>
	[
		...FRESH_HEADER,
		"allowBuilds:",
		...APPROVED_BUILDS.map(formatEntry),
		"",
	].join("\n");

// Captures a 2-space-indented YAML entry: key (optionally quoted) and value.
const ALLOW_BUILDS_ENTRY = /^( {2})(['"]?)([^'":]+)\2:\s*(.*)$/;

/** Exported for unit testing. */
export const mergeAllowBuilds = (original: string): string => {
	const eol = detectEol(original);
	const lines = original.split(/\r?\n/);

	const headerIdx = lines.findIndex((line) => /^allowBuilds:\s*$/.test(line));

	if (headerIdx === -1) {
		// No allowBuilds block: append a fresh one.
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

	// For our keys only, convert non-boolean placeholders to `true`. Other
	// keys are left untouched.
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
			// Placeholder or unrecognised value — approve. Explicit
			// `true`/`false` is respected.
			lines[i] = `${indent}${quote}${key}${quote}: true`;
		}
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

export const isPnpmIgnoredBuildsError = (error: unknown): error is Error => {
	if (!(error instanceof Error)) {
		return false;
	}
	return error.message.includes("ERR_PNPM_IGNORED_BUILDS");
};

const IGNORED_BUILDS_LINE = /Ignored build scripts:\s*([^\n\r]+)/;

/**
 * Parse the package list pnpm prints after `Ignored build scripts:`, returning
 * names without their `@version` suffix (so they can be passed to
 * `pnpm approve-builds`). Returns `[]` if the input has no recognisable list.
 */
export const extractIgnoredBuildPackages = (error: unknown): string[] => {
	const text =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: "";
	const match = text.match(IGNORED_BUILDS_LINE);
	if (!match) {
		return [];
	}

	const seen = new Set<string>();
	const result: string[] = [];
	for (const raw of match[1].split(",")) {
		const trimmed = raw.trim();
		if (!trimmed) {
			continue;
		}
		const name = stripPackageVersion(trimmed);
		if (name && !seen.has(name)) {
			seen.add(name);
			result.push(name);
		}
	}
	return result;
};

// `@scope/name@1.2.3` → `@scope/name`; `name@1.2.3` → `name`.
const stripPackageVersion = (spec: string): string => {
	if (spec.startsWith("@")) {
		const slashIdx = spec.indexOf("/");
		if (slashIdx === -1) {
			return spec;
		}
		const versionAt = spec.indexOf("@", slashIdx);
		return versionAt === -1 ? spec : spec.slice(0, versionAt);
	}
	const atIdx = spec.indexOf("@");
	return atIdx === -1 ? spec : spec.slice(0, atIdx);
};

/**
 * Thrown when pnpm refused to run dependency build scripts and recovery
 * failed (or the user declined). Carries the parsed package list so the
 * top-level error handler can render a concise message.
 */
export class IgnoredBuildsError extends Error {
	readonly packages: readonly string[];

	constructor(packages: readonly string[], cause?: unknown) {
		const list = packages.length > 0 ? packages.join(", ") : "(unknown)";
		super(`pnpm blocked unapproved dependency build scripts: ${list}`);
		this.name = "IgnoredBuildsError";
		this.packages = packages;
		if (cause !== undefined) {
			this.cause = cause;
		}
	}
}

export const isIgnoredBuildsError = (
	error: unknown
): error is IgnoredBuildsError => error instanceof IgnoredBuildsError;

export const getPnpmIgnoredBuildsGuidance = (
	packages: readonly string[] = []
) => {
	const approveCommand =
		packages.length > 0
			? `  pnpm approve-builds ${packages.join(" ")}`
			: "  pnpm approve-builds";
	return [
		"create-cloudflare only pre-approves build scripts for the packages it",
		"installs itself. The packages flagged above were introduced by the",
		"framework generator and need to be approved separately.",
		"",
		"Inside the generated project, run:",
		"",
		approveCommand,
		"",
		"then re-run the install.",
	].join("\n");
};
