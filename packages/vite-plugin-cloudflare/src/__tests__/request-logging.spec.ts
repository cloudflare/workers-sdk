import assert from "node:assert";
import { fileURLToPath } from "node:url";
import { createBuilder, createServer, preview } from "vite";
import type { Logger } from "vite";
import { describe, test } from "vitest";
import { cloudflare } from "@cloudflare/vite-plugin";

const fixturesPath = fileURLToPath(new URL("./fixtures", import.meta.url));

// Matches the ANSI escape codes Miniflare adds to its request log lines.
const ANSI_CODES = /\x1b\[[0-9;]*m/g;

function createCapturingLogger(): { logger: Logger; messages: string[] } {
	const messages: string[] = [];
	const logger: Logger = {
		info: (message) => messages.push(message),
		warn: (message) => messages.push(message),
		warnOnce: (message) => messages.push(message),
		error: (message) => messages.push(message),
		clearScreen: () => {},
		hasErrorLogged: () => false,
		hasWarned: false,
	};
	return { logger, messages };
}

/**
 * Miniflare's per-request log lines look like `GET / 200 OK (1ms)` once their
 * ANSI colour codes are stripped.
 */
function requestLines(messages: string[]): string[] {
	return messages.filter((message) =>
		/^GET \/\S* \d{3} .*\(\d+ms\)/.test(message.replace(ANSI_CODES, ""))
	);
}

/**
 * Request log lines are emitted asynchronously (via a `waitUntil` loopback
 * fetch), so give the buggy behaviour a chance to surface before asserting it
 * doesn't.
 */
async function waitForRequestLinesToSurface(messages: string[]) {
	const deadline = Date.now() + 3_000;
	while (Date.now() < deadline && requestLines(messages).length === 0) {
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}

// Reference: https://github.com/cloudflare/workers-sdk/issues/16605
// `vite dev` sets `logRequests: false` on its Miniflare options, but
// `vite preview` does not, so preview inherits Miniflare's default (`true`)
// and logs a line for every request that dev does not.
describe("request logging in dev and preview", () => {
	test("preview does not log a line for every request, matching dev", async ({
		expect,
	}) => {
		// Build the fixture Worker so there is a build output to preview.
		const builder = await createBuilder({
			root: fixturesPath,
			logLevel: "silent",
			plugins: [cloudflare({ inspectorPort: false, persistState: false })],
		});
		await builder.buildApp();

		const { logger, messages } = createCapturingLogger();
		const previewServer = await preview({
			root: fixturesPath,
			customLogger: logger,
			logLevel: "info",
			preview: { port: 0 },
			plugins: [cloudflare({ inspectorPort: false, persistState: false })],
		});
		try {
			const url = previewServer.resolvedUrls?.local[0];
			assert(url);
			const response = await fetch(url);
			expect(await response.text()).toBe("Hello World!");

			await waitForRequestLinesToSurface(messages);
			expect(requestLines(messages)).toEqual([]);
		} finally {
			await previewServer.close();
		}
	});

	test("dev does not log a line for every request", async ({ expect }) => {
		const { logger, messages } = createCapturingLogger();
		const server = await createServer({
			root: fixturesPath,
			customLogger: logger,
			logLevel: "info",
			plugins: [cloudflare({ inspectorPort: false, persistState: false })],
		});
		try {
			await server.listen();
			const url = server.resolvedUrls?.local[0];
			assert(url);
			const response = await fetch(url);
			expect(await response.text()).toBe("Hello World!");

			await waitForRequestLinesToSurface(messages);
			expect(requestLines(messages)).toEqual([]);
		} finally {
			await server.close();
		}
	});
});
