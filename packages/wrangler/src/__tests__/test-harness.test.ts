import assert from "node:assert";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
	BUILD_OUTPUT_VERSION,
	WORKER_CONFIG_FILENAME,
} from "@cloudflare/config";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { createTestHarness } from "../api/test-harness";
import type { WranglerStartDevWorkerInput } from "../api/startDevWorker/types";
import type { Config } from "@cloudflare/workers-utils";
import type { EventEmitter } from "node:events";
import type { Mock } from "vitest";

type MockDevEnv = EventEmitter & {
	config: {
		latestConfig?: Config;
		latestWranglerConfig?: { configPath?: string };
		set: Mock<
			(input: WranglerStartDevWorkerInput, initial: boolean) => Promise<void>
		>;
	};
	runtimes: [{ mf: Record<string, never> }];
	proxy: {
		ready: { promise: Promise<{ url: string }> };
		proxyWorker: { dispatchFetch: Mock<() => Promise<Response>> };
	};
	teardown: Mock<() => Promise<void>>;
};

const mockState = vi.hoisted(() => ({
	instances: [] as MockDevEnv[],
}));

vi.mock("../api/startDevWorker/DevEnv", async () => {
	const { EventEmitter } = await import("node:events");

	class DevEnv extends EventEmitter implements MockDevEnv {
		config: MockDevEnv["config"];
		runtimes: MockDevEnv["runtimes"] = [{ mf: {} }];
		proxy: MockDevEnv["proxy"] = {
			ready: { promise: Promise.resolve({ url: "http://127.0.0.1:8787" }) },
			proxyWorker: {
				dispatchFetch: vi.fn(async () => new Response("ok")),
			},
		};
		teardown = vi.fn(async () => {});

		constructor() {
			super();
			this.config = {
				set: vi.fn(async (input: WranglerStartDevWorkerInput) => {
					if (typeof input.config === "object") {
						this.config.latestConfig = input.config;
					} else {
						this.config.latestWranglerConfig = { configPath: input.config };
					}
					if (mockState.instances[0] === this) {
						queueMicrotask(() => this.emit("reloadComplete"));
					}
				}),
			};
			mockState.instances.push(this);
		}
	}

	return { DevEnv };
});

function outputWorkerDir(workerName: string): string {
	return path.join(
		".cloudflare/output",
		BUILD_OUTPUT_VERSION,
		"workers",
		workerName
	);
}

async function seedBuildOutputWorker(
	workerName: string,
	options: { assets?: boolean } = {}
) {
	const workerDir = outputWorkerDir(workerName);
	await seed({
		[path.join(workerDir, WORKER_CONFIG_FILENAME)]: JSON.stringify({
			name: workerName,
			compatibilityDate: "2026-06-01",
			env: {},
			manifest: {
				mainModule: "index.js",
				modules: { "index.js": { type: "esm" } },
			},
		}),
		[path.join(workerDir, "bundle/index.js")]: `export default {};`,
		...(options.assets
			? { [path.join(workerDir, "assets/index.html")]: "<h1>Hello</h1>" }
			: {}),
	});
}

function getSetInput(index: number): WranglerStartDevWorkerInput {
	const input = mockState.instances[index]?.config.set.mock.calls[0]?.[0];
	assert(input);
	return input;
}

function getInlineConfig(input: WranglerStartDevWorkerInput): Config {
	assert(typeof input.config === "object");
	return input.config;
}

describe("createTestHarness buildOutput", () => {
	runInTempDir();

	beforeEach(() => {
		mockState.instances.length = 0;
	});

	it("expands a Build Output API worker into a no-bundle worker input", async ({
		expect,
	}) => {
		await seedBuildOutputWorker("api", { assets: true });

		const server = createTestHarness({
			workers: [{ buildOutput: "./.cloudflare/output" }],
		});

		await server.listen();

		const input = getSetInput(0);
		const config = getInlineConfig(input);
		expect(config.name).toBe("api");
		expect(config.main).toBe(
			path.resolve(outputWorkerDir("api"), "bundle/index.js")
		);
		expect(config.no_bundle).toBe(true);
		expect(config.assets?.directory).toBe(
			path.resolve(outputWorkerDir("api"), "assets")
		);
		expect(input.build?.bundle).toBe(false);
		expect(input.build?.moduleRoot).toBe(
			path.resolve(outputWorkerDir("api"), "bundle")
		);
		expect(input.dev?.multiworkerPrimary).toBeUndefined();
	});

	it("expands all Build Output API workers in deterministic order", async ({
		expect,
	}) => {
		await seedBuildOutputWorker("worker-b");
		await seedBuildOutputWorker("worker-a");

		const server = createTestHarness({
			workers: [
				{ buildOutput: pathToFileURL(path.resolve(".cloudflare/output")) },
			],
		});

		await server.listen();

		const firstInput = getSetInput(0);
		const secondInput = getSetInput(1);
		expect(getInlineConfig(firstInput).name).toBe("worker-a");
		expect(getInlineConfig(secondInput).name).toBe("worker-b");
		expect(firstInput.dev?.multiworkerPrimary).toBe(true);
		expect(secondInput.dev?.multiworkerPrimary).toBe(false);
	});

	it("throws when the Build Output API workers directory is missing", async ({
		expect,
	}) => {
		const server = createTestHarness({
			workers: [{ buildOutput: "./.cloudflare/output" }],
		});

		await expect(server.listen()).rejects.toThrow(
			"No Build Output API tree found"
		);
		expect(mockState.instances).toHaveLength(0);
	});

	it("throws when a Build Output API worker config is missing", async ({
		expect,
	}) => {
		await seed({
			[path.join(outputWorkerDir("api"), "bundle/index.js")]:
				`export default {};`,
		});

		const server = createTestHarness({
			workers: [{ buildOutput: "./.cloudflare/output" }],
		});

		await expect(server.listen()).rejects.toThrow(
			'Build Output API: missing `worker.config.json` for Worker "api"'
		);
		expect(mockState.instances).toHaveLength(0);
	});
});
