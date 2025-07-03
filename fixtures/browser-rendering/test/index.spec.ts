// test/index.spec.ts
import { rm } from "node:fs/promises";
import { resolve } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("Local Browser", () => {
	let ip: string,
		port: number,
		stop: (() => Promise<unknown>) | undefined,
		getOutput: () => string;

	beforeAll(async () => {
		// delete previous run contents because of persistence
		await rm(resolve(__dirname, "..") + "/.wrangler", {
			force: true,
			recursive: true,
		});
		({ ip, port, stop, getOutput } = await runWranglerDev(
			resolve(__dirname, ".."),
			["--local", "--port=0", "--inspector-port=0"]
		));
	});

	afterAll(async () => {
		await stop?.();
	});

	async function fetchText(url: string) {
		const response = await fetch(url, {
			headers: {
				"MF-Disable-Pretty-Error": "1",
			},
		});
		const text = await response.text();

		return text;
	}

	it("Doesn't run a browser, just testing that the worker is running!", async () => {
		await expect(fetchText(`http://${ip}:${port}/`)).resolves.toEqual(
			"Please add an ?url=https://example.com/ parameter"
		);
	});

	it("Run a browser, and check h1 text content", async () => {
		await expect(
			fetchText(`http://${ip}:${port}/?url=https://example.com&action=select`)
		).resolves.toEqual("Example Domain");
	});

	it("Run a browser, and check p text content", async () => {
		await expect(
			fetchText(`http://${ip}:${port}/?url=https://example.com&action=alter`)
		).resolves.toEqual("New paragraph text set by Puppeteer!");
	});
});
