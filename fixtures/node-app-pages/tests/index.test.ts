import { resolve } from "node:path";
import { fetch } from "undici";
import { describe, it } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

describe.concurrent("Pages Dev", () => {
	it("should work with `--node-compat` when running code requiring polyfills", async ({
		expect,
	}) => {
		const { ip, port, stop } = await runWranglerPagesDev(
			resolve(__dirname, ".."),
			"public",
			["--node-compat", "--port=0"]
		);
		const response = await fetch(`http://${ip}:${port}/stripe`);

		await expect(response.text()).resolves.toContain(
			`"PATH":"path/to/some-file","STRIPE_OBJECT"`
		);

		await stop();
	});
});
