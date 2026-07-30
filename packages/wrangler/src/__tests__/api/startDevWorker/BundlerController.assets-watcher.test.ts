import { EventEmitter } from "node:events";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { watch } from "chokidar";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
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

/** Make `watch()` hand the controller a watcher whose events we drive ourselves. */
function mockAssetsWatcher() {
	const fakeWatcher = new EventEmitter() as EventEmitter & {
		close: ReturnType<typeof vi.fn>;
	};
	fakeWatcher.close = vi.fn().mockResolvedValue(undefined);
	vi.mocked(watch).mockReturnValue(fakeWatcher as unknown as FSWatcher);
	return fakeWatcher;
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
		const fakeWatcher = mockAssetsWatcher();

		const firstBundle = bus.waitFor("bundleComplete");
		controller.onConfigUpdate({
			type: "configUpdate",
			config: assetsConfig(),
		});
		await firstBundle;

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
		const fakeWatcher = mockAssetsWatcher();

		const config = assetsConfig();
		const firstBundle = bus.waitFor("bundleComplete");
		controller.onConfigUpdate({ type: "configUpdate", config });
		await firstBundle;

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
			const fakeWatcher = mockAssetsWatcher();

			controller.onConfigUpdate({
				type: "configUpdate",
				config: assetsConfig(),
			});

			// Let the async watch setup complete.
			await setTimeout(50);

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
			const fakeWatcher = mockAssetsWatcher();

			controller.onConfigUpdate({
				type: "configUpdate",
				config: assetsConfig(),
			});
			await setTimeout(50);

			const genericError = new Error("EACCES: permission denied");
			fakeWatcher.emit("error", genericError);
			await setTimeout(0);

			expect(std.warn).toContain("encountered an error and has been disabled");
			expect(std.warn).toContain("EACCES: permission denied");
			// Watcher must be closed so the error doesn't loop.
			expect(fakeWatcher.close).toHaveBeenCalled();
		}
	);
});
