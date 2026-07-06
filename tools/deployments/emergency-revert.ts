import { spawnSync } from "node:child_process";
import { valid } from "semver";
import type { SpawnSyncReturns } from "node:child_process";

/**
 * Emergency revert tool for when a Wrangler release is broken.
 *
 * Unlike its siblings in this directory, this script is never invoked by
 * CI. Normal releases (changesets.yml) and hotfix releases
 * (hotfix-release.yml) both publish via npm OIDC Trusted Publishing, which
 * only covers `npm publish` — it does not grant `npm dist-tag` or
 * `npm deprecate` permissions. Run this locally with an authenticated npm
 * session (`npm login`, or `NODE_AUTH_TOKEN` set to a token with
 * publish/admin rights on these packages).
 *
 * Usage:
 *   pnpm emergency:revert -- --package wrangler@3.90.0:3.89.0 --package miniflare@4.20250709.0:4.20250708.0 --execute
 *
 * Omit `--execute` to preview the exact commands that would run without
 * doing anything (default).
 */

export const DEFAULT_PACKAGES: string[] = [
	"wrangler",
	"miniflare",
	"@cloudflare/vite-plugin",
	"@cloudflare/vitest-pool-workers",
	"create-cloudflare",
];

export interface PackageRevertSpec {
	name: string;
	badVersion: string;
	goodVersion: string;
}

export interface RevertOptions {
	dryRun: boolean;
	tag: string;
	deprecateMessage?: string;
}

export function defaultDeprecateMessage(goodVersion: string): string {
	return `This version was published as part of a broken release and has been deprecated. Please upgrade to ${goodVersion} or later.`;
}

/**
 * Parses "name@badVersion:goodVersion", including scoped package names
 * (e.g. "@cloudflare/vite-plugin@1.4.0:1.3.2").
 */
export function parsePackageArg(arg: string): PackageRevertSpec {
	const match = /^(@?[^@]+(?:\/[^@]+)?)@([^:]+):(.+)$/.exec(arg);
	if (!match) {
		throw new Error(
			`Invalid --package value "${arg}". Expected format: name@badVersion:goodVersion`
		);
	}
	const [, name, badVersion, goodVersion] = match;
	validateSemver(badVersion, `--package ${arg} (bad version)`);
	validateSemver(goodVersion, `--package ${arg} (good version)`);
	return { name, badVersion, goodVersion };
}

export function validateSemver(version: string, context: string): void {
	if (valid(version) === null) {
		throw new Error(`Invalid semver version "${version}" for ${context}`);
	}
}

export function buildDistTagCommand(
	pkgName: string,
	version: string,
	tag: string
): string[] {
	return ["dist-tag", "add", `${pkgName}@${version}`, tag];
}

export function buildDeprecateCommand(
	pkgName: string,
	version: string,
	message: string
): string[] {
	return ["deprecate", `${pkgName}@${version}`, message];
}

export function runNpmCommand(args: string[]): SpawnSyncReturns<Buffer> {
	return spawnSync("npm", args, { env: process.env });
}

export function verifyVersionExists(pkgName: string, version: string): boolean {
	const result = runNpmCommand(["view", `${pkgName}@${version}`, "version"]);
	return result.status === 0 && result.stdout.toString().trim().length > 0;
}

export function verifyNpmAuth(): boolean {
	const result = runNpmCommand(["whoami"]);
	return result.status === 0;
}

export function revertPackage(
	spec: PackageRevertSpec,
	options: RevertOptions
): string | undefined {
	const message =
		options.deprecateMessage ?? defaultDeprecateMessage(spec.goodVersion);
	const distTagArgs = buildDistTagCommand(
		spec.name,
		spec.goodVersion,
		options.tag
	);
	const deprecateArgs = buildDeprecateCommand(
		spec.name,
		spec.badVersion,
		message
	);

	if (options.dryRun) {
		console.log(`[${spec.name}] Would run: npm ${distTagArgs.join(" ")}`);
		console.log(`[${spec.name}] Would run: npm ${deprecateArgs.join(" ")}`);
		return undefined;
	}

	console.log(`[${spec.name}] Running: npm ${distTagArgs.join(" ")}`);
	const distTagResult = runNpmCommand(distTagArgs);
	if (distTagResult.status !== 0) {
		return `[${spec.name}] Failed to move "${options.tag}" tag to ${spec.goodVersion}`;
	}

	console.log(`[${spec.name}] Running: npm ${deprecateArgs.join(" ")}`);
	const deprecateResult = runNpmCommand(deprecateArgs);
	if (deprecateResult.status !== 0) {
		return `[${spec.name}] Failed to deprecate ${spec.badVersion}`;
	}

	return undefined;
}

export function revertRelease(
	specs: PackageRevertSpec[],
	options: RevertOptions
): void {
	if (specs.length === 0) {
		console.error("Error: at least one --package must be given.");
		process.exit(1);
		return;
	}

	console.log("Verifying all versions exist on the registry...");
	const preflightFailures: string[] = [];
	for (const spec of specs) {
		if (!verifyVersionExists(spec.name, spec.badVersion)) {
			preflightFailures.push(
				`${spec.name}@${spec.badVersion} not found on npm`
			);
		}
		if (!verifyVersionExists(spec.name, spec.goodVersion)) {
			preflightFailures.push(
				`${spec.name}@${spec.goodVersion} not found on npm`
			);
		}
	}
	if (preflightFailures.length > 0) {
		console.error("Error: one or more versions could not be verified:");
		for (const failure of preflightFailures) {
			console.error(`  - ${failure}`);
		}
		console.error("Nothing was changed.");
		process.exit(1);
		return;
	}

	console.log("All versions verified.");

	if (options.dryRun) {
		console.log("\nDry run (pass --execute to actually run these commands):\n");
		for (const spec of specs) {
			revertPackage(spec, options);
		}
		return;
	}

	if (!verifyNpmAuth()) {
		console.error(
			"Error: not logged in to npm. Run `npm login` before using --execute."
		);
		process.exit(1);
		return;
	}

	const failures: string[] = [];
	for (const spec of specs) {
		const failure = revertPackage(spec, options);
		if (failure) {
			failures.push(failure);
		}
	}

	if (failures.length > 0) {
		console.error("\nSome packages failed to revert:");
		for (const failure of failures) {
			console.error(`  - ${failure}`);
		}
		process.exit(1);
		return;
	}

	console.log("\nDone.");
}

function printUsage(): void {
	console.log(`
Usage:
  pnpm emergency:revert -- --package <name>@<badVersion>:<goodVersion> [--package ...] [--execute] [--tag <tag>] [--message "<text>"] [--allow-package <name>]

Example:
  pnpm emergency:revert -- --package wrangler@3.90.0:3.89.0 --package miniflare@4.20250709.0:4.20250708.0 --execute

Known coordinated packages: ${DEFAULT_PACKAGES.join(", ")}
Use --allow-package to revert a package outside this list.

Omit --execute to preview the commands that would run without changing anything (default).
`);
}

export function parseCliArgs(argv: string[]): {
	specs: PackageRevertSpec[];
	dryRun: boolean;
	tag: string;
	deprecateMessage?: string;
} {
	const allowedPackages = new Set(DEFAULT_PACKAGES);
	const specs: PackageRevertSpec[] = [];
	let dryRun = true;
	let tag = "latest";
	let deprecateMessage: string | undefined;

	// --allow-package can appear anywhere in argv relative to --package, so
	// collect it in a first pass before validating package names.
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--allow-package") {
			allowedPackages.add(argv[++i]);
		}
	}

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "-h" || arg === "--help") {
			printUsage();
			process.exit(0);
		} else if (arg === "--package") {
			const value = argv[i + 1];
			if (!value) {
				console.error("Error: missing value for \"--package\".");
				process.exit(1);
			}
			i++;
			const spec = parsePackageArg(value);
			if (!allowedPackages.has(spec.name)) {
				console.error(
					`Error: "${spec.name}" is not a known coordinated package; pass --allow-package ${spec.name} if this is intentional.`
				);
				process.exit(1);
				continue;
			}
			specs.push(spec);
		} else if (arg === "--execute") {
			dryRun = false;
		} else if (arg === "--tag") {
			const value = argv[i + 1];
			if (!value) {
				console.error("Error: missing value for \"--tag\".");
				process.exit(1);
			}
			tag = value;
			i++;
		} else if (arg === "--message") {
			const value = argv[i + 1];
			if (!value) {
				console.error("Error: missing value for \"--message\".");
				process.exit(1);
			}
			deprecateMessage = value;
			i++;
		} else if (arg === "--allow-package") {
			i++; // already handled above
		}
	}

	if (specs.length === 0) {
		console.error("Error: at least one --package must be given.\n");
		printUsage();
		process.exit(1);
	}

	return { specs, dryRun, tag, deprecateMessage };
}

if (require.main === module) {
	const { specs, dryRun, tag, deprecateMessage } = parseCliArgs(
		process.argv.slice(2)
	);
	revertRelease(specs, { dryRun, tag, deprecateMessage });
}
