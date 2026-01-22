import { resolve } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("local explorer", () => {
	describe("with X_LOCAL_EXPLORER=true", () => {
		let ip: string;
		let port: number;
		let stop: (() => Promise<unknown>) | undefined;

		beforeAll(async () => {
			({ ip, port, stop } = await runWranglerDev(
				resolve(__dirname, ".."),
				["--port=0", "--inspector-port=0"],
				{ X_LOCAL_EXPLORER: "true" }
			));
		});

		afterAll(async () => {
			await stop?.();
		});

		it("returns local explorer API response for /cdn-cgi/explorer/api", async () => {
			const response = await fetch(`http://${ip}:${port}/cdn-cgi/explorer/api`);
			const text = await response.text();
			expect(text).toBe("Hello from local explorer API");
		});

		it("returns worker response for normal requests", async () => {
			const response = await fetch(`http://${ip}:${port}/`);
			const text = await response.text();
			expect(text).toBe("Hello World!");
		});
	});

	describe("without X_LOCAL_EXPLORER (default)", () => {
		let ip: string;
		let port: number;
		let stop: (() => Promise<unknown>) | undefined;

		beforeAll(async () => {
			({ ip, port, stop } = await runWranglerDev(resolve(__dirname, ".."), [
				"--port=0",
				"--inspector-port=0",
			]));
		});

		afterAll(async () => {
			await stop?.();
		});

		it("returns worker response for /cdn-cgi/explorer/api", async () => {
			const response = await fetch(`http://${ip}:${port}/cdn-cgi/explorer/api`);
			const text = await response.text();
			expect(text).toBe("Hello World!");
		});

		it("returns worker response for normal requests", async () => {
			const response = await fetch(`http://${ip}:${port}/`);
			const text = await response.text();
			expect(text).toBe("Hello World!");
		});
	});
});
