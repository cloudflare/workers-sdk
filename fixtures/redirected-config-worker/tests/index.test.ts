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

	it("specified environments are ignored when using a generated config", async ({
		expect,
		onTestFinished,
	}) => {
		const { ip, port, stop, getOutput } = await runWranglerDev(basePath, [
			"--port=0",
			"--inspector-port=0",
			"--env=staging",
		]);
		onTestFinished(async () => await stop?.());

		expect(getOutput()).toMatch(
			/Ignoring the requested environment \"staging\" since redirected configurations don't include environments/
		);
	});

	it("uses a custom config from command line rather than generated config", async ({
		expect,
		onTestFinished,
	}) => {
		const { ip, port, stop } = await runWranglerDev(basePath, [
			"-c=wrangler.toml",
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
