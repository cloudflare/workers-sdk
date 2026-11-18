import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { removeDirSync } from "../src/fs-helpers";
import { fetchLatestNpmVersion } from "../src/update-check";
import type { Dispatcher } from "undici";

const REGISTRY_ORIGIN = "https://registry.npmjs.org";

type Packument = {
	"dist-tags": Record<string, string>;
	versions: Record<string, { deprecated?: string }>;
};

function packument(
	distTags: Record<string, string>,
	versions: Record<string, { deprecated?: string }>
): Packument {
	return { "dist-tags": distTags, versions };
}

describe("fetchLatestNpmVersion", () => {
	let tempDir: string;
	let mockAgent: MockAgent;
	let originalDispatcher: Dispatcher;

	beforeEach(() => {
		tempDir = mkdtempSync(path.join(tmpdir(), "update-check-test-"));
		// `os.tmpdir()` reads these at call time, so pointing them at a fresh
		// directory isolates the on-disk cache between tests (and from the
		// real cache on the developer's machine).
		vi.stubEnv("TMPDIR", tempDir);
		vi.stubEnv("TEMP", tempDir);
		vi.stubEnv("TMP", tempDir);

		originalDispatcher = getGlobalDispatcher();
		mockAgent = new MockAgent();
		mockAgent.disableNetConnect();
		setGlobalDispatcher(mockAgent);
	});

	afterEach(async () => {
		setGlobalDispatcher(originalDispatcher);
		await mockAgent.close();
		removeDirSync(tempDir);
	});

	function mockPackument(
		name: string,
		body: Packument,
		{ status = 200, times = 1, origin = REGISTRY_ORIGIN, pathPrefix = "" } = {}
	) {
		mockAgent
			.get(origin)
			.intercept({
				path: `${pathPrefix}/${encodeURIComponent(name)}`,
				method: "GET",
			})
			.reply(status, body)
			.times(times);
	}

	function cacheFilePath(name: string, distTag = "latest") {
		return path.join(
			tempDir,
			"update-check",
			`${name.replace("/", "-")}-${distTag}.json`
		);
	}

	it("reports an update when a newer version is tagged latest", async ({
		expect,
	}) => {
		mockPackument(
			"wrangler",
			packument({ latest: "4.14.2" }, { "4.14.1": {}, "4.14.2": {} })
		);

		await expect(fetchLatestNpmVersion("wrangler", "4.14.1")).resolves.toEqual({
			status: "update-available",
			latest: "4.14.2",
		});
	});

	it("reports up-to-date when already on the latest version", async ({
		expect,
	}) => {
		mockPackument(
			"wrangler",
			packument({ latest: "4.14.2" }, { "4.14.1": {}, "4.14.2": {} })
		);

		await expect(fetchLatestNpmVersion("wrangler", "4.14.2")).resolves.toEqual({
			status: "up-to-date",
		});
	});

	it("compares versions numerically rather than lexically", async ({
		expect,
	}) => {
		mockPackument(
			"wrangler",
			packument({ latest: "4.14.2" }, { "4.9.1": {}, "4.14.2": {} })
		);

		await expect(fetchLatestNpmVersion("wrangler", "4.9.1")).resolves.toEqual({
			status: "update-available",
			latest: "4.14.2",
		});
	});

	it("does not recommend a deprecated latest version, falling back to the newest non-deprecated stable release below it", async ({
		expect,
	}) => {
		mockPackument(
			"wrangler",
			packument(
				{ latest: "4.14.2", next: "5.0.0" },
				{
					"4.14.0": {},
					"4.14.1": {},
					"4.14.2": { deprecated: "This version has a bug in wrangler dev" },
					// A pre-release must never be recommended in place of `latest`.
					"4.15.0-beta.1": {},
					// Nor should a stable release that is newer than `latest`, as
					// that is deliberately not what users are being pointed at.
					"5.0.0": {},
				}
			)
		);

		await expect(fetchLatestNpmVersion("wrangler", "4.14.0")).resolves.toEqual({
			status: "update-available",
			latest: "4.14.1",
		});
	});

	it("reports up-to-date when the only newer versions are deprecated", async ({
		expect,
	}) => {
		mockPackument(
			"wrangler",
			packument(
				{ latest: "4.14.2" },
				{
					"4.14.1": {},
					"4.14.2": { deprecated: "This version has a bug in wrangler dev" },
				}
			)
		);

		await expect(fetchLatestNpmVersion("wrangler", "4.14.1")).resolves.toEqual({
			status: "up-to-date",
		});
	});

	it("reports up-to-date when every release has been deprecated", async ({
		expect,
	}) => {
		mockPackument(
			"wrangler",
			packument(
				{ latest: "4.14.2" },
				{
					"4.14.1": { deprecated: "broken" },
					"4.14.2": { deprecated: "also broken" },
				}
			)
		);

		await expect(fetchLatestNpmVersion("wrangler", "4.14.0")).resolves.toEqual({
			status: "up-to-date",
		});
	});

	it("uses the beta dist tag for pre-release versions and never recommends a deprecated beta", async ({
		expect,
	}) => {
		mockPackument(
			"wrangler",
			packument(
				{ latest: "4.14.2", beta: "0.0.0-def456" },
				{
					"0.0.0-abc123": {},
					"0.0.0-def456": { deprecated: "broken pre-release" },
					"4.14.2": {},
				}
			)
		);

		await expect(
			fetchLatestNpmVersion("wrangler", "0.0.0-abc123")
		).resolves.toEqual({ status: "up-to-date" });
		expect(
			JSON.parse(readFileSync(cacheFilePath("wrangler", "beta"), "utf8"))
		).toMatchObject({ latest: null });
	});

	it("reports a failure when the dist tag does not exist", async ({
		expect,
	}) => {
		mockPackument("wrangler", packument({}, { "4.14.2": {} }));

		await expect(fetchLatestNpmVersion("wrangler", "4.14.1")).resolves.toEqual({
			status: "failed",
		});
	});

	it("reports a failure when the registry responds with an error", async ({
		expect,
	}) => {
		mockPackument("wrangler", packument({}, {}), { status: 500 });

		await expect(fetchLatestNpmVersion("wrangler", "4.14.1")).resolves.toEqual({
			status: "failed",
		});
	});

	it("reports a failure when the registry cannot be reached", async ({
		expect,
	}) => {
		// No interceptor is registered and network access is disabled, so the
		// request is rejected outright.
		await expect(fetchLatestNpmVersion("wrangler", "4.14.1")).resolves.toEqual({
			status: "failed",
		});
	});

	it("encodes scoped package names", async ({ expect }) => {
		mockPackument(
			"@cloudflare/vite-plugin",
			packument({ latest: "1.2.0" }, { "1.1.0": {}, "1.2.0": {} })
		);

		await expect(
			fetchLatestNpmVersion("@cloudflare/vite-plugin", "1.1.0")
		).resolves.toEqual({ status: "update-available", latest: "1.2.0" });
		expect(
			JSON.parse(readFileSync(cacheFilePath("@cloudflare/vite-plugin"), "utf8"))
		).toMatchObject({ latest: "1.2.0" });
	});

	it("caches the registry lookup so later checks do not hit the network", async ({
		expect,
	}) => {
		// Only a single response is registered; a second request would fail.
		mockPackument(
			"wrangler",
			packument({ latest: "4.14.2" }, { "4.14.1": {}, "4.14.2": {} })
		);

		await expect(fetchLatestNpmVersion("wrangler", "4.14.1")).resolves.toEqual({
			status: "update-available",
			latest: "4.14.2",
		});
		await expect(fetchLatestNpmVersion("wrangler", "4.14.1")).resolves.toEqual({
			status: "update-available",
			latest: "4.14.2",
		});
	});

	it("honours a cache written before the update check learnt about deprecations", async ({
		expect,
	}) => {
		await mkdir(path.dirname(cacheFilePath("wrangler")), { recursive: true });
		writeFileSync(
			cacheFilePath("wrangler"),
			JSON.stringify({ latest: "4.14.2", lastUpdate: Date.now() })
		);

		await expect(fetchLatestNpmVersion("wrangler", "4.14.1")).resolves.toEqual({
			status: "update-available",
			latest: "4.14.2",
		});
	});

	it("refreshes a cache entry once it is more than an hour old", async ({
		expect,
	}) => {
		await mkdir(path.dirname(cacheFilePath("wrangler")), { recursive: true });
		writeFileSync(
			cacheFilePath("wrangler"),
			JSON.stringify({
				latest: "4.14.2",
				lastUpdate: Date.now() - 2 * 60 * 60 * 1_000,
			})
		);
		mockPackument(
			"wrangler",
			packument({ latest: "4.14.3" }, { "4.14.2": {}, "4.14.3": {} })
		);

		await expect(fetchLatestNpmVersion("wrangler", "4.14.1")).resolves.toEqual({
			status: "update-available",
			latest: "4.14.3",
		});
	});

	it("ignores a corrupt cache file", async ({ expect }) => {
		await mkdir(path.dirname(cacheFilePath("wrangler")), { recursive: true });
		writeFileSync(cacheFilePath("wrangler"), "not json");
		mockPackument(
			"wrangler",
			packument({ latest: "4.14.2" }, { "4.14.1": {}, "4.14.2": {} })
		);

		await expect(fetchLatestNpmVersion("wrangler", "4.14.1")).resolves.toEqual({
			status: "update-available",
			latest: "4.14.2",
		});
	});

	// https://github.com/cloudflare/workers-sdk/issues/16356
	// Users behind a registry mirror (for example in CI with restricted
	// egress) configure npm with `npm_config_registry` or `.npmrc`. The update
	// check should ask that registry, as it did before 4.149.0, rather than
	// always connecting to the public registry. Network access is disabled and
	// only the configured registry is mocked, so a request to
	// registry.npmjs.org fails the check, as it does behind blocked egress.
	describe("with a configured npm registry", () => {
		const MIRROR_ORIGIN = "https://npm-mirror.example.com";

		beforeEach(() => {
			// Isolate from the environment running the tests: no npm config from
			// the environment, and a home directory without a user `.npmrc`.
			vi.stubEnv("npm_config_registry", undefined);
			vi.stubEnv("NPM_CONFIG_REGISTRY", undefined);
			vi.stubEnv("npm_config_userconfig", undefined);
			vi.stubEnv("NPM_CONFIG_USERCONFIG", undefined);
			vi.stubEnv("HOME", tempDir);
			vi.stubEnv("USERPROFILE", tempDir);
		});

		it("queries the registry set by npm_config_registry", async ({
			expect,
		}) => {
			vi.stubEnv("npm_config_registry", `${MIRROR_ORIGIN}/`);
			mockPackument(
				"wrangler",
				packument({ latest: "4.14.2" }, { "4.14.1": {}, "4.14.2": {} }),
				{ origin: MIRROR_ORIGIN }
			);

			await expect(
				fetchLatestNpmVersion("wrangler", "4.14.1")
			).resolves.toEqual({ status: "update-available", latest: "4.14.2" });
		});

		it("queries the registry set by NPM_CONFIG_REGISTRY", async ({
			expect,
		}) => {
			vi.stubEnv("NPM_CONFIG_REGISTRY", `${MIRROR_ORIGIN}/`);
			mockPackument(
				"wrangler",
				packument({ latest: "4.14.2" }, { "4.14.1": {}, "4.14.2": {} }),
				{ origin: MIRROR_ORIGIN }
			);

			await expect(
				fetchLatestNpmVersion("wrangler", "4.14.1")
			).resolves.toEqual({ status: "update-available", latest: "4.14.2" });
		});

		it("queries a configured registry that is served under a path", async ({
			expect,
		}) => {
			vi.stubEnv("npm_config_registry", `${MIRROR_ORIGIN}/api/npm/npm-remote/`);
			mockPackument(
				"@cloudflare/vite-plugin",
				packument({ latest: "1.2.0" }, { "1.1.0": {}, "1.2.0": {} }),
				{ origin: MIRROR_ORIGIN, pathPrefix: "/api/npm/npm-remote" }
			);

			await expect(
				fetchLatestNpmVersion("@cloudflare/vite-plugin", "1.1.0")
			).resolves.toEqual({ status: "update-available", latest: "1.2.0" });
		});

		it("queries the registry set in the user's .npmrc", async ({ expect }) => {
			// What `npm config set registry <url>` writes.
			writeFileSync(
				path.join(tempDir, ".npmrc"),
				`registry=${MIRROR_ORIGIN}/\n`
			);
			mockPackument(
				"wrangler",
				packument({ latest: "4.14.2" }, { "4.14.1": {}, "4.14.2": {} }),
				{ origin: MIRROR_ORIGIN }
			);

			await expect(
				fetchLatestNpmVersion("wrangler", "4.14.1")
			).resolves.toEqual({ status: "update-available", latest: "4.14.2" });
		});
	});
});
