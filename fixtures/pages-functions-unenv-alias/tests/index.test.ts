import { resolve } from "node:path";
import { fetch } from "undici";
import { describe, expect, it, onTestFinished } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

describe("Pages functions with unenv aliased packages", () => {
	it("should run dev server when requiring an unenv aliased package", async () => {
		const { ip, port, stop } = await runWranglerPagesDev(
			resolve(__dirname, ".."),
			"./functions",
			["--port=0", "--inspector-port=0"]
		);
		onTestFinished(stop);
		const response = await fetch(`http://${ip}:${port}/`);
		const body = await response.text();
		expect(body).toEqual(`OK!`);
	});
});
