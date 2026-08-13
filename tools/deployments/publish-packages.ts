/* eslint-disable turbo/no-undeclared-env-vars -- this script reads CI environment variables */
import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Publishes the monorepo's npm packages in dependency-tier order, waiting for
 * each tier to become resolvable on the registry before publishing the next.
 *
 * This replaces `changeset publish` as the `publish:` command for the
 * `changesets/action` step in `.github/workflows/changesets.yml`.
 *
 * ## Why
 *
 * Sibling dependencies between our packages are declared with the `workspace:`
 * protocol, which pnpm rewrites to an *exact* version at publish time. So a
 * published `wrangler` depends on precisely the `miniflare` built from the same
 * commit. `changeset publish` publishes every package concurrently, so
 * `wrangler` can land on the registry before the `miniflare` version it pins is
 * resolvable — and an install in that window fails with `ETARGET`.
 *
 * Publishing in dependency order, and refusing to start a tier until the
 * previous tier resolves, closes that window.
 *
 * ## Tagging
 *
 * Publishing here is deliberately split from tagging. Once every tier has been
 * published we hand off to `changeset tag`, which creates the git tags and — via
 * its `New tag: <name>@<version>` output — feeds the `publishedPackages` output
 * of `changesets/action`. That output drives the GitHub releases and the
 * downstream non-npm deployments, so its format must not change.
 */

/** The registry we publish to, and check for propagation against. */
export const DEFAULT_REGISTRY = "https://registry.npmjs.org";

/**
 * `npm install` resolves versions from the *abbreviated* packument, which is a
 * separate cached document from the full packument. Propagation checks have to
 * look at the same document real installs use, or they prove nothing.
 */
const ABBREVIATED_PACKUMENT_ACCEPT = "application/vnd.npm.install-v1+json";

/** Dependency fields that a consumer of a published package will install. */
const RUNTIME_DEPENDENCY_FIELDS = [
	"dependencies",
	"peerDependencies",
	"optionalDependencies",
] as const;

export type PackageJSON = {
	name?: string;
	version?: string;
	private?: boolean;
	publishConfig?: { access?: string };
} & Partial<
	Record<(typeof RUNTIME_DEPENDENCY_FIELDS)[number], Record<string, string>>
>;

export type WorkspacePackage = {
	name: string;
	version: string;
	/** Absolute path to the package directory. */
	dir: string;
	/** The `--access` value to publish with. */
	access: string;
	/** Names of other publishable workspace packages this one pins at runtime. */
	workspaceDependencies: string[];
};

export type PublishResult = {
	name: string;
	version: string;
	/** Combined stdout/stderr, surfaced only when the publish failed. */
	output: string;
	error?: string;
};

/**
 * Reads every publishable package in the monorepo.
 *
 * All publishable packages live in `packages/*` — `fixtures/*`, `tools` and the
 * vite-plugin playground workspaces are all private.
 */
export function findPublishablePackages(
	packagesDir: string
): WorkspacePackage[] {
	const manifests = new Map<string, { pkg: PackageJSON; dir: string }>();

	for (const entry of readdirSync(packagesDir)) {
		const dir = resolve(packagesDir, entry);
		let pkg: PackageJSON;
		try {
			pkg = JSON.parse(readFileSync(resolve(dir, "package.json"), "utf-8"));
		} catch {
			// Not a package directory.
			continue;
		}
		// Private packages are never published to npm. They are still versioned
		// and tagged, but `changeset tag` takes care of that for us.
		if (pkg.private === true) {
			continue;
		}
		if (pkg.name === undefined || pkg.version === undefined) {
			continue;
		}
		manifests.set(pkg.name, { pkg, dir });
	}

	const packages: WorkspacePackage[] = [];
	for (const [name, { pkg, dir }] of manifests) {
		const workspaceDependencies = new Set<string>();
		for (const field of RUNTIME_DEPENDENCY_FIELDS) {
			for (const [dependency, range] of Object.entries(pkg[field] ?? {})) {
				// Only workspace-protocol ranges get rewritten to an exact sibling
				// version at publish time, so only those create an ordering
				// requirement. `catalog:` and literal ranges point at packages that
				// are already on the registry.
				if (manifests.has(dependency) && range.startsWith("workspace:")) {
					workspaceDependencies.add(dependency);
				}
			}
		}
		packages.push({
			name,
			version: pkg.version ?? "",
			dir,
			access: pkg.publishConfig?.access ?? "public",
			workspaceDependencies: [...workspaceDependencies].sort(),
		});
	}

	return packages.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Groups packages into tiers such that every package sits in a later tier than
 * all of its runtime workspace dependencies.
 *
 * `devDependencies` are deliberately excluded. They are published in the
 * manifest but never installed by consumers, so a stale dev dependency pin is
 * harmless — and including them would create cycles, because packages like
 * `wrangler` dev-depend on their own dependents.
 */
export function computeTiers(
	packages: WorkspacePackage[]
): WorkspacePackage[][] {
	const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
	const depths = new Map<string, number>();
	const visiting = new Set<string>();

	function depthOf(name: string, path: string[]): number {
		const cached = depths.get(name);
		if (cached !== undefined) {
			return cached;
		}
		if (visiting.has(name)) {
			throw new Error(
				`Dependency cycle detected between publishable packages: ${[
					...path,
					name,
				].join(" -> ")}`
			);
		}
		visiting.add(name);

		let depth = 0;
		const pkg = byName.get(name);
		for (const dependency of pkg?.workspaceDependencies ?? []) {
			// A name we do not have a manifest for imposes no ordering. Skipping it
			// keeps unrelated packages in tier 0 rather than pushing them behind a
			// phantom tier.
			if (!byName.has(dependency)) {
				continue;
			}
			depth = Math.max(depth, depthOf(dependency, [...path, name]) + 1);
		}

		visiting.delete(name);
		depths.set(name, depth);
		return depth;
	}

	for (const pkg of packages) {
		depthOf(pkg.name, []);
	}

	const tiers: WorkspacePackage[][] = [];
	for (const pkg of packages) {
		const depth = depths.get(pkg.name) ?? 0;
		while (tiers.length <= depth) {
			tiers.push([]);
		}
		const tier = tiers[depth];
		if (tier !== undefined) {
			tier.push(pkg);
		}
	}

	return tiers;
}

/**
 * Escapes a package name for use in a registry URL path, the way npm does it —
 * the leading `@` of a scope is left alone and only the separator is encoded.
 */
export function escapePackageName(name: string): string {
	return name.replace("/", "%2f");
}

type AbbreviatedPackument = {
	versions?: Record<string, { dist?: { tarball?: string } }>;
};

export type FetchLike = (
	url: string,
	init?: { method?: string; headers?: Record<string, string> }
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * Fetches the abbreviated packument, returning `null` when the package is not
 * on the registry at all.
 */
export async function fetchPackument(
	registry: string,
	name: string,
	fetchImpl: FetchLike
): Promise<AbbreviatedPackument | null> {
	const base = registry.replace(/\/+$/, "");
	const response = await fetchImpl(`${base}/${escapePackageName(name)}`, {
		headers: { accept: ABBREVIATED_PACKUMENT_ACCEPT },
	});
	if (response.status === 404) {
		return null;
	}
	if (!response.ok) {
		throw new Error(
			`Failed to fetch packument for "${name}": HTTP ${response.status}`
		);
	}
	return (await response.json()) as AbbreviatedPackument;
}

export type ReadRetryOptions = {
	/** Total attempts, including the first. */
	attempts: number;
	/** Delay before the second attempt. Doubles on each subsequent retry. */
	delaySeconds: number;
	sleep: (ms: number) => Promise<void>;
	log: (message: string) => void;
};

/**
 * Reads a packument, retrying transient failures.
 *
 * A package that is simply absent is not a failure: `fetchPackument` resolves
 * to `null` for a 404, which legitimately means "not published yet". Only
 * thrown errors — 5xx from the registry CDN, malformed JSON, network failures —
 * are retried.
 */
async function fetchPackumentWithRetry(
	registry: string,
	name: string,
	fetchImpl: FetchLike,
	retry: ReadRetryOptions
): Promise<AbbreviatedPackument | null> {
	let delay = retry.delaySeconds * 1000;

	for (let attempt = 1; ; attempt++) {
		try {
			return await fetchPackument(registry, name, fetchImpl);
		} catch (e) {
			if (attempt >= retry.attempts) {
				throw e;
			}
			retry.log(
				`  ${name}: registry read failed (attempt ${attempt}/${
					retry.attempts
				}), retrying in ${Math.round(delay / 1000)}s (${String(e)})`
			);
			await retry.sleep(delay);
			delay *= 2;
		}
	}
}

/**
 * Narrows a list of packages down to those whose exact version is not yet on
 * the registry.
 *
 * This mirrors how `changeset publish` decides what to publish, and is what
 * makes re-running a failed release safe.
 *
 * Reads are retried, because this runs once per tier *during* the release: a
 * single transient failure while checking a later tier would otherwise abort a
 * run that has already published earlier tiers, leaving those packages
 * untagged and undeployed.
 */
export async function filterUnpublished(
	packages: WorkspacePackage[],
	registry: string,
	fetchImpl: FetchLike,
	retry: ReadRetryOptions
): Promise<WorkspacePackage[]> {
	const unpublished: WorkspacePackage[] = [];
	for (const pkg of packages) {
		const packument = await fetchPackumentWithRetry(
			registry,
			pkg.name,
			fetchImpl,
			retry
		);
		if (packument?.versions?.[pkg.version] === undefined) {
			unpublished.push(pkg);
		}
	}
	return unpublished;
}

export type PropagationOptions = {
	registry: string;
	fetchImpl: FetchLike;
	/**
	 * How long to wait after every version reads back OK, before allowing the
	 * next tier to start.
	 *
	 * This is deliberately an unconditional wait rather than a floor on the total
	 * gate duration. A successful read only proves *this* runner's CDN edge is up
	 * to date; other edges can only start serving a version once it is retrievable
	 * from the origin, and our first successful read is the best proxy we have for
	 * when that happened. Measuring from the start of the gate instead would mean
	 * that a version which took most of the budget to appear got almost no settle
	 * time — exactly the case where other edges are most likely to still be stale.
	 */
	minSeconds: number;
	/** Give up (and fail the release) after this long. */
	timeoutSeconds: number;
	pollSeconds: number;
	sleep: (ms: number) => Promise<void>;
	now: () => number;
	log: (message: string) => void;
};

/** The minimum shape needed to check whether a published version has landed. */
export type PublishedVersion = { name: string; version: string };

/**
 * Blocks until every given package version is resolvable and its tarball is
 * available, or throws once `timeoutSeconds` has elapsed.
 */
export async function waitForPropagation(
	packages: readonly PublishedVersion[],
	options: PropagationOptions
): Promise<void> {
	if (packages.length === 0) {
		return;
	}

	const start = options.now();
	const deadline = start + options.timeoutSeconds * 1000;
	const pending = new Map(packages.map((pkg) => [pkg.name, pkg.version]));

	options.log(
		`Waiting for ${pending.size} package version(s) to become resolvable...`
	);

	while (pending.size > 0) {
		for (const [name, version] of [...pending]) {
			let resolvable = false;
			try {
				const packument = await fetchPackument(
					options.registry,
					name,
					options.fetchImpl
				);
				const tarball = packument?.versions?.[version]?.dist?.tarball;
				if (tarball !== undefined) {
					// A resolvable version whose tarball has not landed yet still
					// breaks installs, so check both.
					const head = await options.fetchImpl(tarball, { method: "HEAD" });
					resolvable = head.ok;
				}
			} catch (e) {
				options.log(
					`  ${name}@${version}: check failed, will retry (${String(e)})`
				);
			}
			if (resolvable) {
				options.log(`  ${name}@${version}: resolvable`);
				pending.delete(name);
			}
		}

		if (pending.size > 0) {
			if (options.now() >= deadline) {
				const stuck = [...pending]
					.map(([name, version]) => `${name}@${version}`)
					.join(", ");
				throw new Error(
					`Timed out after ${options.timeoutSeconds}s waiting for these versions to become resolvable on ${options.registry}: ${stuck}`
				);
			}
			await options.sleep(options.pollSeconds * 1000);
		}
	}

	if (options.minSeconds > 0) {
		const elapsed = options.now() - start;
		options.log(
			`All versions resolvable after ${Math.round(elapsed / 1000)}s; settling ` +
				`for a further ${options.minSeconds}s before the next tier.`
		);
		await options.sleep(options.minSeconds * 1000);
	}
}

export type PublishRunner = (pkg: WorkspacePackage) => Promise<PublishResult>;

/**
 * Runs `pnpm publish` for a single package.
 *
 * The flags and the `npm_config_registry` override intentionally mirror exactly
 * what `changeset publish` passes today, so that swapping the orchestrator in
 * does not change publish behaviour (notably OIDC trusted publishing, which
 * only works for `npm publish`).
 */
export function createPublishRunner(options: {
	registry: string;
	distTag: string;
}): PublishRunner {
	return function publishPackage(pkg) {
		return new Promise<PublishResult>((promiseResolve) => {
			const args = [
				"publish",
				"--json",
				"--access",
				pkg.access,
				"--tag",
				options.distTag,
				"--no-git-checks",
			];
			const child = spawn("pnpm", args, {
				cwd: pkg.dir,
				env: { ...process.env, npm_config_registry: options.registry },
			});

			let output = "";
			child.stdout?.on("data", (chunk) => {
				output += String(chunk);
			});
			child.stderr?.on("data", (chunk) => {
				output += String(chunk);
			});

			child.on("error", (error) => {
				promiseResolve({
					name: pkg.name,
					version: pkg.version,
					output,
					error: error.message,
				});
			});
			child.on("close", (code) => {
				promiseResolve({
					name: pkg.name,
					version: pkg.version,
					output,
					error:
						code === 0 ? undefined : `pnpm publish exited with code ${code}`,
				});
			});
		});
	};
}

/**
 * Publishes a batch of packages with bounded concurrency, returning results in
 * the same order as the input so logs stay deterministic.
 */
export async function publishTier(
	packages: WorkspacePackage[],
	publish: PublishRunner,
	concurrency: number
): Promise<PublishResult[]> {
	const results = new Array<PublishResult>(packages.length);
	let next = 0;

	async function worker(): Promise<void> {
		while (next < packages.length) {
			const index = next++;
			const pkg = packages[index];
			if (pkg === undefined) {
				continue;
			}
			results[index] = await publish(pkg);
		}
	}

	const workers = Array.from(
		{ length: Math.max(1, Math.min(concurrency, packages.length)) },
		() => worker()
	);
	await Promise.all(workers);

	return results.filter(
		(result): result is PublishResult => result !== undefined
	);
}

export function sleep(ms: number): Promise<void> {
	return new Promise((promiseResolve) => setTimeout(promiseResolve, ms));
}

function readIntEnv(name: string, fallback: number): number {
	const raw = process.env[name];
	if (raw === undefined || raw.trim() === "") {
		return fallback;
	}
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new Error(
			`Expected ${name} to be a non-negative integer, got "${raw}"`
		);
	}
	return parsed;
}

export type MainOptions = {
	packagesDir: string;
	dryRun: boolean;
	registry: string;
	distTag: string;
	concurrency: number;
	propagation: Omit<
		PropagationOptions,
		"registry" | "fetchImpl" | "sleep" | "now" | "log"
	> & { skip: boolean };
	readRetry: Omit<ReadRetryOptions, "sleep" | "log">;
	fetchImpl: FetchLike;
	publish: PublishRunner;
	runChangesetTag: () => Promise<number>;
	sleep: (ms: number) => Promise<void>;
	now: () => number;
	log: (message: string) => void;
};

export async function publishAllPackages(options: MainOptions): Promise<void> {
	const packages = findPublishablePackages(options.packagesDir);
	const tiers = computeTiers(packages);

	options.log(
		`Found ${packages.length} publishable package(s) across ${tiers.length} dependency tier(s).`
	);

	if (options.dryRun) {
		tiers.forEach((tier, index) => {
			options.log(`\nTier ${index}:`);
			for (const pkg of tier) {
				const deps = pkg.workspaceDependencies.join(", ");
				options.log(
					`  ${pkg.name}@${pkg.version}${deps === "" ? "" : ` <- ${deps}`}`
				);
			}
		});
		options.log("\nDry run: nothing was published.");
		return;
	}

	let publishedAny = false;

	for (const [index, tier] of tiers.entries()) {
		const pending = await filterUnpublished(
			tier,
			options.registry,
			options.fetchImpl,
			{
				attempts: options.readRetry.attempts,
				delaySeconds: options.readRetry.delaySeconds,
				sleep: options.sleep,
				log: options.log,
			}
		);

		if (pending.length === 0) {
			options.log(`\nTier ${index}: nothing to publish.`);
			continue;
		}

		options.log(
			`\nTier ${index}: publishing ${pending
				.map((pkg) => `${pkg.name}@${pkg.version}`)
				.join(", ")}`
		);

		const results = await publishTier(
			pending,
			options.publish,
			options.concurrency
		);
		const failures = results.filter((result) => result.error !== undefined);

		for (const result of results) {
			if (result.error === undefined) {
				options.log(`  published ${result.name}@${result.version}`);
			}
		}

		if (failures.length > 0) {
			for (const failure of failures) {
				options.log(
					`::error::Failed to publish ${failure.name}@${failure.version}: ${failure.error}`
				);
				options.log(failure.output);
			}
			// Abort without tagging. Nothing gets a git tag or a GitHub release, and
			// `publishedPackages` stays empty, so the alert step fires and a re-run
			// picks up exactly the packages that are still missing.
			throw new Error(
				`${failures.length} package(s) failed to publish in tier ${index}. No tags were created; re-run this job to retry.`
			);
		}

		publishedAny = true;

		const isLastTier = index === tiers.length - 1;
		if (isLastTier) {
			continue;
		}
		if (options.propagation.skip) {
			options.log("Skipping propagation wait.");
			continue;
		}
		await waitForPropagation(pending, {
			registry: options.registry,
			fetchImpl: options.fetchImpl,
			minSeconds: options.propagation.minSeconds,
			timeoutSeconds: options.propagation.timeoutSeconds,
			pollSeconds: options.propagation.pollSeconds,
			sleep: options.sleep,
			now: options.now,
			log: options.log,
		});
	}

	if (!publishedAny) {
		options.log("\nNo unpublished packages found.");
	}

	// `changeset tag` creates the git tags and prints the `New tag:` lines that
	// `changesets/action` parses into its `publishedPackages` output. It also
	// covers private packages, which is how the non-npm deployment step learns
	// what changed.
	options.log("\nCreating git tags via `changeset tag`...");
	const tagExitCode = await options.runChangesetTag();
	if (tagExitCode !== 0) {
		throw new Error(`\`changeset tag\` exited with code ${tagExitCode}`);
	}
}

function runChangesetTag(): Promise<number> {
	return new Promise((promiseResolve) => {
		const child = spawn("pnpm", ["exec", "changeset", "tag"], {
			stdio: "inherit",
		});
		child.on("error", () => promiseResolve(1));
		child.on("close", (code) => promiseResolve(code ?? 1));
	});
}

if (require.main === module) {
	const registry =
		process.env.PUBLISH_REGISTRY ??
		process.env.npm_config_registry ??
		DEFAULT_REGISTRY;
	const distTag = process.env.PUBLISH_DIST_TAG ?? "latest";
	const log = (message: string) => console.log(message);

	void publishAllPackages({
		packagesDir: resolve(__dirname, "../../packages"),
		dryRun: process.argv.includes("--dry-run"),
		registry,
		distTag,
		concurrency: readIntEnv("PUBLISH_CONCURRENCY", 4),
		propagation: {
			skip: process.env.PUBLISH_SKIP_PROPAGATION_WAIT === "true",
			minSeconds: readIntEnv("PUBLISH_PROPAGATION_MIN_SECONDS", 60),
			timeoutSeconds: readIntEnv("PUBLISH_PROPAGATION_TIMEOUT_SECONDS", 600),
			pollSeconds: readIntEnv("PUBLISH_PROPAGATION_POLL_SECONDS", 5),
		},
		readRetry: {
			attempts: Math.max(1, readIntEnv("PUBLISH_READ_RETRY_ATTEMPTS", 3)),
			delaySeconds: readIntEnv("PUBLISH_READ_RETRY_DELAY_SECONDS", 2),
		},
		fetchImpl: fetch,
		publish: createPublishRunner({ registry, distTag }),
		runChangesetTag,
		sleep,
		now: () => Date.now(),
		log,
	}).catch((e) => {
		console.error(`::error::${e instanceof Error ? e.message : String(e)}`);
		process.exit(1);
	});
}
