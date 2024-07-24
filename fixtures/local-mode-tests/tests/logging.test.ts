import path from "node:path";
import { setTimeout } from "node:timers/promises";
import util from "node:util";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { unstable_dev } from "wrangler";

let output = "";
function spyOnConsoleMethod(name: keyof typeof console) {
	vi.spyOn(console, name).mockImplementation((...args: unknown[]) => {
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

it("logs startup errors", async () => {
	let caughtError: unknown;
	try {
		const worker = await unstable_dev(
			path.resolve(__dirname, "..", "src", "nodejs-compat.ts"),
			{
				config: path.resolve(__dirname, "..", "wrangler.logging.toml"),
				// Intentionally omitting `compatibilityFlags: ["nodejs_compat"]`
				ip: "127.0.0.1",
				experimental: {
					disableExperimentalWarning: true,
					disableDevRegistry: true,
					devEnv: true,
				},
			}
		);
		await worker.stop();
		expect.fail("Expected unstable_dev() to fail");
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
