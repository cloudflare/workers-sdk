import { resolve } from "path";
import { fetch } from "undici";
import { describe, it } from "vitest";

import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

const basePath = resolve(__dirname, "..");

describe("'wrangler dev' correctly renders pages", () => {
	it("uses the generated config", async ({ expect, onTestFinished }) => {
		const { ip, port, stop } = await runWranglerDev(basePath, [
			"--port=0",
			"--inspector-port=0",
		]);
		onTestFinished(async () => await stop?.());

		// Note that the local protocol defaults to http
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toMatchInlineSnapshot(`"Generated: true"`);
	});

	it("specifying an environment causes an error since they are not supported in redirected configs", async ({
		expect,
	}) => {
		await expect(
			runWranglerDev(basePath, [
				"--port=0",
				"--inspector-port=0",
				"--env=staging",
			])
		).rejects.toThrowError(
			/You have specified the environment ".*?", but are using a redirected configuration/
		);
	});

	it("uses a custom config from command line rather than generated config", async ({
		expect,
		onTestFinished,
	}) => {
		const { ip, port, stop } = await runWranglerDev(basePath, [
			"-c=wrangler.jsonc",
			"--port=0",
			"--inspector-port=0",
		]);
		onTestFinished(async () => await stop?.());

		// Note that the local protocol defaults to http
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toMatchInlineSnapshot(`"Generated: undefined"`);
	});
});
