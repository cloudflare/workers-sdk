import { resolve } from "path";
import { setTimeout } from "timers/promises";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("'wrangler dev' correctly renders pages", () => {
	let ip: string,
		port: number,
		stop: (() => Promise<unknown>) | undefined,
		getOutput: () => string;

	beforeAll(async () => {
		({ ip, port, stop, getOutput } = await runWranglerDev(
			resolve(__dirname, ".."),
			["--port=0", "--inspector-port=0", "--upstream-protocol=https"]
		));
	});

	afterAll(async () => {
		await stop?.();
	});

	it("renders ", async ({ expect }) => {
		// Note that the local protocol defaults to http
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(response.status).toBe(200);
		// Note that the upstream protocol defaults to https
		expect(text).toContain(`https://${ip}:${port}/`);

		// Wait up to 5s for all request logs to be flushed
		for (let i = 0; i < 10; i++) {
			if (getOutput().includes("end of request")) break;
			await setTimeout(500);
		}

		// Ensure `console.log()`s from startup and requests are shown
		const output = getOutput();
		expect(output).toContain("startup log");
		expect(output).toContain("request log");

		// check host on request in the Worker is as expected
		expect(output).toContain(`host' => '${ip}:${port}'`);

		// Check logged strings are source mapped
		expect(output).toMatch(
			/Error: logged error one\n.+at logErrors.+fixtures\/worker-app\/src\/log\.ts:7:14/
		);
		expect(output).toMatch(
			/Error: logged error two\n.+at logErrors.+fixtures\/worker-app\/src\/log\.ts:8:14/
		);
		expect(output).toMatch(
			/Error: logged error three\n.+at logErrors.+fixtures\/worker-app\/src\/log\.ts:9:23/
		);
		expect(output).toMatch(
			/Error: logged error four\\n' \+\n.+at logErrors.+fixtures\/worker-app\/src\/log\.ts:10:33/
		);

		// Regression test for https://github.com/cloudflare/workers-sdk/issues/4668
		expect(output).toContain("some normal text to log");
		expect(output).toContain("text with at in the middle");
		expect(output).toContain("more text with    at in the middle");
	});

	it("renders pretty error after logging", async ({ expect }) => {
		// Regression test for https://github.com/cloudflare/workers-sdk/issues/4715
		const response = await fetch(`http://${ip}:${port}/error`);
		const text = await response.text();
		expect(text).toContain("Oops!");
		expect(response.headers.get("Content-Type")).toBe(
			"text/html;charset=utf-8"
		);
	});

	it("uses `workerd` condition when bundling", async ({ expect }) => {
		const response = await fetch(`http://${ip}:${port}/random`);
		const text = await response.text();
		expect(text).toMatch(/[0-9a-f]{16}/); // 8 hex bytes
	});

	it("passes through URL host and path unchanged", async ({ expect }) => {
		const url = `http://${ip}:${port}//thing?a=1`;
		const response = await fetch(`http://${ip}:${port}//thing?a=1`, {
			headers: { "X-Test-URL": "true" },
		});
		const text = await response.text();
		// Note that the protocol changes due to the upstream_protocol configuration of Wrangler in the `beforeAll()`.
		expect(text).toBe(`https://${ip}:${port}//thing?a=1`);
	});
});
