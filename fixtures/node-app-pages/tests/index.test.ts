import { resolve } from "node:path";
import { fetch } from "undici";
import { describe, it } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

describe("Pages Dev", () => {
	it("should work with `nodejs_compat` when running code requiring polyfills", async ({
		expect,
	}) => {
		const { ip, port, stop } = await runWranglerPagesDev(
			resolve(__dirname, ".."),
			"public",
			[
				"--port=0",
				"--inspector-port=0",
				"--compatibility-flags=nodejs_compat",
				"--compatibility-date=2024-11-01",
			]
		);
		try {
			const response = await fetch(`http://${ip}:${port}/stripe`);

			await expect(response.text()).resolves.toContain(
				`"PATH":"path/to/some-file","STRIPE_OBJECT"`
			);
		} finally {
			await stop();
		}
	});
});
