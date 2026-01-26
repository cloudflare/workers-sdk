import { resolve } from "node:path";
import { fetch } from "undici";
import { describe, expect, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("nodejs als", () => {
	it("should work with node:async_hooks without full nodejs compat", async () => {
		const { ip, port, stop, getOutput } = await runWranglerDev(
			resolve(__dirname, "../src"),
			["--port=0", "--inspector-port=0"]
		);
		try {
			// There should be no warning about async_hooks
			expect(getOutput()).not.toContain("node:async_hooks");

			const response = await fetch(`http://${ip}:${port}/`);
			const body = await response.text();
			expect(body).toMatchInlineSnapshot(`"Working [1,2,3]"`);
		} finally {
			await stop();
		}
	});
});
