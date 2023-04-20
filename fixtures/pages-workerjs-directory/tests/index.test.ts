import { resolve } from "node:path";
import { fetch } from "undici";
import { describe, it } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

describe.concurrent("Pages _worker.js/ directory", () => {
	it("should support non-bundling with 'dev'", async ({ expect }) => {
		const { ip, port, stop } = await runWranglerPagesDev(
			resolve(__dirname, ".."),
			"public",
			["--port=0"]
		);
		await expect(
			fetch(`http://${ip}:${port}/`).then((resp) => resp.text())
		).resolves.toContain("Hello, world!");
		await expect(
			fetch(`http://${ip}:${port}/other-script`).then((resp) => resp.text())
		).resolves.toContain("test");
		await stop();
	});
});
