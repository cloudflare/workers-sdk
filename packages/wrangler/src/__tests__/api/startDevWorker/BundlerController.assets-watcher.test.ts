import assert from "node:assert";
import { EventEmitter } from "node:events";
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
 * recording every one so that tests can assert they all get closed.
 */
function mockWatchers(expect: ExpectStatic, { closeDelayMs = 0 } = {}) {
	const created: FakeWatcher[] = [];
	vi.mocked(watch).mockImplementation(() => {
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
