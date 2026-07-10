import { execSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

/**
 * Reads packages/.../package.json to build a dependants graph for all
 * non-private packages. For each package, lists which other non-private
 * packages depend on it (via workspace: references in dependencies or
 * peerDependencies).
 */
export function buildDependantsGraph(
	packagesDir: string = path.resolve(__dirname, "../../packages")
): Record<string, string[]> {
	const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => path.resolve(packagesDir, d.name));

	// Collect all non-private packages
	const packages: { name: string; deps: string[] }[] = [];
	const knownNames = new Set<string>();

	for (const dir of packageDirs) {
		let pkg: {
			name?: string;
			private?: boolean;
			dependencies?: Record<string, string>;
			peerDependencies?: Record<string, string>;
		};
		try {
			pkg = JSON.parse(
				readFileSync(path.resolve(dir, "package.json"), "utf-8")
			);
		} catch {
			continue;
		}
		if (pkg.private || !pkg.name) {
			continue;
		}
		knownNames.add(pkg.name);

		const allDeps = {
			...pkg.dependencies,
			...pkg.peerDependencies,
		};
		const workspaceDeps = Object.entries(allDeps)
			.filter(([, v]) => v.startsWith("workspace:"))
			.map(([k]) => k);

		packages.push({ name: pkg.name, deps: workspaceDeps });
	}

	// Build the dependants graph: for each package, which known packages depend on it
	const dependants: Record<string, string[]> = {};
	for (const name of knownNames) {
		dependants[name] = [];
	}
	for (const { name, deps } of packages) {
		for (const dep of deps) {
			if (dep in dependants) {
				dependants[dep].push(name);
			}
		}
	}

	return dependants;
}

export interface PackageSpec {
	name: string;
	version: string;
	rollbackVersion?: string;
}

export interface ResolvedPackage {
	name: string;
	badVersion: string;
	goodVersion: string;
}

interface NpmRegistryResponse {
	"dist-tags": Record<string, string>;
	time: Record<string, string>;
	versions: Record<string, { deprecated?: string }>;
}

/**
 * Given a list of package names the user wants to deprecate,
 * returns any dependants from the graph that are missing.
 */
export function getRequiredDependants(
	packageNames: string[],
	graph: Record<string, string[]>
): string[] {
	const knownPackages = Object.keys(graph);
	const provided = new Set(packageNames);
	const missing: string[] = [];

	for (const name of packageNames) {
		if (!(name in graph)) {
			throw new Error(
				`"${name}" is not a known package. Known packages:\n  ${knownPackages.join(", ")}`
			);
		}
		for (const dep of graph[name]) {
			if (!provided.has(dep) && !missing.includes(dep)) {
				missing.push(dep);
			}
		}
	}

	return missing;
}

/**
 * Fetches package metadata from the npm registry.
 */
export async function fetchRegistryInfo(
	name: string
): Promise<NpmRegistryResponse> {
	const url = `https://registry.npmjs.org/${name}`;
	const res = await fetch(url, {
		headers: { Accept: "application/json" },
	});
	if (!res.ok) {
		throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
	}
	return (await res.json()) as NpmRegistryResponse;
}

/**
 * Resolves a package spec (which may use "latest" as the version) to
 * concrete bad and good (rollback) versions using the npm registry.
 */
export async function resolveVersion(
	spec: PackageSpec,
	registryInfo: NpmRegistryResponse
): Promise<ResolvedPackage> {
	const { name } = spec;
	let badVersion = spec.version;

	if (badVersion === "latest") {
		const latest = registryInfo["dist-tags"]?.latest;
		if (!latest) {
			throw new Error(`No "latest" dist-tag found for ${name}`);
		}
		badVersion = latest;
	}

	const { time } = registryInfo;
	if (!time[badVersion]) {
		throw new Error(`Version ${badVersion} not found on npm for ${name}`);
	}

	let goodVersion: string;

	if (spec.rollbackVersion) {
		if (!time[spec.rollbackVersion]) {
			throw new Error(
				`Rollback version ${spec.rollbackVersion} not found on npm for ${name}`
			);
		}
		goodVersion = spec.rollbackVersion;
	} else {
		// Sort versions by publish time to find the one immediately before the bad version.
		// Exclude "created" and "modified" metadata keys.
		const versions = Object.entries(time)
			.filter(([v]) => v !== "created" && v !== "modified")
			.sort(([, a], [, b]) => new Date(a).getTime() - new Date(b).getTime());

		const badIndex = versions.findIndex(([v]) => v === badVersion);
		if (badIndex <= 0) {
			throw new Error(
				`No previous version found for ${name}@${badVersion} to roll back to`
			);
		}
		goodVersion = versions[badIndex - 1][0];
	}

	const versionInfo = registryInfo.versions[goodVersion];
	if (versionInfo?.deprecated) {
		throw new Error(
			`Rollback version ${name}@${goodVersion} is already deprecated: "${versionInfo.deprecated}"`
		);
	}

	return { name, badVersion, goodVersion };
}

export interface NpmCommand {
	args: string[];
	display: string;
}

/**
 * Builds the list of npm commands to execute.
 * dist-tag commands come first (to stop users getting the bad version),
 * then deprecation commands.
 */
export function buildCommands(
	resolved: ResolvedPackage[],
	reason: string
): NpmCommand[] {
	const commands: NpmCommand[] = [];

	for (const { name, goodVersion } of resolved) {
		commands.push({
			args: ["dist-tag", "add", `${name}@${goodVersion}`, "latest"],
			display: `npm dist-tag add ${name}@${goodVersion} latest`,
		});
	}

	for (const { name, badVersion, goodVersion } of resolved) {
		const message = `${reason}. Downgrade to ${goodVersion}`;
		commands.push({
			args: ["deprecate", `${name}@${badVersion}`, message],
			display: `npm deprecate ${name}@${badVersion} "${message}"`,
		});
	}

	return commands;
}

/**
 * Executes a list of npm commands sequentially via spawnSync.
 * Aborts on the first failure.
 */
export function executeCommands(commands: NpmCommand[]): void {
	for (const { args, display } of commands) {
		console.log(`  $ ${display}`);
		const result = spawnSync("npm", args, { stdio: "inherit" });
		if (result.status !== 0) {
			throw new Error(`Command failed: npm ${args.join(" ")}`);
		}
	}
}

/**
 * Runs `npm login` interactively so the user can authenticate.
 */
export function npmLogin(): void {
	console.log("Opening npm login...\n");
	const result = spawnSync("npm", ["login"], { stdio: "inherit" });
	if (result.status !== 0) {
		throw new Error("npm login failed");
	}
	console.log();
}

/**
 * Checks whether the user is logged in to npm.
 * Returns the username, or null if not logged in.
 */
export function checkNpmLogin(): string | null {
	try {
		return execSync("npm whoami", { encoding: "utf-8" }).trim();
	} catch {
		return null;
	}
}

/**
 * Prompts the user for y/n confirmation.
 */
export async function confirm(message: string): Promise<boolean> {
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		rl.question(`${message} (y/n) `, (answer) => {
			rl.close();
			resolve(answer.trim().toLowerCase() === "y");
		});
	});
}

/**
 * Parses CLI arguments.
 */
export function parseArgs(argv: string[]): {
	packages: PackageSpec[];
	reason: string;
	dryRun: boolean;
} {
	const packages: PackageSpec[] = [];
	let reason = "";
	let dryRun = false;

	let i = 0;
	while (i < argv.length) {
		const arg = argv[i];
		if (arg === "--reason") {
			i++;
			if (i >= argv.length) {
				throw new Error("--reason requires a value");
			}
			reason = argv[i];
		} else if (arg === "--dry-run") {
			dryRun = true;
		} else if (arg.startsWith("--")) {
			throw new Error(`Unknown flag: ${arg}`);
		} else {
			const atIndex = arg.lastIndexOf("@");
			if (atIndex <= 0) {
				throw new Error(
					`Invalid package specifier: "${arg}". Expected format: <package>@<version>[>rollback-version]`
				);
			}
			const name = arg.slice(0, atIndex);
			const versionPart = arg.slice(atIndex + 1);
			if (!versionPart) {
				throw new Error(
					`Invalid package specifier: "${arg}". Expected format: <package>@<version>[>rollback-version]`
				);
			}
			const arrowIndex = versionPart.indexOf(">");
			if (arrowIndex !== -1) {
				const version = versionPart.slice(0, arrowIndex);
				const rollbackVersion = versionPart.slice(arrowIndex + 1);
				if (!version || !rollbackVersion) {
					throw new Error(
						`Invalid package specifier: "${arg}". Expected format: <package>@<version>><rollback-version>`
					);
				}
				packages.push({ name, version, rollbackVersion });
			} else {
				packages.push({ name, version: versionPart });
			}
		}
		i++;
	}

	if (packages.length === 0) {
		throw new Error(
			'No packages specified.\n\nUsage: pnpm deprecate-packages --reason "..." <package>@<version>[>rollback] [...]'
		);
	}

	if (!reason) {
		throw new Error("--reason is required");
	}

	return { packages, reason, dryRun };
}

const HELP = `
Deprecate and roll back bad npm releases for workers-sdk packages.

Usage:
  pnpm deprecate-packages --reason "..." <pkg>@<version> [<pkg>@<version> ...]

Version can be "latest" to resolve the current latest tag on npm.
Append ">version" to override the rollback target (default: previous version).

Options:
  --reason "..."   Required. Deprecation message shown to users.
  --dry-run        Print what would happen without executing or logging in.
  --help           Show this help.

Examples:
  pnpm deprecate-packages --reason "Deploy regression" \\
    wrangler@latest \\
    @cloudflare/vite-plugin@latest \\
    @cloudflare/vitest-pool-workers@latest

  pnpm deprecate-packages --reason "Broken scheduled handlers" \\
    miniflare@4.20260706.0 \\
    wrangler@4.108.0>4.106.0 \\
    @cloudflare/vite-plugin@1.43.2 \\
    @cloudflare/vitest-pool-workers@0.18.2

Dependency rules are derived from local package.json files and enforced automatically.
For example, deprecating wrangler also requires deprecating @cloudflare/vite-plugin
and @cloudflare/vitest-pool-workers because they depend on it.
`.trim();

export async function main(argv: string[] = process.argv.slice(2)) {
	if (argv.includes("--help") || argv.includes("-h")) {
		console.log(HELP);
		return;
	}

	const { packages, reason, dryRun } = parseArgs(argv);

	const graph = buildDependantsGraph();
	const knownPackages = Object.keys(graph);

	// Validate all packages are known
	for (const { name } of packages) {
		if (!(name in graph)) {
			console.error(
				`Error: "${name}" is not a known package. Known packages:\n  ${knownPackages.join(", ")}`
			);
			process.exit(1);
		}
	}

	// Validate the dependency graph is satisfied
	const packageNames = packages.map((p) => p.name);
	const missing = getRequiredDependants(packageNames, graph);
	if (missing.length > 0) {
		const sources = packageNames
			.filter((name) => graph[name].some((d) => missing.includes(d)))
			.join(", ");
		console.error(
			`Error: Deprecating ${sources} requires also deprecating:\n  ${missing.map((m) => `- ${m}`).join("\n  ")}\n\nRe-run with versions for all affected packages.`
		);
		process.exit(1);
	}

	if (!dryRun) {
		// npm login
		const existingUser = checkNpmLogin();
		if (existingUser) {
			console.log(`Already logged in to npm as ${existingUser}\n`);
		} else {
			npmLogin();
		}
	}

	// Resolve versions from npm registry
	console.log("Resolving versions...");
	const resolved: ResolvedPackage[] = [];
	for (const spec of packages) {
		const info = await fetchRegistryInfo(spec.name);
		const result = await resolveVersion(spec, info);
		if (spec.version === "latest") {
			console.log(`  ${spec.name}@latest → ${spec.name}@${result.badVersion}`);
		}
		resolved.push(result);
	}

	// Display summary table
	const nameWidth = Math.max(
		...resolved.map((r) => r.name.length),
		"Package".length
	);
	const badWidth = Math.max(
		...resolved.map((r) => r.badVersion.length),
		"Deprecate".length
	);
	const goodWidth = Math.max(
		...resolved.map((r) => r.goodVersion.length),
		"Rollback To".length
	);

	console.log();
	console.log(
		`  ${"Package".padEnd(nameWidth)}  ${"Deprecate".padEnd(badWidth)}  ${"Rollback To".padEnd(goodWidth)}`
	);
	for (const { name, badVersion, goodVersion } of resolved) {
		console.log(
			`  ${name.padEnd(nameWidth)}  ${badVersion.padEnd(badWidth)}  ${goodVersion.padEnd(goodWidth)}`
		);
	}

	// Build and display commands
	const commands = buildCommands(resolved, reason);

	console.log("\nCommands to execute:");
	for (let i = 0; i < commands.length; i++) {
		console.log(`  ${i + 1}. ${commands[i].display}`);
	}

	if (dryRun) {
		console.log("\n--dry-run specified, not executing.");
		return;
	}

	// Confirm and execute
	console.log();
	const proceed = await confirm("Proceed?");
	if (!proceed) {
		console.log("Aborted.");
		return;
	}

	console.log("\nExecuting...\n");
	executeCommands(commands);
	console.log("\nDone.");
}

if (require.main === module) {
	main().catch((err) => {
		console.error(`Error: ${err.message}`);
		process.exit(1);
	});
}
