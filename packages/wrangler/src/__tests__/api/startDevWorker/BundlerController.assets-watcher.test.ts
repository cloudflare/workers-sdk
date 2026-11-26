import assert from "node:assert";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { watch } from "chokidar";
import {
	afterEach,
	beforeEach,
	describe,
	type ExpectStatic,
	test,
	vi,
} from "vitest";
import { BundlerController } from "../../../api/startDevWorker/BundlerController";
import { FakeBus } from "../../helpers/fake-bus";
import { mockConsoleMethods } from "../../helpers/mock-console";
import type { StartDevWorkerOptions } from "../../../api";
import type { FSWatcher } from "chokidar";

// Mock chokidar so we can drive watcher events and errors directly, without
// depending on the filesystem delivering them.
vi.mock("chokidar");

function configDefaults(
	overrides: Partial<StartDevWorkerOptions> = {}
): StartDevWorkerOptions {
	const persist = path.join(process.cwd(), ".wrangler/persist");
	return {
		name: "test-worker",
		complianceRegion: undefined,
		entrypoint: path.resolve("src/index.ts"),
		projectRoot: path.resolve("src"),
		legacy: {},
		dev: { persist },
		build: {
			additionalModules: [],
			processEntrypoint: false,
			nodejsCompatMode: null,
			bundle: true,
			moduleRules: [],
			custom: {},
			define: {},
			format: "modules",
			moduleRoot: path.resolve("src"),
			exports: [],
		},
		...overrides,
	};
}

function assetsConfig() {
	return configDefaults({
		assets: {
			directory: path.resolve("assets"),
			binding: undefined,
			routerConfig: { has_user_worker: true },
			assetConfig: {},
		},
	});
}

function assetsAt(
	directory: string,
	persist: string = path.join(path.resolve("."), ".wrangler/state")
): StartDevWorkerOptions {
	const config = configDefaults({
		projectRoot: path.resolve("."),
		assets: {
			directory,
			binding: undefined,
			routerConfig: { has_user_worker: true },
			assetConfig: {},
		},
	});
	config.dev.persist = persist;
	return config;
}

/**
 * A config that makes the controller create two watchers: one for the custom
 * build's watched paths and one for the assets directory.
 */
function customBuildAndAssetsConfig(): StartDevWorkerOptions {
	const config = assetsConfig();
	return {
		...config,
		build: {
			...config.build,
			// The command only runs in response to watcher events, which this suite
			// drives itself, so it is never actually executed.
			custom: { command: "echo 'never runs'", watch: path.resolve("src") },
		},
	};
}

type FakeWatcher = EventEmitter & { close: ReturnType<typeof vi.fn> };

/**
 * Make `watch()` hand the controller watchers whose events we drive ourselves,
 * recording every call so that tests can close them and read the options for
 * a call they name.
 */
function mockWatchers(expect: ExpectStatic, { closeDelayMs = 0 } = {}) {
	const created: FakeWatcher[] = [];
	const calls: Array<Parameters<typeof watch>[1]> = [];
	vi.mocked(watch).mockImplementation((_paths, options) => {
		calls.push(options);
		const fakeWatcher = new EventEmitter() as FakeWatcher;
		let closing: Promise<void> | undefined;
		// Repeated `close()` calls return the same promise, as chokidar's do.
		fakeWatcher.close = vi.fn(() => (closing ??= setTimeout(closeDelayMs)));
		created.push(fakeWatcher);
		return fakeWatcher as unknown as FSWatcher;
	});
	return {
		created,
		/** Wait for the watcher at `index` to be created, then return it. */
		async at(index: number) {
			await vi.waitFor(() => expect(created.length).toBeGreaterThan(index));
			const watcher = created[index];
			assert(watcher);
			return watcher;
		},
		ignoredDirs(index: number): string[] {
			const ignored = calls[index]?.ignored;
			return (Array.isArray(ignored) ? ignored : [ignored]).filter(
				(entry) => typeof entry === "string"
			);
		},
		async ignoresAsset(index: number, relativePath: string, withStats = true) {
			const ignored = calls[index]?.ignored;
			const matcher = (Array.isArray(ignored) ? ignored : [ignored]).find(
				(entry) => typeof entry === "function"
			);
			assert(matcher);
			const absolutePath = path.resolve(relativePath);
			return matcher(
				absolutePath,
				withStats ? await stat(absolutePath) : undefined
			);
		},
	};
}

describe("BundlerController — assets watcher", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	let bus: FakeBus;
	let controller: BundlerController;

	beforeEach(async () => {
		bus = new FakeBus();
		controller = new BundlerController(bus);

		// Set up a minimal entry point so onConfigUpdate doesn't fail.
		await seed({
			"src/index.ts": `export default { fetch() { return new Response("ok"); } }`,
			"assets/placeholder.txt": "hello",
		});
	});

	afterEach(() => controller.teardown());

	test("a pending assets refresh is discarded on teardown", async ({
		expect,
	}) => {
		const watchers = mockWatchers(expect);

		const firstBundle = bus.waitFor("bundleComplete");
		controller.onConfigUpdate({
			type: "configUpdate",
			config: assetsConfig(),
		});
		await firstBundle;
		const fakeWatcher = await watchers.at(0);

		// An asset change arms the debounced bundle refresh...
		fakeWatcher.emit("all", "change", path.resolve("assets/placeholder.txt"));
		// ...but dev shuts down before the debounce delay has elapsed.
		await controller.teardown();

		const eventsAtTeardown = bus.events.length;
		// Wait well past the debounce delay. The refresh must not dispatch a
		// `bundleComplete` into the torn-down bus.
		await setTimeout(500);
		expect(bus.events.slice(eventsAtTeardown)).toEqual([]);
	});

	test("a pending assets refresh is discarded when the config is replaced", async ({
		expect,
	}) => {
		const watchers = mockWatchers(expect);

		const config = assetsConfig();
		const firstBundle = bus.waitFor("bundleComplete");
		controller.onConfigUpdate({ type: "configUpdate", config });
		await firstBundle;
		const fakeWatcher = await watchers.at(0);

		// An asset change arms the debounced bundle refresh...
		fakeWatcher.emit("all", "change", path.resolve("assets/placeholder.txt"));
		// ...but the config is replaced before the debounce delay has elapsed, so the
		// refresh would report a bundle for a config that is no longer current.
		const replacementConfig = { ...config, name: "replacement-worker" };
		const secondBundle = bus.waitFor(
			"bundleComplete",
			(event) => event.config.name === "replacement-worker"
		);
		controller.onConfigUpdate({
			type: "configUpdate",
			config: replacementConfig,
		});
		await secondBundle;

		// Wait well past the debounce delay. The initial build dispatched exactly one
		// `bundleComplete` for the original config, and the discarded refresh must not
		// add another — it would report a bundle against a config that is no longer
		// current. Counting rather than watching a window matters because the stale
		// refresh can fire either side of the replacement build completing.
		await setTimeout(500);
		expect(
			bus.events.filter(
				(event) =>
					event.type === "bundleComplete" && event.config.name === "test-worker"
			)
		).toHaveLength(1);
	});

	test(
		"logs a warning and disables the watcher when chokidar emits EMFILE",
		{ timeout: 5_000 },
		async ({ expect }) => {
			const watchers = mockWatchers(expect);

			controller.onConfigUpdate({
				type: "configUpdate",
				config: assetsConfig(),
			});

			const fakeWatcher = await watchers.at(0);

			const emfileError = Object.assign(
				new Error("EMFILE: too many open files, watch"),
				{ code: "EMFILE" }
			);
			fakeWatcher.emit("error", emfileError);

			// Tick once so the warning is flushed.
			await setTimeout(0);

			expect(std.warn).toContain("platform limit");
			expect(std.warn).toContain("flattening");
			expect(fakeWatcher.close).toHaveBeenCalled();
		}
	);

	test(
		"logs a warning and closes the watcher for non-EMFILE watcher errors",
		{ timeout: 5_000 },
		async ({ expect }) => {
			const watchers = mockWatchers(expect);

			controller.onConfigUpdate({
				type: "configUpdate",
				config: assetsConfig(),
			});
			const fakeWatcher = await watchers.at(0);

			const genericError = new Error("EACCES: permission denied");
			fakeWatcher.emit("error", genericError);
			await setTimeout(0);

			expect(std.warn).toContain("encountered an error and has been disabled");
			expect(std.warn).toContain("EACCES: permission denied");
			// Watcher must be closed so the error doesn't loop.
			expect(fakeWatcher.close).toHaveBeenCalled();
		}
	);

	test("uses .assetsignore rules to watch the project root and reloads when they change", async ({
		expect,
	}) => {
		const watchers = mockWatchers(expect);
		await seed({
			".assetsignore":
				"node_modules\n/.cloudflare/\n*.bak\n*private*\n!private/\n",
			".cloudflare/config.json": "{}",
			"node_modules/example/index.js": "export {};",
			"private/index.html": "<h1>Visible</h1>",
			"index.bak": "Ignored",
			_headers: "/\n  X-Test: yes\n",
			_redirects: "/old /new 302\n",
		});

		const projectRoot = path.resolve(".");
		const firstBundle = bus.waitFor("bundleComplete");
		controller.onConfigUpdate({
			type: "configUpdate",
			config: assetsAt(projectRoot),
		});
		await firstBundle;
		const firstWatcher = await watchers.at(0);
		expect(watchers.ignoredDirs(0)).toEqual([
			path.join(projectRoot, ".wrangler"),
			path.join(projectRoot, ".wrangler/state"),
		]);
		for (const ignoredPath of ["node_modules", ".cloudflare", "index.bak"]) {
			expect(await watchers.ignoresAsset(0, ignoredPath), ignoredPath).toBe(
				true
			);
		}
		for (const watchedPath of [
			".assetsignore",
			"_headers",
			"_redirects",
			"private",
		]) {
			expect(await watchers.ignoresAsset(0, watchedPath), watchedPath).toBe(
				false
			);
		}
		expect(await watchers.ignoresAsset(0, "node_modules", false)).toBe(true);
		expect(await watchers.ignoresAsset(0, "private", false)).toBe(false);

		const ignoreReload = bus.waitFor("bundleComplete");
		await seed({
			".assetsignore":
				"node_modules\n/.cloudflare/\n!/node_modules/\n!/.cloudflare/\n",
		});
		firstWatcher.emit("all", "change", path.resolve(".assetsignore"));
		await ignoreReload;
		await watchers.at(1);
		expect(firstWatcher.close).toHaveBeenCalled();
		expect(await watchers.ignoresAsset(1, ".cloudflare")).toBe(false);
		expect(await watchers.ignoresAsset(1, "node_modules")).toBe(false);
	});

	test.for([
		{ name: "uppercase entries only", addLowercaseFiles: false },
		{ name: "both spellings present", addLowercaseFiles: true },
	])(
		"only watches differently cased metadata if the lowercase lookup finds it ($name)",
		async ({ addLowercaseFiles }, { expect, skip }) => {
			const watchers = mockWatchers(expect);
			const metadataPaths = [
				"assets/.ASSETSIGNORE",
				"assets/_HEADERS",
				"assets/_REDIRECTS",
			];
			await seed(
				Object.fromEntries(metadataPaths.map((filePath) => [filePath, ""]))
			);
			const caseInsensitive = existsSync("assets/.assetsignore");
			if (addLowercaseFiles) {
				if (caseInsensitive) {
					skip("Requires a case-sensitive filesystem");
				}
				await seed(
					Object.fromEntries(
						metadataPaths.map((filePath) => [filePath.toLowerCase(), ""])
					)
				);
			}

			controller.onConfigUpdate({
				type: "configUpdate",
				config: assetsConfig(),
			});
			await watchers.at(0);
			for (const metadataPath of metadataPaths) {
				expect(await watchers.ignoresAsset(0, metadataPath), metadataPath).toBe(
					!caseInsensitive
				);
				expect(
					await watchers.ignoresAsset(
						0,
						metadataPath.toLowerCase(),
						caseInsensitive || addLowercaseFiles
					)
				).toBe(false);
			}
		}
	);

	test("reloads when a file changes in a newly unignored directory", async ({
		expect,
	}) => {
		const { watch: realWatch } =
			await vi.importActual<typeof import("chokidar")>("chokidar");
		const readyWatchers: FSWatcher[] = [];
		vi.mocked(watch).mockImplementation((paths, options) => {
			const watcher = realWatch(paths, { ...options, usePolling: true });
			watcher.once("ready", () => readyWatchers.push(watcher));
			return watcher;
		});

		const lowercaseIgnoreFile = "assets/.assetsignore";
		const uppercaseIgnoreFile = "assets/.ASSETSIGNORE";
		await seed({
			[uppercaseIgnoreFile]: "drafts/\n",
			"assets/drafts/index.html": "Draft",
		});
		const ignoreFile = existsSync(lowercaseIgnoreFile)
			? uppercaseIgnoreFile
			: lowercaseIgnoreFile;
		if (ignoreFile === lowercaseIgnoreFile) {
			await rename(uppercaseIgnoreFile, lowercaseIgnoreFile);
		}

		const assetsDir = path.resolve("assets");
		const draftsDir = path.join(assetsDir, "drafts");
		const firstBundle = bus.waitFor("bundleComplete");
		controller.onConfigUpdate({
			type: "configUpdate",
			config: assetsAt(assetsDir),
		});
		await firstBundle;
		await expect.poll(() => readyWatchers.length).toBe(1);
		expect(readyWatchers[0]?.getWatched()[draftsDir]).toBeUndefined();

		const ignoreReload = bus.waitFor("bundleComplete");
		await seed({ [ignoreFile]: "" });
		await ignoreReload;
		await expect
			.poll(() => readyWatchers[1]?.getWatched()[draftsDir])
			.toContain("index.html");

		const assetReload = bus.waitFor("bundleComplete");
		await seed({ "assets/drafts/index.html": "Published" });
		await assetReload;

		const ignoreRemovalReload = bus.waitFor("bundleComplete");
		await unlink(ignoreFile);
		await ignoreRemovalReload;
		await expect.poll(() => readyWatchers.length).toBe(3);
	});

	test("ignores a persist directory inside the assets tree", async ({
		expect,
	}) => {
		const watchers = mockWatchers(expect);

		const projectRoot = path.resolve(".");
		const persist = path.join(projectRoot, "persist-state");
		const firstBundle = bus.waitFor("bundleComplete");
		controller.onConfigUpdate({
			type: "configUpdate",
			config: assetsAt(projectRoot, persist),
		});
		await firstBundle;
		await watchers.at(0);

		expect(watchers.ignoredDirs(0)).toEqual([
			path.join(projectRoot, ".wrangler"),
			persist,
		]);
	});

	test("watches assets that live under node_modules", async ({ expect }) => {
		const watchers = mockWatchers(expect);

		const projectRoot = path.resolve(".");
		const assetsDir = path.resolve("node_modules/example/public");
		const firstBundle = bus.waitFor("bundleComplete");
		controller.onConfigUpdate({
			type: "configUpdate",
			config: assetsAt(assetsDir),
		});
		await firstBundle;
		await watchers.at(0);

		expect(watchers.ignoredDirs(0)).toEqual([
			path.join(projectRoot, ".wrangler"),
			path.join(projectRoot, ".wrangler/state"),
		]);
	});

	test("keeps watching when the persist path is the assets directory", async ({
		expect,
	}) => {
		const watchers = mockWatchers(expect);

		const projectRoot = path.resolve(".");
		const assetsDir = path.resolve("public");
		const firstBundle = bus.waitFor("bundleComplete");
		controller.onConfigUpdate({
			type: "configUpdate",
			config: assetsAt(assetsDir, assetsDir),
		});
		await firstBundle;
		await watchers.at(0);

		expect(watchers.ignoredDirs(0)).toEqual([
			path.join(projectRoot, ".wrangler"),
		]);
	});

	test("no watchers are created by a config reload that outlives teardown", async ({
		expect,
	}) => {
		// Closing a watcher takes long enough that the reload waiting on it is still
		// suspended when teardown runs to completion.
		const watchers = mockWatchers(expect, { closeDelayMs: 200 });

		const config = customBuildAndAssetsConfig();
		controller.onConfigUpdate({ type: "configUpdate", config });
		// The custom build watcher and the assets watcher.
		await watchers.at(1);

		// A reload closes both watchers before setting up their replacements...
		controller.onConfigUpdate({
			type: "configUpdate",
			config: { ...config, name: "replacement-worker" },
		});
		// ...and dev shuts down while those closes are in flight. Teardown only sees
		// the watchers that exist when it starts, so the reload must not go on to
		// create replacements: they would never be closed, and a `persistent: true`
		// chokidar watcher keeps the process alive.
		await controller.teardown();

		expect(watchers.created).toHaveLength(2);
		for (const watcher of watchers.created) {
			expect(watcher.close).toHaveBeenCalled();
		}
	});
});
