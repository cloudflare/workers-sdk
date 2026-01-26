import { rmSync, writeFileSync } from "fs";
import path, { resolve } from "path";
import { fetch } from "undici";
import { describe, expect, it, onTestFinished } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

const basePath = resolve(__dirname, "..");

describe("wrangler pages dev", () => {
	it("uses the generated config if there is no wrangler.toml", async () => {
		const { ip, port, stop } = await runWranglerPagesDev(basePath, undefined, [
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

	it("uses the generated config instead of a user wrangler.toml", async () => {
		writeFileSync(
			path.join(basePath, "wrangler.toml"),
			[
				`name = "redirected-config-worker"`,
				`compatibility_date = "2024-12-01"`,
				`pages_build_output_dir = "public"`,
			].join("\n")
		);
		const { ip, port, stop } = await runWranglerPagesDev(basePath, undefined, [
			"--port=0",
			"--inspector-port=0",
		]);
		onTestFinished(async () => {
			rmSync(path.join(basePath, "wrangler.toml"), { force: true });
			await stop?.();
		});

		// Note that the local protocol defaults to http
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toMatchInlineSnapshot(`"Generated: true"`);
	});
});
