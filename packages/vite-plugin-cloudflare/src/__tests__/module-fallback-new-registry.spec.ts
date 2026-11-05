import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { createServer } from "vite";
import { afterEach, describe, test } from "vitest";
import type { Logger, ViteDevServer } from "vite";

const fixturePath = fileURLToPath(
	new URL("./fixtures/new-module-registry", import.meta.url)
);

/** Captures everything Vite and the plugin log, instead of writing to stdout. */
function createCapturingLogger(errors: string[]): Logger {
	return {
		hasWarned: false,
		hasErrorLogged: () => false,
		clearScreen: () => {},
		info: () => {},
		warn: () => {},
		warnOnce: () => {},
		error: (msg) => {
			errors.push(String(msg));
		},
	};
}

describe("dev module fallback with the new module registry", () => {
	let server: ViteDevServer | undefined;

	afterEach(async () => {
		await server?.close();
		server = undefined;
	});

	// Reference: https://github.com/cloudflare/workers-sdk/issues/16381
	test("dev startup does not fail the module fallback for node:process", async ({
		expect,
	}) => {
		const errors: string[] = [];

		// `logLevel: "error"` so Miniflare's logger (which the plugin derives its
		// level from Vite's) actually reports fallback service errors, while the
		// custom logger captures them instead of writing to stdout.
		server = await createServer({
			root: fixturePath,
			logLevel: "error",
			customLogger: createCapturingLogger(errors),
			plugins: [cloudflare({ inspectorPort: false, persistState: false })],
		});

		await server.listen();

		const address = server.resolvedUrls?.local[0];
		if (!address) {
			throw new Error("Server address is undefined");
		}

		const response = await fetch(address);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("process: object");

		// The new module registry consults the fallback service while the dev
		// server starts. Give any fallback requests time to arrive before
		// checking the captured logs.
		await new Promise((resolve) => setTimeout(resolve, 3000));

		expect(errors.join("\n")).not.toContain("no match for module");
	});
});
