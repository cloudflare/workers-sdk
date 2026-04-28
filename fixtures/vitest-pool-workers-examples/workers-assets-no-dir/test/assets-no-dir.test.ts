import { exports } from "cloudflare:workers";
import { describe, it } from "vitest";

// Regression test for https://github.com/cloudflare/workers-sdk/issues/9381
//
// When a wrangler config has `assets: { binding: "ASSETS" }` but no `directory`
// (as is common when using @cloudflare/vite-plugin, which handles asset serving
// independently via its dev server), vitest-pool-workers must not throw:
//   "The `assets` property in your configuration is missing the required `directory` property."

describe("workers-assets-no-dir", () => {
	it("worker starts and responds when assets binding has no directory configured", async ({
		expect,
	}) => {
		const response = await exports.default.fetch("http://example.com/");
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("Hello from worker!");
	});
});
