import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { createServer } from "vite";
import { afterEach, describe, test, vi } from "vitest";
import type { ViteDevServer } from "vite";

const fixturesPath = fileURLToPath(
	new URL("./fixtures/hot-send", import.meta.url)
);

// The number of messages the fixture Worker sends during each request
const MESSAGE_COUNT = 5;

// Reference: https://github.com/cloudflare/workers-sdk/issues/16251
describe("import.meta.hot.send during a request", () => {
	let server: ViteDevServer | undefined;
	let address: string;
	let received: { pathname: string; i: number }[];

	afterEach(async () => {
		await server?.close();
		server = undefined;
	});

	async function startDevServer() {
		received = [];
		server = await createServer({
			root: fixturesPath,
			logLevel: "silent",
			plugins: [cloudflare({ inspectorPort: false, persistState: false })],
		});
		await server.listen();

		// Listen on the Worker's environment, as a plugin in a user's Vite
		// config would
		const environment = server.environments.ssr;
		if (!environment) {
			throw new Error("The `ssr` environment is undefined");
		}
		environment.hot.on("hot-send-test", (data) => {
			received.push(data as { pathname: string; i: number });
		});

		const url = server.resolvedUrls?.local[0];
		if (!url) {
			throw new Error("Server address is undefined");
		}
		address = url;
	}

	function receivedFor(pathname: string) {
		return received
			.filter((message) => message.pathname === pathname)
			.map((message) => message.i)
			.sort((a, b) => a - b);
	}

	const allMessages = Array.from({ length: MESSAGE_COUNT }, (_, i) => i);

	test.for([
		// The response has a body
		"/body",
		// The response has no body, and the request is kept alive by `waitUntil`
		"/empty-wait-until",
		// The response has no body, so the request ends as soon as it is sent
		"/empty",
	])("every message sent while handling %s reaches the Vite dev server", async (pathname, {
		expect,
	}) => {
		await startDevServer();

		const response = await fetch(new URL(pathname, address));
		await response.arrayBuffer();
		expect(response.ok).toBe(true);

		await vi.waitFor(
			() => {
				expect(receivedFor(pathname)).toEqual(allMessages);
			},
			{ timeout: 5000 }
		);
	});
});
