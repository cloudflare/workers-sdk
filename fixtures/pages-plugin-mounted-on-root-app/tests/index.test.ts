import * as path from "path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

describe("Pages Functions", () => {
	let ip: string;
	let port: number;
	let stop: (() => Promise<unknown>) | undefined;

	beforeAll(async () => {
		({ ip, port, stop } = await runWranglerPagesDev(
			path.resolve(__dirname, ".."),
			"public",
			["--port=0", "--inspector-port=0"]
		));
	});

	afterAll(async () => {
		await stop?.();
	});

	it("mounts a plugin correctly at root", async () => {
		const response = await fetch(`http://${ip}:${port}/api/v1/instance`);
		const text = await response.text();
		expect(text).toMatchInlineSnapshot(`"Response from a nested folder"`);
	});
});
