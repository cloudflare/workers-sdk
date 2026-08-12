import { resolve } from "node:path";
import { fetch } from "undici";
import { describe, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("nodejs compat default", () => {
	it("imports node.js builtins without the nodejs_compat flag when the compatibility date implies it", async ({
		expect,
	}) => {
		const { ip, port, stop } = await runWranglerDev(
			resolve(__dirname, "../src"),
			["--port=0", "--inspector-port=0"]
		);
		try {
			const response = await fetch(`http://${ip}:${port}/`);
			const body = await response.text();
			expect(body).toMatchInlineSnapshot(`"OK"`);
		} finally {
			await stop();
		}
	});
});
