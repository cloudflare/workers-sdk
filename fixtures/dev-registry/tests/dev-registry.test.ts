import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { resolve } from "node:path";
import { describe, expect, onTestFinished, test, vi } from "vitest";
import {
	runLongLived,
	waitForReady,
} from "../../../packages/vite-plugin-cloudflare/e2e/helpers";
import { runWranglerDev as baseRunWranglerDev } from "../../shared/src/run-wrangler-long-lived";

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

	return url;
}

async function runWranglerDev(
	config: string,
	devRegistryPath?: string
): Promise<string> {
	const session = await baseRunWranglerDev(
		cwd,
		["--port=0", "--inspector-port=0", `--config=${config}`],
		{ WRANGLER_REGISTRY_PATH: devRegistryPath }
	);

	onTestFinished(() => session.stop());

	return `http://${session.ip}:${session.port}`;
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

describe("Dev Registry: vite dev <-> vite dev", () => {
	it("supports module worker fetch over service binding", async ({
		devRegistryPath,
	}) => {
		const workerEntrypointB = await runViteDev(
			"vite.worker-entrypoint-b.config.ts",
			devRegistryPath
		);

		// Test fallback service before module-worker is started
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "module-worker",
				"test-method": "fetch",
			});
			const response = await fetch(`${workerEntrypointB}?${searchParams}`);

			expect(response.status).toBe(503);
			expect(await response.text()).toEqual(
				`Couldn't find a local dev session for the "default" entrypoint of service "module-worker" to proxy to`
			);
		});

		const moduleWorker = await runViteDev(
			"vite.module-worker.config.ts",
			devRegistryPath
		);

		// Test module-worker -> worker-entrypoint
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "worker-entrypoint-b",
				"test-method": "fetch",
			});
			const response = await fetch(`${moduleWorker}?${searchParams}`);

			expect(await response.text()).toBe("Hello from Worker Entrypoint!");
			expect(response.status).toBe(200);

			// Test fetching asset from "worker-entrypoint-b" over service binding
			// Module worker has no assets, so it will hit the user worker and
			// forward the request to "worker-entrypoint-b" with the asset path
			const assetResponse = await fetch(
				`${moduleWorker}/example.txt?${searchParams}`
			);
			expect(await assetResponse.text()).toBe("This is an example asset file");
		});

		// Test worker-entrypoint -> module-worker
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "module-worker",
				"test-method": "fetch",
			});
			const response = await fetch(`${workerEntrypointB}?${searchParams}`);

			expect(await response.text()).toEqual("Hello from Module Worker!");
			expect(response.status).toBe(200);
		});
	});

	it("supports RPC over service binding", async ({ devRegistryPath }) => {
		const workerEntrypointA = await runViteDev(
			"vite.worker-entrypoint-a.config.ts",
			devRegistryPath
		);

		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "worker-entrypoint-b",
				"test-method": "rpc",
			});
			const response = await fetch(`${workerEntrypointA}?${searchParams}`);

			expect(response.status).toBe(500);
			expect(await response.text()).toEqual(
				`Cannot access "ping" as we couldn't find a local dev session for the "default" entrypoint of service "worker-entrypoint-b" to proxy to.`
			);
		});

		const workerEntrypointB = await runViteDev(
			"vite.worker-entrypoint-b.config.ts",
			devRegistryPath
		);

		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "worker-entrypoint-a",
				"test-method": "rpc",
			});
			const response = await fetch(`${workerEntrypointB}?${searchParams}`);

			expect(response.status).toBe(200);
			expect(await response.text()).toEqual("Pong");
		});

		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "worker-entrypoint-b",
				"test-method": "rpc",
			});
			const response = await fetch(`${workerEntrypointA}?${searchParams}`);

			expect(response.status).toBe(200);
			expect(await response.text()).toEqual("Pong");
		});
	});

	it("supports tail handler", async ({ devRegistryPath }) => {
		const moduleWorker = await runViteDev(
			"vite.module-worker.config.ts",
			devRegistryPath
		);
		const workerEntrypointA = await runViteDev(
			"vite.worker-entrypoint-a.config.ts",
			devRegistryPath
		);

		const searchParams = new URLSearchParams({
			"test-method": "tail",
		});
		// Trigger tail handler of worker-entrypoint via module-worker
		await fetch(`${moduleWorker}?${searchParams}`, {
			method: "POST",
			body: JSON.stringify(["hello world", "this is the 2nd log"]),
		});
		await fetch(`${moduleWorker}?${searchParams}`, {
			method: "POST",
			body: JSON.stringify(["some other log"]),
		});

		await vi.waitFor(async () => {
			const response = await fetch(`${workerEntrypointA}?${searchParams}`);

			expect(await response.json()).toEqual({
				worker: "Worker Entrypoint",
				tailEvents: [
					[["[Module Worker]"], ["hello world", "this is the 2nd log"]],
					[["[Module Worker]"], ["some other log"]],
				],
			});
		});

		// Trigger tail handler of module-worker via worker-entrypoint
		await fetch(`${workerEntrypointA}?${searchParams}`, {
			method: "POST",
			body: JSON.stringify(["hello from test"]),
		});
		await fetch(`${workerEntrypointA}?${searchParams}`, {
			method: "POST",
			body: JSON.stringify(["yet another log", "and another one"]),
		});

		await vi.waitFor(async () => {
			const response = await fetch(`${moduleWorker}?${searchParams}`);

			expect(await response.json()).toEqual({
				worker: "Module Worker",
				tailEvents: [
					[["[Worker Entrypoint]"], ["hello from test"]],
					[["[Worker Entrypoint]"], ["yet another log", "and another one"]],
				],
			});
		});
	});
});

describe("Dev Registry: vite dev <-> wrangler dev", () => {
	it("uses the same dev registry path by default", async () => {
		const workerEntrypointA = await runViteDev(
			"vite.worker-entrypoint-a.config.ts"
		);
		const moduleWorker = await runWranglerDev("wrangler.module-worker.jsonc");

		// Test wrangler dev -> vite dev yet
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "worker-entrypoint-a",
				"test-method": "fetch",
			});
			const response = await fetch(`${moduleWorker}?${searchParams}`);
			expect(await response.text()).toBe("Hello from Worker Entrypoint!");
			expect(response.status).toBe(200);
		});

		// Test vite dev -> wrangler dev
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "module-worker",
				"test-method": "fetch",
			});
			const response = await fetch(`${workerEntrypointA}?${searchParams}`);
			expect(await response.text()).toBe("Hello from Module Worker!");
			expect(response.status).toBe(200);
		});
	});

	it("supports module worker fetch over service binding", async ({
		devRegistryPath,
	}) => {
		const workerEntrypointA = await runViteDev(
			"vite.worker-entrypoint-a.config.ts",
			devRegistryPath
		);

		// Test fallback service before module-worker is started
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "module-worker",
				"test-method": "fetch",
			});
			const response = await fetch(`${workerEntrypointA}?${searchParams}`);

			expect(await response.text()).toEqual(
				`Couldn't find a local dev session for the "default" entrypoint of service "module-worker" to proxy to`
			);
			expect(response.status).toBe(503);
		});

		const moduleWorker = await runWranglerDev(
			"wrangler.module-worker.jsonc",
			devRegistryPath
		);

		// Test wrangler dev -> vite dev yet
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "worker-entrypoint-a",
				"test-method": "fetch",
			});
			const response = await fetch(`${moduleWorker}?${searchParams}`);
			expect(await response.text()).toBe("Hello from Worker Entrypoint!");
			expect(response.status).toBe(200);
		});

		// Test vite dev -> wrangler dev
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "module-worker",
				"test-method": "fetch",
			});
			const response = await fetch(`${workerEntrypointA}?${searchParams}`);
			expect(await response.text()).toBe("Hello from Module Worker!");
			expect(response.status).toBe(200);
		});
	});

	it("supports service worker fetch over service binding", async ({
		devRegistryPath,
	}) => {
		const viteDevURL = await runViteDev(
			"vite.module-worker.config.ts",
			devRegistryPath
		);

		// Test fallback service before module-worker is started
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
		});

		await runWranglerDev("wrangler.service-worker.jsonc", devRegistryPath);

		// Test vite dev -> wrangler dev
		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "service-worker",
				"test-method": "fetch",
			});
			const response = await fetch(`${viteDevURL}?${searchParams}`);
			expect(await response.text()).toEqual("Hello from service worker!");
			expect(response.status).toBe(200);
		});
	});

	it("supports RPC over service binding", async ({ devRegistryPath }) => {
		const workerEntrypointA = await runViteDev(
			"vite.worker-entrypoint-a.config.ts",
			devRegistryPath
		);

		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "worker-entrypoint-b",
				"test-method": "rpc",
			});
			const response = await fetch(`${workerEntrypointA}?${searchParams}`);
			expect(response.status).toBe(500);
			expect(await response.text()).toEqual(
				`Cannot access "ping" as we couldn't find a local dev session for the "default" entrypoint of service "worker-entrypoint-b" to proxy to.`
			);
		});

		const workerEntrypointB = await runWranglerDev(
			"wrangler.worker-entrypoint-b.jsonc",
			devRegistryPath
		);

		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "worker-entrypoint-a",
				"test-method": "rpc",
			});
			const response = await fetch(`${workerEntrypointB}?${searchParams}`);
			expect(await response.text()).toEqual("Pong");
			expect(response.status).toBe(200);
		});

		await vi.waitFor(async () => {
			const searchParams = new URLSearchParams({
				"test-service": "worker-entrypoint-b",
				"test-method": "rpc",
			});
			const response = await fetch(`${workerEntrypointA}?${searchParams}`);
			expect(await response.text()).toEqual("Pong");
			expect(response.status).toBe(200);
		});
	});

	it("supports tail handler", async ({ devRegistryPath }) => {
		const moduleWorker = await runViteDev(
			"vite.module-worker.config.ts",
			devRegistryPath
		);
		const workerEntrypointA = await runWranglerDev(
			"wrangler.worker-entrypoint-a.jsonc",
			devRegistryPath
		);

		const searchParams = new URLSearchParams({
			"test-method": "tail",
		});
		// Trigger tail handler of worker-entrypoint via module-worker
		await fetch(`${moduleWorker}?${searchParams}`, {
			method: "POST",
			body: JSON.stringify(["hello world", "this is the 2nd log"]),
		});
		await fetch(`${moduleWorker}?${searchParams}`, {
			method: "POST",
			body: JSON.stringify(["some other log"]),
		});

		await vi.waitFor(async () => {
			const response = await fetch(`${workerEntrypointA}?${searchParams}`);

			expect(await response.json()).toEqual({
				worker: "Worker Entrypoint",
				tailEvents: [
					[["[Module Worker]"], ["hello world", "this is the 2nd log"]],
					[["[Module Worker]"], ["some other log"]],
				],
			});
		});

		// Trigger tail handler of module-worker via worker-entrypoint
		await fetch(`${workerEntrypointA}?${searchParams}`, {
			method: "POST",
			body: JSON.stringify(["hello from test"]),
		});
		await fetch(`${workerEntrypointA}?${searchParams}`, {
			method: "POST",
			body: JSON.stringify(["yet another log", "and another one"]),
		});

		await vi.waitFor(async () => {
			const response = await fetch(`${moduleWorker}?${searchParams}`);

			expect(await response.json()).toEqual({
				worker: "Module Worker",
				tailEvents: [
					[["[Worker Entrypoint]"], ["hello from test"]],
					[["[Worker Entrypoint]"], ["yet another log", "and another one"]],
				],
			});
		});
	});
});

describe("Dev Registry: getPlatformProxy -> wrangler / vite dev", () => {
	it("supports fetch over service binding", async ({ devRegistryPath }) => {
		const { env } = await setupPlatformProxy(
			"wrangler.worker-entrypoint-a.jsonc",
			devRegistryPath
		);

		await vi.waitFor(async () => {
			const response = await env.WORKER_ENTRYPOINT_B.fetch("http://localhost");

			expect(response.status).toBe(503);
			expect(await response.text()).toEqual(
				`Couldn't find a local dev session for the "default" entrypoint of service "worker-entrypoint-b" to proxy to`
			);
		});

		await vi.waitFor(async () => {
			const response = await env.MODULE_WORKER.fetch("http://localhost");

			expect(response.status).toBe(503);
			expect(await response.text()).toEqual(
				`Couldn't find a local dev session for the "default" entrypoint of service "module-worker" to proxy to`
			);
		});

		await runViteDev("vite.worker-entrypoint-b.config.ts", devRegistryPath);

		await vi.waitFor(async () => {
			const response = await env.WORKER_ENTRYPOINT_B.fetch("http://localhost");

			expect(await response.text()).toEqual("Hello from Worker Entrypoint!");
			expect(response.status).toBe(200);
		});

		await vi.waitFor(async () => {
			const response = await env.MODULE_WORKER.fetch("http://localhost");

			expect(response.status).toBe(503);
			expect(await response.text()).toEqual(
				`Couldn't find a local dev session for the "default" entrypoint of service "module-worker" to proxy to`
			);
		});

		await runWranglerDev("wrangler.module-worker.jsonc", devRegistryPath);

		await vi.waitFor(async () => {
			const response = await env.MODULE_WORKER.fetch("http://localhost");

			expect(await response.text()).toEqual("Hello from Module Worker!");
			expect(response.status).toBe(200);
		});

		await vi.waitFor(async () => {
			const response = await env.WORKER_ENTRYPOINT_B.fetch("http://localhost");

			expect(await response.text()).toEqual("Hello from Worker Entrypoint!");
			expect(response.status).toBe(200);
		});
	});

	it("supports RPC over service binding", async ({ devRegistryPath }) => {
		const { env } = await setupPlatformProxy(
			"wrangler.module-worker.jsonc",
			devRegistryPath
		);

		expect(() =>
			env.WORKER_ENTRYPOINT_A.ping()
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Cannot access "ping" as we couldn't find a local dev session for the "default" entrypoint of service "worker-entrypoint-a" to proxy to.]`
		);

		expect(() =>
			env.WORKER_ENTRYPOINT_B.ping()
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Cannot access "ping" as we couldn't find a local dev session for the "default" entrypoint of service "worker-entrypoint-b" to proxy to.]`
		);

		await runViteDev("vite.worker-entrypoint-a.config.ts", devRegistryPath);

		await vi.waitFor(async () => {
			const result = await env.WORKER_ENTRYPOINT_A.ping();
			expect(result).toBe("Pong");
		});

		await runWranglerDev("wrangler.worker-entrypoint-b.jsonc", devRegistryPath);

		await vi.waitFor(async () => {
			const result = await env.WORKER_ENTRYPOINT_B.ping();

			expect(result).toBe("Pong");
		});
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
		});

		await runWranglerDev(
			"wrangler.internal-durable-object.jsonc",
			devRegistryPath
		);

		await vi.waitFor(async () => {
			const response = await stub.fetch("http://localhost");

			expect(response.status).toBe(200);
			expect(await response.text()).toEqual("Hello from Durable Object!");
		});
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
			`[Error: Cannot access "ping" as Durable Object RPC is not yet supported between multiple dev sessions.]`
		);
		await runWranglerDev(
			"wrangler.internal-durable-object.jsonc",
			devRegistryPath
		);

		expect(() => stub.ping()).toThrowErrorMatchingInlineSnapshot(
			`[Error: Cannot access "ping" as Durable Object RPC is not yet supported between multiple dev sessions.]`
		);
	});
});
