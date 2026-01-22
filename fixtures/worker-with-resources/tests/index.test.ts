import { resolve } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("Resource Inspector", () => {
	describe("with X_RESOURCE_INSPECTOR=true", () => {
		let ip: string;
		let port: number;
		let stop: (() => Promise<unknown>) | undefined;

		beforeAll(async () => {
			({ ip, port, stop } = await runWranglerDev(
				resolve(__dirname, ".."),
				["--port=0", "--inspector-port=0"],
				{ X_RESOURCE_INSPECTOR: "true" }
			));
		});

		afterAll(async () => {
			await stop?.();
		});

		it("returns resource viewer API response for /cdn-cgi/devtools/api", async () => {
			const response = await fetch(`http://${ip}:${port}/cdn-cgi/devtools/api`);
			const text = await response.text();
			expect(text).toBe("Hello from Resource Viewer API");
		});

		it("returns worker response for normal requests", async () => {
			const response = await fetch(`http://${ip}:${port}/`);
			const text = await response.text();
			expect(text).toBe("Hello World!");
		});
	});

	describe("without X_RESOURCE_INSPECTOR (default)", () => {
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

		it("returns worker response for /cdn-cgi/devtools/api", async () => {
			const response = await fetch(`http://${ip}:${port}/cdn-cgi/devtools/api`);
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
