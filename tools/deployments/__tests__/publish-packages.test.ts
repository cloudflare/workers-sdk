import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
	computeTiers,
	escapePackageName,
	filterUnpublished,
	findPublishablePackages,
	publishAllPackages,
	publishTier,
	waitForPropagation,
} from "../publish-packages";
import type {
	FetchLike,
	MainOptions,
	PublishResult,
	ReadRetryOptions,
	WorkspacePackage,
} from "../publish-packages";

const REGISTRY = "https://registry.example.com";

function makePackage(
	name: string,
	workspaceDependencies: string[] = [],
	version = "1.0.0"
): WorkspacePackage {
	return {
		name,
		version,
		dir: join("/repo/packages", name),
		access: "public",
		workspaceDependencies,
	};
}

function tierNames(tiers: WorkspacePackage[][]): string[][] {
	return tiers.map((tier) => tier.map((pkg) => pkg.name));
}

/**
 * A stand-in for the npm registry. `published` maps a package name to the
 * versions that resolve; `missingTarballs` lets us simulate a version that is
 * listed in the packument but whose tarball has not landed yet.
 */
function createFakeRegistry(options?: {
	published?: Record<string, string[]>;
	missingTarballs?: string[];
}) {
	const published = new Map<string, Set<string>>(
		Object.entries(options?.published ?? {}).map(([name, versions]) => [
			name,
			new Set(versions),
		])
	);
	const missingTarballs = new Set(options?.missingTarballs ?? []);
	const requests: string[] = [];

	function tarballUrl(name: string, version: string) {
		return `${REGISTRY}/${name}/-/tarball-${version}.tgz`;
	}

	function publish(name: string, version: string) {
		const versions = published.get(name) ?? new Set<string>();
		versions.add(version);
		published.set(name, versions);
	}

	const fetchImpl: FetchLike = async (url, init) => {
		requests.push(`${init?.method ?? "GET"} ${url}`);

		if (url.includes("/-/tarball-")) {
			const ok = !missingTarballs.has(url);
			return { ok, status: ok ? 200 : 404, json: async () => ({}) };
		}

		const escapedName = url.slice(REGISTRY.length + 1);
		const name = decodeURIComponent(escapedName);
		const versions = published.get(name);
		if (versions === undefined) {
			return { ok: false, status: 404, json: async () => ({}) };
		}
		return {
			ok: true,
			status: 200,
			json: async () => ({
				versions: Object.fromEntries(
					[...versions].map((version) => [
						version,
						{ dist: { tarball: tarballUrl(name, version) } },
					])
				),
			}),
		};
	};

	return { fetchImpl, publish, requests, tarballUrl, missingTarballs };
}

/** A clock whose only way of advancing is an awaited `sleep`. */
function createFakeClock() {
	let current = 0;
	return {
		now: () => current,
		sleep: async (ms: number) => {
			current += ms;
		},
		advance: (ms: number) => {
			current += ms;
		},
	};
}

describe("computeTiers()", () => {
	it("should put packages with no workspace dependencies in tier 0", ({
		expect,
	}) => {
		const tiers = computeTiers([makePackage("a"), makePackage("b")]);
		expect(tierNames(tiers)).toEqual([["a", "b"]]);
	});

	it("should place a package after every dependency it pins", ({ expect }) => {
		const tiers = computeTiers([
			makePackage("app", ["lib", "core"]),
			makePackage("core"),
			makePackage("lib", ["core"]),
		]);
		expect(tierNames(tiers)).toEqual([["core"], ["lib"], ["app"]]);
	});

	it("should use the longest path so a package never precedes a transitive dependency", ({
		expect,
	}) => {
		// `app` depends directly on `core`, but also on `lib` which depends on
		// `core`. A shortest-path tiering would put `app` in tier 1 alongside
		// `lib`, which would let them publish concurrently.
		const tiers = computeTiers([
			makePackage("app", ["core", "lib"]),
			makePackage("core"),
			makePackage("lib", ["core"]),
		]);
		expect(tierNames(tiers)).toEqual([["core"], ["lib"], ["app"]]);
	});

	it("should ignore dependencies that are not publishable workspace packages", ({
		expect,
	}) => {
		const tiers = computeTiers([makePackage("a", ["not-in-workspace"])]);
		expect(tierNames(tiers)).toEqual([["a"]]);
	});

	it("should throw on a dependency cycle", ({ expect }) => {
		expect(() =>
			computeTiers([makePackage("a", ["b"]), makePackage("b", ["a"])])
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Dependency cycle detected between publishable packages: a -> b -> a]`
		);
	});

	it("should throw on a self-referencing package", ({ expect }) => {
		expect(() =>
			computeTiers([makePackage("a", ["a"])])
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Dependency cycle detected between publishable packages: a -> a]`
		);
	});
});

describe("findPublishablePackages()", () => {
	let packagesDir: string;

	beforeEach(() => {
		packagesDir = realpathSync(
			mkdtempSync(join(tmpdir(), "publish-packages-"))
		);
	});

	afterEach(() => {
		// eslint-disable-next-line workers-sdk/no-direct-recursive-rm -- test cleanup
		rmSync(packagesDir, { recursive: true, force: true });
	});

	function seed(dirName: string, contents: unknown) {
		const dir = join(packagesDir, dirName);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "package.json"), JSON.stringify(contents));
	}

	it("should skip private packages, and packages with no name or version", ({
		expect,
	}) => {
		seed("public-pkg", { name: "public-pkg", version: "1.0.0" });
		seed("private-pkg", {
			name: "private-pkg",
			version: "1.0.0",
			private: true,
		});
		seed("no-version", { name: "no-version" });
		seed("no-name", { version: "1.0.0" });
		mkdirSync(join(packagesDir, "not-a-package"), { recursive: true });

		expect(findPublishablePackages(packagesDir).map((p) => p.name)).toEqual([
			"public-pkg",
		]);
	});

	it("should only treat workspace-protocol ranges as ordering constraints", ({
		expect,
	}) => {
		seed("core", { name: "core", version: "1.0.0" });
		seed("app", {
			name: "app",
			version: "1.0.0",
			dependencies: { core: "workspace:*", external: "^1.0.0" },
			peerDependencies: { core: "workspace:^" },
			optionalDependencies: { pinned: "catalog:default" },
			// devDependencies never create an ordering requirement, because
			// consumers do not install them.
			devDependencies: { core: "workspace:*", cyclic: "workspace:*" },
		});
		seed("cyclic", {
			name: "cyclic",
			version: "1.0.0",
			dependencies: { app: "workspace:*" },
		});

		const packages = findPublishablePackages(packagesDir);
		expect(packages.map((p) => [p.name, p.workspaceDependencies])).toEqual([
			["app", ["core"]],
			["core", []],
			["cyclic", ["app"]],
		]);
	});

	it("should default access to public and respect publishConfig.access", ({
		expect,
	}) => {
		seed("a", { name: "a", version: "1.0.0" });
		seed("b", {
			name: "b",
			version: "1.0.0",
			publishConfig: { access: "restricted" },
		});

		expect(findPublishablePackages(packagesDir).map((p) => p.access)).toEqual([
			"public",
			"restricted",
		]);
	});
});

describe("the real workspace", () => {
	// This guards the invariant the whole script exists to enforce. If a new
	// runtime dependency between published packages reshuffles these tiers, that
	// shows up here in review rather than during a release.
	it("should resolve into the expected dependency tiers", ({ expect }) => {
		const packagesDir = resolve(__dirname, "../../../packages");
		const tiers = computeTiers(findPublishablePackages(packagesDir));
		expect(tierNames(tiers)).toMatchInlineSnapshot(`
			[
			  [
			    "@cloudflare/codemods",
			    "@cloudflare/config",
			    "@cloudflare/kv-asset-handler",
			    "@cloudflare/pages-functions",
			    "@cloudflare/unenv-preset",
			    "@cloudflare/workers-editor-shared",
			    "@cloudflare/workers-utils",
			    "create-cloudflare",
			    "miniflare",
			    "solarflare-theme",
			  ],
			  [
			    "@cloudflare/build-output-utils",
			    "@cloudflare/cli-shared-helpers",
			    "@cloudflare/pages-shared",
			    "@cloudflare/workers-auth",
			    "wrangler",
			  ],
			  [
			    "@cloudflare/autoconfig",
			    "@cloudflare/deploy-helpers",
			    "@cloudflare/vite-plugin",
			    "@cloudflare/vitest-plugin",
			  ],
			]
		`);
	});

	it("should publish wrangler before the packages that pin it", ({
		expect,
	}) => {
		const packagesDir = resolve(__dirname, "../../../packages");
		const tiers = computeTiers(findPublishablePackages(packagesDir));
		const tierOf = (name: string) =>
			tiers.findIndex((tier) => tier.some((pkg) => pkg.name === name));

		expect(tierOf("wrangler")).toBeGreaterThan(tierOf("miniflare"));
		expect(tierOf("@cloudflare/vite-plugin")).toBeGreaterThan(
			tierOf("wrangler")
		);
		expect(tierOf("@cloudflare/vitest-plugin")).toBeGreaterThan(
			tierOf("wrangler")
		);
	});
});

describe("escapePackageName()", () => {
	it("should encode the scope separator but leave the leading @ alone", ({
		expect,
	}) => {
		expect(escapePackageName("wrangler")).toBe("wrangler");
		expect(escapePackageName("@cloudflare/vite-plugin")).toBe(
			"@cloudflare%2fvite-plugin"
		);
	});
});

describe("filterUnpublished()", () => {
	function retryOptions(
		overrides: Partial<ReadRetryOptions> = {}
	): ReadRetryOptions {
		return {
			attempts: 3,
			delaySeconds: 2,
			sleep: async () => {},
			log: () => {},
			...overrides,
		};
	}

	it("should keep only versions that are not already on the registry", async ({
		expect,
	}) => {
		const registry = createFakeRegistry({
			published: { a: ["1.0.0"], b: ["0.9.0"] },
		});
		const packages = [
			makePackage("a", [], "1.0.0"),
			makePackage("b", [], "1.0.0"),
			makePackage("c", [], "1.0.0"),
		];

		const unpublished = await filterUnpublished(
			packages,
			REGISTRY,
			registry.fetchImpl,
			retryOptions()
		);
		expect(unpublished.map((p) => p.name)).toEqual(["b", "c"]);
	});

	it("should treat an unknown package as unpublished", async ({ expect }) => {
		const registry = createFakeRegistry();
		const unpublished = await filterUnpublished(
			[makePackage("brand-new")],
			REGISTRY,
			registry.fetchImpl,
			retryOptions()
		);
		expect(unpublished.map((p) => p.name)).toEqual(["brand-new"]);
	});

	it("should retry a transient registry failure and still classify correctly", async ({
		expect,
	}) => {
		const registry = createFakeRegistry({ published: { a: ["1.0.0"] } });
		const clock = createFakeClock();
		const logs: string[] = [];
		let calls = 0;
		const fetchImpl: FetchLike = async (url, init) => {
			calls++;
			// A 503 from the registry CDN on the first read of `a`.
			if (calls === 1) {
				return { ok: false, status: 503, json: async () => ({}) };
			}
			return registry.fetchImpl(url, init);
		};

		const unpublished = await filterUnpublished(
			[makePackage("a", [], "1.0.0"), makePackage("b", [], "1.0.0")],
			REGISTRY,
			fetchImpl,
			retryOptions({ sleep: clock.sleep, log: (m) => logs.push(m) })
		);

		// `a` is published, so only the retry told us that — a swallowed error
		// would have wrongly re-published it.
		expect(unpublished.map((p) => p.name)).toEqual(["b"]);
		expect(logs.join("\n")).toContain("a: registry read failed (attempt 1/3)");
		expect(clock.now()).toBe(2_000);
	});

	it("should back off exponentially and give up after the configured attempts", async ({
		expect,
	}) => {
		const clock = createFakeClock();
		let calls = 0;
		const fetchImpl: FetchLike = async () => {
			calls++;
			throw new Error("ECONNRESET");
		};

		await expect(
			filterUnpublished(
				[makePackage("a")],
				REGISTRY,
				fetchImpl,
				retryOptions({ sleep: clock.sleep })
			)
		).rejects.toThrowErrorMatchingInlineSnapshot(`[Error: ECONNRESET]`);

		expect(calls).toBe(3);
		// 2s then 4s, and no sleep after the final failure.
		expect(clock.now()).toBe(6_000);
	});

	it("should not retry a 404, which legitimately means unpublished", async ({
		expect,
	}) => {
		const registry = createFakeRegistry();
		const clock = createFakeClock();

		const unpublished = await filterUnpublished(
			[makePackage("brand-new")],
			REGISTRY,
			registry.fetchImpl,
			retryOptions({ sleep: clock.sleep })
		);

		expect(unpublished.map((p) => p.name)).toEqual(["brand-new"]);
		expect(registry.requests).toHaveLength(1);
		expect(clock.now()).toBe(0);
	});
});

describe("waitForPropagation()", () => {
	const baseOptions = {
		registry: REGISTRY,
		minSeconds: 0,
		timeoutSeconds: 600,
		pollSeconds: 5,
		log: () => {},
	};

	it("should return immediately when there is nothing to wait for", async ({
		expect,
	}) => {
		const registry = createFakeRegistry();
		const clock = createFakeClock();
		await waitForPropagation([], {
			...baseOptions,
			fetchImpl: registry.fetchImpl,
			...clock,
		});
		expect(registry.requests).toEqual([]);
	});

	it("should poll until every version resolves", async ({ expect }) => {
		const registry = createFakeRegistry({ published: { a: ["1.0.0"] } });
		const clock = createFakeClock();
		let polls = 0;
		const fetchImpl: FetchLike = async (url, init) => {
			if (!url.includes("/-/tarball-")) {
				polls++;
				// `a` resolves on read 1 and `b` misses on reads 2 and 3, so `b` only
				// becomes visible on read 4 — the third round of polling.
				if (polls === 4) {
					registry.publish("b", "1.0.0");
				}
			}
			return registry.fetchImpl(url, init);
		};

		await waitForPropagation(
			[
				{ name: "a", version: "1.0.0" },
				{ name: "b", version: "1.0.0" },
			],
			{ ...baseOptions, fetchImpl, ...clock }
		);

		expect(clock.now()).toBe(10_000);
	});

	it("should keep waiting while a version resolves but its tarball is missing", async ({
		expect,
	}) => {
		const registry = createFakeRegistry({ published: { a: ["1.0.0"] } });
		registry.missingTarballs.add(registry.tarballUrl("a", "1.0.0"));
		const clock = createFakeClock();

		await expect(
			waitForPropagation([{ name: "a", version: "1.0.0" }], {
				...baseOptions,
				timeoutSeconds: 20,
				fetchImpl: registry.fetchImpl,
				...clock,
			})
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Timed out after 20s waiting for these versions to become resolvable on https://registry.example.com: a@1.0.0]`
		);
	});

	it("should time out with the names of the versions that never landed", async ({
		expect,
	}) => {
		const registry = createFakeRegistry({ published: { a: ["1.0.0"] } });
		const clock = createFakeClock();

		await expect(
			waitForPropagation(
				[
					{ name: "a", version: "1.0.0" },
					{ name: "b", version: "2.0.0" },
				],
				{
					...baseOptions,
					timeoutSeconds: 15,
					fetchImpl: registry.fetchImpl,
					...clock,
				}
			)
		).rejects.toThrow(/b@2\.0\.0/);
	});

	it("should observe the minimum settle time even when everything resolves at once", async ({
		expect,
	}) => {
		const registry = createFakeRegistry({ published: { a: ["1.0.0"] } });
		const clock = createFakeClock();

		await waitForPropagation([{ name: "a", version: "1.0.0" }], {
			...baseOptions,
			minSeconds: 60,
			fetchImpl: registry.fetchImpl,
			...clock,
		});

		expect(clock.now()).toBe(60_000);
	});

	it("should settle for the full minimum after slow polling, not just until it", async ({
		expect,
	}) => {
		// `minSeconds` is an unconditional wait *after* everything resolves, not a
		// floor on the total gate duration: a version that only became retrievable
		// at 10s has given other CDN edges 10s, not 60s.
		const registry = createFakeRegistry({ published: { a: ["1.0.0"] } });
		const clock = createFakeClock();
		let polls = 0;
		const fetchImpl: FetchLike = async (url, init) => {
			if (!url.includes("/-/tarball-")) {
				polls++;
				if (polls === 3) {
					registry.publish("b", "1.0.0");
				}
			}
			return registry.fetchImpl(url, init);
		};

		await waitForPropagation(
			[
				{ name: "a", version: "1.0.0" },
				{ name: "b", version: "1.0.0" },
			],
			{ ...baseOptions, minSeconds: 60, fetchImpl, ...clock }
		);

		// 5s of polling, then the full 60s settle.
		expect(clock.now()).toBe(65_000);
	});

	it("should retry when a registry read throws", async ({ expect }) => {
		const registry = createFakeRegistry({ published: { a: ["1.0.0"] } });
		const clock = createFakeClock();
		let calls = 0;
		const fetchImpl: FetchLike = async (url, init) => {
			calls++;
			if (calls === 1) {
				throw new Error("ECONNRESET");
			}
			return registry.fetchImpl(url, init);
		};

		const logs: string[] = [];
		await waitForPropagation([{ name: "a", version: "1.0.0" }], {
			...baseOptions,
			fetchImpl,
			...clock,
			log: (message) => logs.push(message),
		});

		expect(logs.join("\n")).toContain("check failed, will retry");
	});
});

describe("publishTier()", () => {
	function ok(pkg: WorkspacePackage): PublishResult {
		return { name: pkg.name, version: pkg.version, output: "" };
	}

	it("should return results in input order regardless of completion order", async ({
		expect,
	}) => {
		const packages = [makePackage("a"), makePackage("b"), makePackage("c")];
		const results = await publishTier(
			packages,
			async (pkg) => {
				// `a` finishes last.
				if (pkg.name === "a") {
					await new Promise((r) => setTimeout(r, 20));
				}
				return ok(pkg);
			},
			3
		);
		expect(results.map((r) => r.name)).toEqual(["a", "b", "c"]);
	});

	it("should not exceed the requested concurrency", async ({ expect }) => {
		const packages = Array.from({ length: 8 }, (_, i) =>
			makePackage(`pkg-${i}`)
		);
		let inFlight = 0;
		let maxInFlight = 0;

		await publishTier(
			packages,
			async (pkg) => {
				inFlight++;
				maxInFlight = Math.max(maxInFlight, inFlight);
				await new Promise((r) => setTimeout(r, 5));
				inFlight--;
				return ok(pkg);
			},
			3
		);

		expect(maxInFlight).toBe(3);
	});

	it("should still report failures alongside successes", async ({ expect }) => {
		const packages = [makePackage("a"), makePackage("b")];
		const results = await publishTier(
			packages,
			async (pkg) => ({
				...ok(pkg),
				error: pkg.name === "b" ? "boom" : undefined,
			}),
			2
		);
		expect(results.map((r) => [r.name, r.error])).toEqual([
			["a", undefined],
			["b", "boom"],
		]);
	});
});

describe("publishAllPackages()", () => {
	let packagesDir: string;

	beforeEach(() => {
		packagesDir = realpathSync(mkdtempSync(join(tmpdir(), "publish-all-")));
		const seed = (name: string, contents: unknown) => {
			const dir = join(packagesDir, name);
			mkdirSync(dir, { recursive: true });
			writeFileSync(join(dir, "package.json"), JSON.stringify(contents));
		};
		seed("core", { name: "core", version: "2.0.0" });
		seed("app", {
			name: "app",
			version: "2.0.0",
			dependencies: { core: "workspace:*" },
		});
	});

	afterEach(() => {
		// eslint-disable-next-line workers-sdk/no-direct-recursive-rm -- test cleanup
		rmSync(packagesDir, { recursive: true, force: true });
	});

	/**
	 * Runs `publishAllPackages` against the seeded temp workspace with a fake
	 * registry, a fake clock, and a recording publisher.
	 */
	function createHarness(
		overrides: {
			published?: Record<string, string[]>;
			options?: Partial<MainOptions>;
			publish?: MainOptions["publish"];
			/** Wraps the fake registry, so reads can be made to fail. */
			fetchImpl?: (registryFetch: FetchLike) => FetchLike;
			tagExitCode?: number;
		} = {}
	) {
		const registry = createFakeRegistry({ published: overrides.published });
		const clock = createFakeClock();
		const logs: string[] = [];
		const publishOrder: string[] = [];
		const state = { tagCalls: 0 };

		const defaultPublish: MainOptions["publish"] = async (pkg) => {
			publishOrder.push(pkg.name);
			registry.publish(pkg.name, pkg.version);
			return { name: pkg.name, version: pkg.version, output: "" };
		};

		const options: MainOptions = {
			packagesDir,
			dryRun: false,
			registry: REGISTRY,
			distTag: "latest",
			concurrency: 4,
			propagation: {
				skip: false,
				minSeconds: 0,
				timeoutSeconds: 600,
				pollSeconds: 5,
			},
			readRetry: { attempts: 3, delaySeconds: 2 },
			fetchImpl:
				overrides.fetchImpl?.(registry.fetchImpl) ?? registry.fetchImpl,
			publish: overrides.publish ?? defaultPublish,
			runChangesetTag: async () => {
				state.tagCalls++;
				return overrides.tagExitCode ?? 0;
			},
			sleep: clock.sleep,
			now: clock.now,
			log: (message) => logs.push(message),
			...overrides.options,
		};

		return {
			options,
			logs,
			publishOrder,
			registry,
			clock,
			run: () => publishAllPackages(options),
			get tagCalls() {
				return state.tagCalls;
			},
		};
	}

	it("should print the plan and publish nothing on a dry run", async ({
		expect,
	}) => {
		const harness = createHarness({ options: { dryRun: true } });

		await harness.run();

		expect(harness.publishOrder).toEqual([]);
		expect(harness.tagCalls).toBe(0);
		expect(harness.logs.join("\n")).toContain(
			"Dry run: nothing was published."
		);
	});

	it("should publish tier by tier and only tag once everything is published", async ({
		expect,
	}) => {
		const harness = createHarness({
			options: {
				propagation: {
					skip: false,
					minSeconds: 30,
					timeoutSeconds: 600,
					pollSeconds: 5,
				},
			},
		});

		await harness.run();

		expect(harness.publishOrder).toEqual(["core", "app"]);
		expect(harness.tagCalls).toBe(1);
		// The gate between the two tiers observed the settle wait, and there was no
		// gate after the final tier.
		expect(harness.clock.now()).toBe(30_000);
	});

	it("should skip packages whose version is already published", async ({
		expect,
	}) => {
		const harness = createHarness({ published: { core: ["2.0.0"] } });

		await harness.run();

		expect(harness.publishOrder).toEqual(["app"]);
	});

	it("should still tag when there is nothing to publish", async ({
		expect,
	}) => {
		const harness = createHarness({
			published: { core: ["2.0.0"], app: ["2.0.0"] },
		});

		await harness.run();

		expect(harness.publishOrder).toEqual([]);
		// Matches `changeset publish`, which tags untagged private packages even
		// when no public package needed publishing.
		expect(harness.tagCalls).toBe(1);
		expect(harness.logs.join("\n")).toContain("No unpublished packages found.");
	});

	it("should survive a transient registry failure while checking a later tier", async ({
		expect,
	}) => {
		// Regression test: a single 503 while computing tier 1 used to abort the
		// run after tier 0 had already been published, so those packages got no
		// git tags, no GitHub releases and no downstream deployments.
		let appReads = 0;
		const harness = createHarness({
			fetchImpl: (registryFetch) => async (url, init) => {
				// `app` is the only package in tier 1, so its first packument read is
				// that tier's "is this already published?" check.
				if (url.endsWith("/app")) {
					appReads++;
					if (appReads === 1) {
						return { ok: false, status: 503, json: async () => ({}) };
					}
				}
				return registryFetch(url, init);
			},
		});

		await harness.run();

		expect(harness.publishOrder).toEqual(["core", "app"]);
		expect(harness.tagCalls).toBe(1);
		expect(harness.logs.join("\n")).toContain(
			"app: registry read failed (attempt 1/3)"
		);
	});

	it("should abort without tagging when a tier fails, leaving later tiers unpublished", async ({
		expect,
	}) => {
		const publishOrder: string[] = [];
		const harness = createHarness({
			publish: async (pkg) => {
				publishOrder.push(pkg.name);
				return {
					name: pkg.name,
					version: pkg.version,
					output: "npm ERR! nope",
					error: "pnpm publish exited with code 1",
				};
			},
		});

		await expect(harness.run()).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: 1 package(s) failed to publish in tier 0. No tags were created; re-run this job to retry.]`
		);

		// `app` is in a later tier, so it must never have been attempted.
		expect(publishOrder).toEqual(["core"]);
		expect(harness.tagCalls).toBe(0);
		expect(harness.logs.join("\n")).toContain(
			"::error::Failed to publish core@2.0.0"
		);
	});

	it("should fail when `changeset tag` fails", async ({ expect }) => {
		const harness = createHarness({ tagExitCode: 1 });

		await expect(harness.run()).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: \`changeset tag\` exited with code 1]`
		);
	});
});
