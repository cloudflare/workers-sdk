import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { resolve } from "node:path";
/* eslint-disable workers-sdk/no-vitest-import-expect -- uses expect in module-scope helper functions */
import {
	describe,
	expect,
	onTestFailed,
	onTestFinished,
	test,
	vi,
} from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import {
	runLongLived,
	waitForReady,
} from "../../../packages/vite-plugin-cloudflare/e2e/helpers";
import { runWranglerDev as baseRunWranglerDev } from "../../shared/src/run-wrangler-long-lived";

const waitForTimeout = 10_000;
const cwd = resolve(__dirname, "..");
const tmpPathBase = path.join(os.tmpdir(), "wrangler-tests");
const it = test.extend<{
	devRegistryPath: string;
}>({
	// Fixture for creating a temporary directory
	async devRegistryPath({}, use) {
		const tmpPath = await fs.realpath(await fs.mkdtemp(tmpPathBase));
		await use(tmpPath);
		await fs.rm(tmpPath, { recursive: true, maxRetries: 10 });
	},
});

async function runViteDev(
	config: string,
	devRegistryPath?: string
): Promise<string> {
	const proc = await runLongLived("pnpm", `vite --config ${config}`, cwd, {
		MINIFLARE_REGISTRY_PATH: devRegistryPath,
	});
	const url = await waitForReady(proc);

	onTestFailed(() => {
		console.log(`::group::Vite dev session (${config})`);
		console.log(proc.stdout);
		console.log(proc.stderr);
		console.log("::endgroup::");
	});

	// Wait for the dev session to be ready
	await vi.waitFor(async () => {
		const resposne = await fetch(url, { method: "HEAD" });
		expect(resposne.status).toBe(200);
	}, waitForTimeout);

	return url;
}

async function runWranglerDev(
	config: string | string[],
	devRegistryPath?: string
): Promise<string> {
	const session = await baseRunWranglerDev(
		cwd,
		["--port=0", "--inspector-port=0"].concat(
			Array.isArray(config)
				? config.map((configPath) => `--config=${configPath}`)
				: [`--config=${config}`]
		),
		{ WRANGLER_REGISTRY_PATH: devRegistryPath }
	);

	onTestFailed(() => {
		console.log(`::group::Wrangler dev session (${config})`);
		console.log(session.getOutput());
		console.log("::endgroup::");
	});
	onTestFinished(() => session.stop());

	const url = `http://${session.ip}:${session.port}`;

	// Wait for the dev session to be ready
	await vi.waitFor(async () => {
		const resposne = await fetch(url);
		expect(resposne.status).not.toBeGreaterThan(500);
	}, waitForTimeout);

	return url;
}

async function setupPlatformProxy(config: string, devRegistryPath?: string) {
	vi.stubEnv("WRANGLER_REGISTRY_PATH", devRegistryPath);

	onTestFinished(() => {
		vi.unstubAllEnvs();
	});

	const wrangler = await import("wrangler");
	const proxy = await wrangler.getPlatformProxy<Record<string, any>>({
		configPath: config,
	});

	onTestFinished(() => proxy.dispose());

	return proxy;
}

describe("Dev Registry: wrangler dev <-> wrangler dev", () => {
	it("supports service worker fetch over service binding", async ({
		devRegistryPath,
	}) => {
		const exportedHandler = await runWranglerDev(
			"wrangler.exported-handler.jsonc",
			devRegistryPath
		);

		// Test fallback service before service-worker is started
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "service-worker",
				"test-method": "fetch",
			});
			const response = await fetch(`${exportedHandler}?${searchParams}`);

			expect({
				status: response.status,
				body: await response.text(),
			}).toEqual({
				status: 503,
				body: `Couldn't find a local dev session for the "default" entrypoint of service "service-worker" to proxy to`,
			});
		}, waitForTimeout);

		await runWranglerDev("wrangler.service-worker.jsonc", devRegistryPath);

		// Test exported-handler -> service worker
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "service-worker",
				"test-method": "fetch",
			});
			const response = await fetch(`${exportedHandler}?${searchParams}`);

			expect(await response.text()).toBe("Hello from service worker!");
			expect(response.status).toBe(200);
		}, waitForTimeout);
	});

	it("supports exported handler fetch over service binding", async ({
		devRegistryPath,
	}) => {
		const singleWorkerWithAssets = await runWranglerDev(
			"wrangler.worker-entrypoint-with-assets.jsonc",
			devRegistryPath
		);

		// Test fallback before exported-handler is started
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "exported-handler",
				"test-method": "fetch",
			});
			const response = await fetch(`${singleWorkerWithAssets}?${searchParams}`);

			expect({
				status: response.status,
				body: await response.text(),
			}).toEqual({
				status: 503,
				body: `Couldn't find a local dev session for the "default" entrypoint of service "exported-handler" to proxy to`,
			});
		}, waitForTimeout);

		const multiWorkers = await runWranglerDev(
			["wrangler.exported-handler.jsonc", "wrangler.worker-entrypoint.jsonc"],
			devRegistryPath
		);

		// Test multi workers -> single worker
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "worker-entrypoint-with-assets",
				"test-method": "fetch",
			});
			const response = await fetch(`${multiWorkers}?${searchParams}`);

			expect(await response.text()).toBe("Hello from Worker Entrypoint!");
			expect(response.status).toBe(200);

			// Test fetching asset from "worker-entrypoint-with-assets" over service binding
			// Exported handler has no assets, so it will hit the user worker and
			// forward the request to "worker-entrypoint-with-assets" with the asset path
			const assetResponse = await fetch(
				`${multiWorkers}/example.txt?${searchParams}`
			);
			expect(await assetResponse.text()).toBe("This is an example asset file");
		}, waitForTimeout);

		// Test single worker -> multi workers
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "exported-handler",
				"test-method": "fetch",
			});
			const response = await fetch(`${singleWorkerWithAssets}?${searchParams}`);

			expect(await response.text()).toEqual("Hello from exported handler!");
			expect(response.status).toBe(200);
		}, waitForTimeout);

		// Test single worker -> named entrypoint
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "named-entrypoint",
				"test-method": "fetch",
			});
			const response = await fetch(`${singleWorkerWithAssets}?${searchParams}`);

			expect(await response.text()).toEqual("Hello from Named Entrypoint!");
			expect(response.status).toBe(200);
		}, waitForTimeout);

		// Test multi workers -> named entrypoint with assets
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "named-entrypoint-with-assets",
				"test-method": "fetch",
			});
			const response = await fetch(`${multiWorkers}?${searchParams}`);

			expect(await response.text()).toEqual("Hello from Named Entrypoint!");
			expect(response.status).toBe(200);
		}, waitForTimeout);
	});

	it("supports RPC over service binding", async ({ devRegistryPath }) => {
		const multiWorkers = await runWranglerDev(
			[
				"wrangler.worker-entrypoint.jsonc",
				"wrangler.internal-durable-object.jsonc",
			],
			devRegistryPath
		);

		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "worker-entrypoint-with-assets",
				"test-method": "rpc",
			});
			const response = await fetch(`${multiWorkers}?${searchParams}`);

			expect(response.status).toBe(500);
			expect(await response.text()).toEqual(
				`Cannot access "ping" as we couldn't find a local dev session for the "default" entrypoint of service "worker-entrypoint-with-assets" to proxy to.`
			);
		}, waitForTimeout);

		const singleWorkerWithAssets = await runWranglerDev(
			"wrangler.worker-entrypoint-with-assets.jsonc",
			devRegistryPath
		);

		// Test RPC to default entrypoint
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "worker-entrypoint",
				"test-method": "rpc",
			});
			const response = await fetch(`${singleWorkerWithAssets}?${searchParams}`);

			expect(response.status).toBe(200);
			expect(await response.text()).toEqual("Pong");
		}, waitForTimeout);

		// Test RPC to default entrypoint with static assets
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "worker-entrypoint-with-assets",
				"test-method": "rpc",
			});
			const response = await fetch(`${multiWorkers}?${searchParams}`);

			expect(response.status).toBe(200);
			expect(await response.text()).toEqual("Pong");
		}, waitForTimeout);

		// Test RPC to named entrypoint
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "named-entrypoint",
				"test-method": "rpc",
			});
			const response = await fetch(`${singleWorkerWithAssets}?${searchParams}`);

			expect(response.status).toBe(200);
			expect(await response.text()).toEqual("Pong from Named Entrypoint");
		}, waitForTimeout);

		// Test RPC to named entrypoint with static assets
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "named-entrypoint-with-assets",
				"test-method": "rpc",
			});
			const response = await fetch(`${multiWorkers}?${searchParams}`);

			expect(response.status).toBe(200);
			expect(await response.text()).toEqual("Pong from Named Entrypoint");
		}, waitForTimeout);
	});

	it("supports fetch over durable object binding", async ({
		devRegistryPath,
	}) => {
		const externalDurableObject = await runWranglerDev(
			"wrangler.external-durable-object.jsonc",
			devRegistryPath
		);

		// Test fallback before internal durable object is started
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "durable-object",
				"test-method": "fetch",
			});
			const response = await fetch(`${externalDurableObject}?${searchParams}`);

			expect(response.status).toBe(503);
			expect(await response.text()).toEqual("Service Unavailable");
		}, waitForTimeout);

		await runWranglerDev(
			[
				"wrangler.internal-durable-object.jsonc",
				"wrangler.exported-handler.jsonc",
			],
			devRegistryPath
		);

		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "durable-object",
				"test-method": "fetch",
			});
			const response = await fetch(`${externalDurableObject}?${searchParams}`);

			expect(response.status).toBe(200);
			expect(await response.text()).toEqual("Hello from Durable Object!");
		}, waitForTimeout);
	});

	it("supports RPC over durable object binding", async ({
		devRegistryPath,
	}) => {
		const externalDurableObject = await runWranglerDev(
			[
				"wrangler.external-durable-object.jsonc",
				"wrangler.exported-handler.jsonc",
			],
			devRegistryPath
		);

		// Test RPC fallback before internal durable object is started
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "durable-object",
				"test-method": "rpc",
			});
			const response = await fetch(`${externalDurableObject}?${searchParams}`);

			expect({
				status: response.status,
				body: await response.text(),
			}).toEqual({
				status: 500,
				body: 'Cannot access "TestObject#ping" as Durable Object RPC is not yet supported between multiple dev sessions.',
			});
		}, waitForTimeout);

		await runWranglerDev(
			"wrangler.internal-durable-object.jsonc",
			devRegistryPath
		);

		// Test RPC after internal durable object is started (should still fail)
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "durable-object",
				"test-method": "rpc",
			});
			const response = await fetch(`${externalDurableObject}?${searchParams}`);

			expect(response.status).toBe(500);
			expect(await response.text()).toEqual(
				'Cannot access "TestObject#ping" as Durable Object RPC is not yet supported between multiple dev sessions.'
			);
		}, waitForTimeout);
	});

	it("supports tail handler", async ({ devRegistryPath }) => {
		const exportedHandlerWithAssets = await runWranglerDev(
			"wrangler.exported-handler-with-assets.jsonc",
			devRegistryPath
		);
		const workerEntrypoint = await runWranglerDev(
			[
				"wrangler.worker-entrypoint.jsonc",
				"wrangler.internal-durable-object.jsonc",
			],
			devRegistryPath
		);

		const searchParams = new URLSearchParams({
			"test-method": "tail",
		});

		await vi.waitFor(async () => {
			// Trigger tail handler of worker-entrypoint via exported handler
			await fetch(`${exportedHandlerWithAssets}?${searchParams}`, {
				method: "POST",
				body: JSON.stringify(["hello world", "this is the 2nd log"]),
			});
			await fetch(`${exportedHandlerWithAssets}?${searchParams}`, {
				method: "POST",
				body: JSON.stringify(["some other log"]),
			});

			const response = await fetch(`${workerEntrypoint}?${searchParams}`);

			expect(await response.json()).toEqual({
				worker: "Worker Entrypoint",
				tailEvents: expect.arrayContaining([
					[["[exported-handler]"], ["hello world", "this is the 2nd log"]],
					[["[exported-handler]"], ["some other log"]],
				]),
			});
		}, waitForTimeout);

		await vi.waitFor(async () => {
			// Trigger tail handler of exported-handler via worker-entrypoint
			await fetch(`${workerEntrypoint}?${searchParams}`, {
				method: "POST",
				body: JSON.stringify(["hello from test"]),
			});
			await fetch(`${workerEntrypoint}?${searchParams}`, {
				method: "POST",
				body: JSON.stringify(["yet another log", "and another one"]),
			});
			const response = await fetch(
				`${exportedHandlerWithAssets}?${searchParams}`
			);

			expect(await response.json()).toEqual({
				worker: "exported-handler",
				tailEvents: expect.arrayContaining([
					[
						["[worker-entrypoint]", "[Worker Entrypoint]"],
						["[worker-entrypoint]", "hello from test"],
					],
					[
						["[worker-entrypoint]", "[Worker Entrypoint]"],
						["[worker-entrypoint]", "yet another log", "and another one"],
					],
				]),
			});
		}, waitForTimeout);
	});
});

describe("Dev Registry: vite dev <-> vite dev", () => {
	it("supports exported handler fetch over service binding", async ({
		devRegistryPath,
	}) => {
		const workerEntrypointWithAssets = await runViteDev(
			"vite.worker-entrypoint-with-assets.config.ts",
			devRegistryPath
		);
		await runViteDev("vite.worker-entrypoint.config.ts", devRegistryPath);

		// Test fallback before exported-handler is started
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "exported-handler",
				"test-method": "fetch",
			});
			const response = await fetch(
				`${workerEntrypointWithAssets}?${searchParams}`
			);

			expect(response.status).toBe(503);
			expect(await response.text()).toEqual(
				`Couldn't find a local dev session for the "default" entrypoint of service "exported-handler" to proxy to`
			);
		}, waitForTimeout);

		const exportedHandler = await runViteDev(
			"vite.exported-handler.config.ts",
			devRegistryPath
		);

		// Test exported-handler -> worker-entrypoint-with-assets
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "worker-entrypoint-with-assets",
				"test-method": "fetch",
			});
			const response = await fetch(`${exportedHandler}?${searchParams}`);

			expect(await response.text()).toBe("Hello from Worker Entrypoint!");
			expect(response.status).toBe(200);

			// Test fetching asset from "worker-entrypoint-with-assets" over service binding
			// Exported handler has no assets, so it will hit the user worker and
			// forward the request to "worker-entrypoint-with-assets" with the asset path
			const assetResponse = await fetch(
				`${exportedHandler}/example.txt?${searchParams}`
			);
			expect(await assetResponse.text()).toBe("This is an example asset file");
		}, waitForTimeout);

		// Test worker-entrypoint-with-assets -> exported-handler
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "exported-handler",
				"test-method": "fetch",
			});
			const response = await fetch(
				`${workerEntrypointWithAssets}?${searchParams}`
			);

			expect(await response.text()).toEqual("Hello from exported handler!");
			expect(response.status).toBe(200);
		}, waitForTimeout);

		// Test exported-handler -> named-entrypoint
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "named-entrypoint",
				"test-method": "fetch",
			});
			const response = await fetch(`${exportedHandler}?${searchParams}`);

			expect(await response.text()).toEqual("Hello from Named Entrypoint!");
			expect(response.status).toBe(200);
		}, waitForTimeout);

		// Test exported-handler -> named-entrypoint-with-assets
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "named-entrypoint-with-assets",
				"test-method": "fetch",
			});
			const response = await fetch(`${exportedHandler}?${searchParams}`);

			expect(await response.text()).toEqual("Hello from Named Entrypoint!");
			expect(response.status).toBe(200);
		}, waitForTimeout);
	});

	it("supports RPC over service binding", async ({ devRegistryPath }) => {
		const exportedHandler = await runViteDev(
			"vite.exported-handler.config.ts",
			devRegistryPath
		);
		await runViteDev("vite.worker-entrypoint.config.ts", devRegistryPath);

		// Test fallback before worker-entrypoint-with-assets is started
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "worker-entrypoint-with-assets",
				"test-method": "rpc",
			});
			const response = await fetch(`${exportedHandler}?${searchParams}`);

			expect(response.status).toBe(500);
			expect(await response.text()).toEqual(
				`Cannot access "ping" as we couldn't find a local dev session for the "default" entrypoint of service "worker-entrypoint-with-assets" to proxy to.`
			);
		}, waitForTimeout);

		await runViteDev(
			"vite.worker-entrypoint-with-assets.config.ts",
			devRegistryPath
		);

		// Test exported-handler -> worker-entrypoint RPC
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "worker-entrypoint",
				"test-method": "rpc",
			});
			const response = await fetch(`${exportedHandler}?${searchParams}`);

			expect(response.status).toBe(200);
			expect(await response.text()).toEqual("Pong");
		}, waitForTimeout);

		// Test exported-handler -> worker-entrypoint-with-assets RPC
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "worker-entrypoint-with-assets",
				"test-method": "rpc",
			});
			const response = await fetch(`${exportedHandler}?${searchParams}`);

			expect(response.status).toBe(200);
			expect(await response.text()).toEqual("Pong");
		}, waitForTimeout);

		// Test exported-handler -> named-entrypoint RPC
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "named-entrypoint",
				"test-method": "rpc",
			});
			const response = await fetch(`${exportedHandler}?${searchParams}`);

			expect(response.status).toBe(200);
			expect(await response.text()).toEqual("Pong from Named Entrypoint");
		}, waitForTimeout);

		// Test exported-handler -> named-entrypoint-with-assets RPC
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "named-entrypoint-with-assets",
				"test-method": "rpc",
			});
			const response = await fetch(`${exportedHandler}?${searchParams}`);

			expect(response.status).toBe(200);
			expect(await response.text()).toEqual("Pong from Named Entrypoint");
		}, waitForTimeout);
	});

	it("supports tail handler", async ({ devRegistryPath }) => {
		const exportedHandler = await runViteDev(
			"vite.exported-handler.config.ts",
			devRegistryPath
		);
		const workerEntrypointWithAssets = await runViteDev(
			"vite.worker-entrypoint-with-assets.config.ts",
			devRegistryPath
		);

		const searchParams = new URLSearchParams({
			"test-method": "tail",
		});

		await vi.waitFor(async () => {
			// Trigger tail handler of worker-entrypoint via exported-handler
			await fetch(`${exportedHandler}?${searchParams}`, {
				method: "POST",
				body: JSON.stringify(["hello world", "this is the 2nd log"]),
			});
			await fetch(`${exportedHandler}?${searchParams}`, {
				method: "POST",
				body: JSON.stringify(["some other log"]),
			});

			const response = await fetch(
				`${workerEntrypointWithAssets}?${searchParams}`
			);

			expect(await response.json()).toEqual({
				worker: "Worker Entrypoint",
				tailEvents: expect.arrayContaining([
					[["[exported-handler]"], ["hello world", "this is the 2nd log"]],
					[["[exported-handler]"], ["some other log"]],
				]),
			});
		});

		await vi.waitFor(async () => {
			// Trigger tail handler of exported-handler via worker-entrypoint
			await fetch(`${workerEntrypointWithAssets}?${searchParams}`, {
				method: "POST",
				body: JSON.stringify(["hello from test"]),
			});
			await fetch(`${workerEntrypointWithAssets}?${searchParams}`, {
				method: "POST",
				body: JSON.stringify(["yet another log", "and another one"]),
			});

			const response = await fetch(`${exportedHandler}?${searchParams}`);

			expect(await response.json()).toEqual({
				worker: "exported-handler",
				tailEvents: expect.arrayContaining([
					[["[Worker Entrypoint]"], ["hello from test"]],
					[["[Worker Entrypoint]"], ["yet another log", "and another one"]],
				]),
			});
		}, waitForTimeout);
	});
});

describe("Dev Registry: vite dev <-> wrangler dev", () => {
	it("uses the same dev registry path by default", async () => {
		const workerEntrypoint = await runViteDev(
			"vite.worker-entrypoint.config.ts"
		);
		const exportedHandler = await runWranglerDev(
			"wrangler.exported-handler.jsonc"
		);

		// Test wrangler dev -> vite dev yet
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "worker-entrypoint",
				"test-method": "fetch",
			});
			const response = await fetch(`${exportedHandler}?${searchParams}`);
			expect(await response.text()).toBe("Hello from Worker Entrypoint!");
			expect(response.status).toBe(200);
		}, waitForTimeout);

		// Test vite dev -> wrangler dev
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "exported-handler",
				"test-method": "fetch",
			});
			const response = await fetch(`${workerEntrypoint}?${searchParams}`);
			expect(await response.text()).toBe("Hello from exported handler!");
			expect(response.status).toBe(200);
		}, waitForTimeout);
	});

	it("supports exported handler fetch over service binding", async ({
		devRegistryPath,
	}) => {
		const workerEntrypoint = await runViteDev(
			"vite.worker-entrypoint.config.ts",
			devRegistryPath
		);

		// Test fallback service before exported-handler is started
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "exported-handler",
				"test-method": "fetch",
			});
			const response = await fetch(`${workerEntrypoint}?${searchParams}`);

			expect(await response.text()).toEqual(
				`Couldn't find a local dev session for the "default" entrypoint of service "exported-handler" to proxy to`
			);
			expect(response.status).toBe(503);
		}, waitForTimeout);

		const exportedHandler = await runWranglerDev(
			"wrangler.exported-handler.jsonc",
			devRegistryPath
		);

		// Test wrangler dev -> vite dev yet
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "worker-entrypoint",
				"test-method": "fetch",
			});
			const response = await fetch(`${exportedHandler}?${searchParams}`);
			expect(await response.text()).toBe("Hello from Worker Entrypoint!");
			expect(response.status).toBe(200);
		}, waitForTimeout);

		// Test vite dev -> wrangler dev
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "exported-handler",
				"test-method": "fetch",
			});
			const response = await fetch(`${workerEntrypoint}?${searchParams}`);
			expect(await response.text()).toBe("Hello from exported handler!");
			expect(response.status).toBe(200);
		}, waitForTimeout);
	});

	it("supports service worker fetch over service binding", async ({
		devRegistryPath,
	}) => {
		const viteDevURL = await runViteDev(
			"vite.exported-handler.config.ts",
			devRegistryPath
		);

		// Test fallback before exported-handler is started
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "service-worker",
				"test-method": "fetch",
			});
			const response = await fetch(`${viteDevURL}?${searchParams}`);

			expect(response.status).toBe(503);
			expect(await response.text()).toEqual(
				`Couldn't find a local dev session for the "default" entrypoint of service "service-worker" to proxy to`
			);
		}, waitForTimeout);

		await runWranglerDev(
			["wrangler.service-worker.jsonc", "wrangler.worker-entrypoint.jsonc"],
			devRegistryPath
		);

		// Test vite dev -> wrangler dev
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "service-worker",
				"test-method": "fetch",
			});
			const response = await fetch(`${viteDevURL}?${searchParams}`);
			expect(await response.text()).toEqual("Hello from service worker!");
			expect(response.status).toBe(200);
		}, waitForTimeout);
	});

	it("supports RPC over service binding", async ({ devRegistryPath }) => {
		const workerEntrypoint = await runViteDev(
			"vite.worker-entrypoint.config.ts",
			devRegistryPath
		);

		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "worker-entrypoint-with-assets",
				"test-method": "rpc",
			});
			const response = await fetch(`${workerEntrypoint}?${searchParams}`);
			expect(response.status).toBe(500);
			expect(await response.text()).toEqual(
				`Cannot access "ping" as we couldn't find a local dev session for the "default" entrypoint of service "worker-entrypoint-with-assets" to proxy to.`
			);
		}, waitForTimeout);

		const workerEntrypointWithAssets = await runWranglerDev(
			"wrangler.worker-entrypoint-with-assets.jsonc",
			devRegistryPath
		);

		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "worker-entrypoint",
				"test-method": "rpc",
			});
			const response = await fetch(
				`${workerEntrypointWithAssets}?${searchParams}`
			);
			expect(await response.text()).toEqual("Pong");
			expect(response.status).toBe(200);
		}, waitForTimeout);

		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "worker-entrypoint-with-assets",
				"test-method": "rpc",
			});
			const response = await fetch(`${workerEntrypoint}?${searchParams}`);
			expect(await response.text()).toEqual("Pong");
			expect(response.status).toBe(200);
		}, waitForTimeout);
	});

	it("supports tail handler", async ({ devRegistryPath }) => {
		const exportedHandlerWithStaticAssets = await runViteDev(
			"vite.exported-handler-with-assets.config.ts",
			devRegistryPath
		);
		const workerEntrypoint = await runWranglerDev(
			"wrangler.worker-entrypoint.jsonc",
			devRegistryPath
		);

		const searchParams = new URLSearchParams({
			"test-method": "tail",
		});

		await vi.waitFor(async () => {
			// Trigger tail handler of worker-entrypoint via exported-handler
			await fetch(`${exportedHandlerWithStaticAssets}?${searchParams}`, {
				method: "POST",
				body: JSON.stringify(["hello world", "this is the 2nd log"]),
			});
			await fetch(`${exportedHandlerWithStaticAssets}?${searchParams}`, {
				method: "POST",
				body: JSON.stringify(["some other log"]),
			});

			const response = await fetch(`${workerEntrypoint}?${searchParams}`);

			expect(await response.json()).toEqual({
				worker: "Worker Entrypoint",
				tailEvents: expect.arrayContaining([
					[["[exported-handler]"], ["hello world", "this is the 2nd log"]],
					[["[exported-handler]"], ["some other log"]],
				]),
			});
		}, waitForTimeout);

		await vi.waitFor(async () => {
			// Trigger tail handler of exported-handler via worker-entrypoint
			await fetch(`${workerEntrypoint}?${searchParams}`, {
				method: "POST",
				body: JSON.stringify(["hello from test"]),
			});
			await fetch(`${workerEntrypoint}?${searchParams}`, {
				method: "POST",
				body: JSON.stringify(["yet another log", "and another one"]),
			});

			const response = await fetch(
				`${exportedHandlerWithStaticAssets}?${searchParams}`
			);

			expect(await response.json()).toEqual({
				worker: "exported-handler",
				tailEvents: expect.arrayContaining([
					[["[Worker Entrypoint]"], ["hello from test"]],
					[["[Worker Entrypoint]"], ["yet another log", "and another one"]],
				]),
			});
		}, waitForTimeout);
	});
});

describe("Dev Registry: getPlatformProxy -> wrangler / vite dev", () => {
	it("supports fetch over service binding", async ({ devRegistryPath }) => {
		const { env } = await setupPlatformProxy(
			"wrangler.worker-entrypoint.jsonc",
			devRegistryPath
		);

		await vi.waitFor(async () => {
			const response =
				await env.WORKER_ENTRYPOINT_WITH_ASSETS.fetch("http://localhost");

			expect(response.status).toBe(503);
			expect(await response.text()).toEqual(
				`Couldn't find a local dev session for the "default" entrypoint of service "worker-entrypoint-with-assets" to proxy to`
			);
		}, waitForTimeout);

		await vi.waitFor(async () => {
			const response = await env.EXPORTED_HANDLER.fetch("http://localhost");

			expect(response.status).toBe(503);
			expect(await response.text()).toEqual(
				`Couldn't find a local dev session for the "default" entrypoint of service "exported-handler" to proxy to`
			);
		}, waitForTimeout);

		await runViteDev(
			"vite.worker-entrypoint-with-assets.config.ts",
			devRegistryPath
		);

		await vi.waitFor(async () => {
			const response =
				await env.WORKER_ENTRYPOINT_WITH_ASSETS.fetch("http://localhost");

			expect(await response.text()).toEqual("Hello from Worker Entrypoint!");
			expect(response.status).toBe(200);
		}, waitForTimeout);

		await vi.waitFor(async () => {
			const response = await env.EXPORTED_HANDLER.fetch("http://localhost");

			expect(response.status).toBe(503);
			expect(await response.text()).toEqual(
				`Couldn't find a local dev session for the "default" entrypoint of service "exported-handler" to proxy to`
			);
		}, waitForTimeout);

		await runWranglerDev("wrangler.exported-handler.jsonc", devRegistryPath);

		await vi.waitFor(async () => {
			const response = await env.EXPORTED_HANDLER.fetch("http://localhost");

			expect(await response.text()).toEqual("Hello from exported handler!");
			expect(response.status).toBe(200);
		}, waitForTimeout);

		await vi.waitFor(async () => {
			const response =
				await env.WORKER_ENTRYPOINT_WITH_ASSETS.fetch("http://localhost");

			expect(await response.text()).toEqual("Hello from Worker Entrypoint!");
			expect(response.status).toBe(200);
		}, waitForTimeout);
	});

	it("supports RPC over service binding", async ({ devRegistryPath }) => {
		const { env } = await setupPlatformProxy(
			"wrangler.exported-handler.jsonc",
			devRegistryPath
		);

		expect(() =>
			env.WORKER_ENTRYPOINT.ping()
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Cannot access "ping" as we couldn't find a local dev session for the "default" entrypoint of service "worker-entrypoint" to proxy to.]`
		);

		expect(() =>
			env.WORKER_ENTRYPOINT_WITH_ASSETS.ping()
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Cannot access "ping" as we couldn't find a local dev session for the "default" entrypoint of service "worker-entrypoint-with-assets" to proxy to.]`
		);

		await runViteDev("vite.worker-entrypoint.config.ts", devRegistryPath);

		await vi.waitFor(async () => {
			const result = await env.WORKER_ENTRYPOINT.ping();
			expect(result).toBe("Pong");
		}, waitForTimeout);

		await runWranglerDev(
			[
				"wrangler.worker-entrypoint-with-assets.jsonc",
				"wrangler.internal-durable-object.jsonc",
			],
			devRegistryPath
		);

		await vi.waitFor(async () => {
			const result = await env.WORKER_ENTRYPOINT_WITH_ASSETS.ping();

			expect(result).toBe("Pong");
		}, waitForTimeout);
	});

	it("supports fetch over durable object binding", async ({
		devRegistryPath,
	}) => {
		const { env } = await setupPlatformProxy(
			"wrangler.external-durable-object.jsonc",
			devRegistryPath
		);
		const id = env.DURABLE_OBJECT.newUniqueId();
		const stub = env.DURABLE_OBJECT.get(id);

		await vi.waitFor(async () => {
			const response = await stub.fetch("http://localhost");
			expect(response.status).toBe(503);
			expect(await response.text()).toEqual("Service Unavailable");
		}, waitForTimeout);

		await runWranglerDev(
			"wrangler.internal-durable-object.jsonc",
			devRegistryPath
		);

		await vi.waitFor(async () => {
			const response = await stub.fetch("http://localhost");

			expect(response.status).toBe(200);
			expect(await response.text()).toEqual("Hello from Durable Object!");
		}, waitForTimeout);
	});

	it("supports RPC over durable object binding", async ({
		devRegistryPath,
	}) => {
		const { env } = await setupPlatformProxy(
			"wrangler.external-durable-object.jsonc",
			devRegistryPath
		);
		const id = env.DURABLE_OBJECT.newUniqueId();
		const stub = env.DURABLE_OBJECT.get(id);

		expect(() => stub.ping()).toThrowErrorMatchingInlineSnapshot(
			`[Error: Cannot access "TestObject#ping" as Durable Object RPC is not yet supported between multiple dev sessions.]`
		);
		await runWranglerDev(
			"wrangler.internal-durable-object.jsonc",
			devRegistryPath
		);

		expect(() => stub.ping()).toThrowErrorMatchingInlineSnapshot(
			`[Error: Cannot access "TestObject#ping" as Durable Object RPC is not yet supported between multiple dev sessions.]`
		);
	});
});
