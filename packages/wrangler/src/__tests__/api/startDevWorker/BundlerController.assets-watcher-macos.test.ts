import { EventEmitter } from "node:events";
import path from "node:path";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { watch } from "chokidar";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import { BundlerController } from "../../../api/startDevWorker/BundlerController";
import { FakeBus } from "../../helpers/fake-bus";
import { mockConsoleMethods } from "../../helpers/mock-console";
import type { StartDevWorkerOptions } from "../../../api";
import type { FSWatcher } from "chokidar";

// https://github.com/cloudflare/workers-sdk/issues/16264
vi.mock("chokidar");

describe("BundlerController — assets watcher on macOS", () => {
	mockConsoleMethods();
	runInTempDir();

	let bus: FakeBus;
	let controller: BundlerController;
	const originalPlatform = Object.getOwnPropertyDescriptor(
		process,
		"platform"
	) as PropertyDescriptor;

	beforeEach(async () => {
		bus = new FakeBus();
		controller = new BundlerController(bus);
		await seed({
			"src/index.ts": `export default { fetch() { return new Response("ok"); } }`,
			"assets/placeholder.txt": "hello",
		});
	});

	afterEach(async () => {
		await controller.teardown();
		Object.defineProperty(process, "platform", originalPlatform);
	});

	test("does not give chokidar the assets directory, which opens a descriptor per file", async ({
		expect,
	}) => {
		const watched: unknown[] = [];
		vi.mocked(watch).mockImplementation((paths) => {
			watched.push(paths);
			const fake = new EventEmitter() as EventEmitter & { close(): void };
			fake.close = () => {};
			return fake as unknown as FSWatcher;
		});

		const assetsDir = path.resolve("assets");
		const config: StartDevWorkerOptions = {
			name: "test-worker",
			complianceRegion: undefined,
			entrypoint: path.resolve("src/index.ts"),
			projectRoot: path.resolve("."),
			legacy: {},
			dev: { persist: path.resolve(".wrangler/state") },
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
			assets: {
				directory: assetsDir,
				binding: undefined,
				routerConfig: { has_user_worker: true },
				assetConfig: {},
			},
		};

		const firstBundle = bus.waitFor("bundleComplete");
		controller.onConfigUpdate({ type: "configUpdate", config });
		await firstBundle;
		// Only now pretend to be macOS (esbuild needs the real platform to start),
		// and have the controller set its assets watcher up again.
		watched.length = 0;
		Object.defineProperty(process, "platform", { value: "darwin" });
		controller.onConfigUpdate({
			type: "configUpdate",
			config: { ...config, name: "second-worker" },
		});
		await new Promise((resolve) => setTimeout(resolve, 1_000));

		expect(watched).not.toContain(assetsDir);
	});
});
