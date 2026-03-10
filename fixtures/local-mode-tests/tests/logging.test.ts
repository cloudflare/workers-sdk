import path from "node:path";
import { setTimeout } from "node:timers/promises";
import util from "node:util";
import { afterEach, beforeEach, it, Mock, vi } from "vitest";
import { unstable_startWorker } from "wrangler";

let output = "";
function spyOnConsoleMethod(name: keyof typeof console) {
	(vi.spyOn(console, name) as Mock).mockImplementation((...args: unknown[]) => {
		output += util.format(...args) + "\n";
	});
}
beforeEach(() => {
	spyOnConsoleMethod("debug");
	spyOnConsoleMethod("log");
	spyOnConsoleMethod("info");
	spyOnConsoleMethod("error");
	spyOnConsoleMethod("warn");
});
afterEach(() => {
	vi.restoreAllMocks();
	output = "";
});

it("logs startup errors", async ({ expect }) => {
	let caughtError: unknown;
	try {
		const worker = await unstable_startWorker({
			entrypoint: path.resolve(__dirname, "../src/nodejs-compat.ts"),
			config: path.resolve(__dirname, "../wrangler.logging.jsonc"),
			// Intentionally omitting `compatibilityFlags: ["nodejs_compat"]`
			dev: {
				server: { hostname: "127.0.0.1", port: 0 },
				inspector: false,
			},
		});
		await worker.dispose();
		expect.fail("Expected unstable_startWorker() to fail");
	} catch (e) {
		caughtError = e;
	}
	// wait a bit to give time for the `console` logging to complete
	await setTimeout(500);
	const context = util.inspect(
		{ caughtError, output },
		{ maxStringLength: null }
	);
	expect(output, context).toContain('No such module "node:buffer"');
});
