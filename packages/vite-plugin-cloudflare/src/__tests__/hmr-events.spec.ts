import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { createServer } from "vite";
import { afterEach, describe, test } from "vitest";
import type { Plugin, ViteDevServer } from "vite";

const fixturesPath = fileURLToPath(new URL("./fixtures", import.meta.url));

describe("HMR events", () => {
	let server: ViteDevServer | undefined;

	afterEach(async () => {
		await server?.close();
		server = undefined;
	});

	// Reference: https://github.com/cloudflare/workers-sdk/issues/11063
	test("the environment handles early HMR events before runner initialization", async ({
		expect,
	}) => {
		// Create a plugin that triggers HMR events early in configureServer.
		// This mimics what vite-plugin-vue-devtools does - it sends HMR events
		// before the cloudflare plugin has had a chance to call initRunner().
		// Before the fix, this would crash with "AssertionError: The WebSocket is undefined"
		const earlyHmrPlugin: Plugin = {
			name: "early-hmr-plugin",
			configureServer(viteDevServer) {
				// Access the worker environment and try to send HMR events
				// BEFORE the cloudflare plugin has called initRunner()
				const workerEnv = viteDevServer.environments.my_worker;
				if (workerEnv) {
					workerEnv.hot.send("test-event", { data: "test" });
				}
			},
		};

		server = await createServer({
			root: fixturesPath,
			logLevel: "silent",
			plugins: [
				// Place the early HMR plugin BEFORE cloudflare to trigger HMR
				// events before the runner is initialized
				earlyHmrPlugin,
				cloudflare({ inspectorPort: false, persistState: false }),
			],
		});

		await server.listen();

		// Verify the server is responsive by making a request.
		const address = server.resolvedUrls?.local[0];
		if (!address) {
			throw new Error("Server address is undefined");
		}

		const response = await fetch(address);
		expect(response.ok).toBe(true);
	});
});
