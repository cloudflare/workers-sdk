import { exports } from "cloudflare:workers";
import { describe, it } from "vitest";

// `cloudflare.config.ts` declares an assets binding but never an assets
// directory: as with @cloudflare/vite-plugin, the assets are served separately.
// vitest-plugin must still start the Worker.

describe("workers-assets-no-dir", () => {
	it("worker starts and responds when assets binding has no directory configured", async ({
		expect,
	}) => {
		const response = await exports.default.fetch("http://example.com/");
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("Hello from worker!");
	});
});
