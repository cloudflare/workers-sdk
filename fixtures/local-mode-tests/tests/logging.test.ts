import path from "node:path";
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
	spyOnConsoleMethod("error");
});
afterEach(() => {
	vi.restoreAllMocks();
	output = "";
});

it("logs startup errors", async () => {
	try {
		const worker = await unstable_dev(
			path.resolve(__dirname, "..", "src", "nodejs-compat.ts"),
			{
				config: path.resolve(__dirname, "..", "wrangler.logging.toml"),
				// Intentionally omitting `compatibilityFlags: ["nodejs_compat"]`
				experimental: { disableExperimentalWarning: true },
			}
		);
		await worker.stop();
		expect.fail("Expected unstable_dev() to fail");
	} catch {}
	expect(output).toContain(`No such module "node:buffer"`);
});
