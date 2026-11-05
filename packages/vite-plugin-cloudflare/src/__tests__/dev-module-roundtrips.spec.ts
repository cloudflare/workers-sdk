import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { createServer } from "vite";
import { afterEach, describe, test } from "vitest";
import type { ViteDevServer } from "vite";
import type { CloudflareDevEnvironment } from "../cloudflare-environment";

const fixturesPath = fileURLToPath(
	new URL("./fixtures/durable-object-dev-roundtrips", import.meta.url)
);

describe("dev module round trips", () => {
	let server: ViteDevServer | undefined;

	afterEach(async () => {
		await server?.close();
		server = undefined;
	});

	// Reference: https://github.com/cloudflare/workers-sdk/issues/16533
	test("a warm module graph makes no `fetchModule` round trips on a request that changes no module", async ({
		expect,
	}) => {
		server = await createServer({
			root: fixturesPath,
			logLevel: "silent",
			plugins: [cloudflare({ inspectorPort: false, persistState: false })],
		});

		await server.listen();

		const address = server.resolvedUrls?.local[0];
		if (!address) {
			throw new Error("Server address is undefined");
		}

		// Warm the module graph: the first request evaluates the worker entry,
		// the Durable Object class and its instance.
		const warmResponse = await fetch(new URL("/counter", address));
		expect(warmResponse.ok).toBe(true);
		expect(await warmResponse.json()).toEqual({ count: 5 });

		// Count Node-side `fetchModule` invokes, the round trips the module
		// runner in workerd pays to the Vite dev server in Node.
		// The entry worker runs in the default `ssr` environment.
		const environment = server.environments.ssr as CloudflareDevEnvironment;
		const originalFetchModule = environment.fetchModule.bind(environment);
		const fetchedModuleIds: string[] = [];
		environment.fetchModule = (id, importer, options) => {
			fetchedModuleIds.push(id);
			return originalFetchModule(id, importer, options);
		};

		// Request the same route again without editing any file.
		const response = await fetch(new URL("/counter", address));
		expect(response.ok).toBe(true);
		expect(await response.json()).toEqual({ count: 5 });

		// With no module changed since the last request, no `fetchModule` round
		// trip should be needed, not one per Durable Object call.
		expect(fetchedModuleIds).toEqual([]);
	});
});
