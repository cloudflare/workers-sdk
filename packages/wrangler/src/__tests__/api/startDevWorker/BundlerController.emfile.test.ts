import { EventEmitter } from "node:events";
import path from "node:path";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import { BundlerController } from "../../../api/startDevWorker/BundlerController";
import { FakeBus } from "../../helpers/fake-bus";
import { mockConsoleMethods } from "../../helpers/mock-console";
import type { StartDevWorkerOptions } from "../../../api";
import type { FSWatcher } from "chokidar";

// Mock chokidar so we can simulate watcher errors without a real filesystem.
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

describe("BundlerController — assets watcher EMFILE handling", () => {
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

	test(
		"logs a warning and disables the watcher when chokidar emits EMFILE",
		{ timeout: 5_000 },
		async ({ expect }) => {
			const chokidar = await import("chokidar");
			const fakeWatcher = new EventEmitter() as EventEmitter & {
				close: ReturnType<typeof vi.fn>;
			};
			fakeWatcher.close = vi.fn().mockResolvedValue(undefined);
			vi.mocked(chokidar.watch).mockReturnValue(
				fakeWatcher as unknown as FSWatcher
			);

			const config = configDefaults({
				assets: {
					directory: path.resolve("assets"),
					binding: undefined,
					routerConfig: { has_user_worker: true },
					assetConfig: {},
				},
			});

			controller.onConfigUpdate({ type: "configUpdate", config });

			// Let the async watch setup complete.
			await new Promise((r) => setTimeout(r, 50));

			const emfileError = Object.assign(
				new Error("EMFILE: too many open files, watch"),
				{ code: "EMFILE" }
			);
			fakeWatcher.emit("error", emfileError);

			// Tick once so the warning is flushed.
			await new Promise((r) => setTimeout(r, 0));

			expect(std.warn).toContain("platform limit");
			expect(std.warn).toContain("flattening");
			expect(fakeWatcher.close).toHaveBeenCalled();
		}
	);

	test(
		"logs a warning and closes the watcher for non-EMFILE watcher errors",
		{ timeout: 5_000 },
		async ({ expect }) => {
			const chokidar = await import("chokidar");
			const fakeWatcher = new EventEmitter() as EventEmitter & {
				close: ReturnType<typeof vi.fn>;
			};
			fakeWatcher.close = vi.fn().mockResolvedValue(undefined);
			vi.mocked(chokidar.watch).mockReturnValue(
				fakeWatcher as unknown as FSWatcher
			);

			const config = configDefaults({
				assets: {
					directory: path.resolve("assets"),
					binding: undefined,
					routerConfig: { has_user_worker: true },
					assetConfig: {},
				},
			});

			controller.onConfigUpdate({ type: "configUpdate", config });
			await new Promise((r) => setTimeout(r, 50));

			const genericError = new Error("EACCES: permission denied");
			fakeWatcher.emit("error", genericError);
			await new Promise((r) => setTimeout(r, 0));

			expect(std.warn).toContain("encountered an error and has been disabled");
			expect(std.warn).toContain("EACCES: permission denied");
			// Watcher must be closed so the error doesn't loop.
			expect(fakeWatcher.close).toHaveBeenCalled();
		}
	);
});
