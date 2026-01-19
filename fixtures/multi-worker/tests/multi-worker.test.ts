import * as path from "node:path";
import { describe, it, vi } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("Multi Worker", () => {
	it("can start a multi worker application with Sentry", async ({ expect }) => {
		const { ip, port, stop } = await runWranglerDev(
			path.resolve(__dirname, ".."),
			["-c=workers/sentry/wrangler.jsonc", "-c=workers/default/wrangler.jsonc"]
		);

		await vi.waitFor(async () => {
			const response = await fetch(`http://${ip}:${port}/`);
			const text = await response.text();
			expect(text).toBe(`Hello World!`);
		});

		await stop();
	});
});
