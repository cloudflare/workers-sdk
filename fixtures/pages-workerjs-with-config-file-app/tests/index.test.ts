import { resolve } from "node:path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

describe("Pages Advanced Mode with wrangler.toml", () => {
	let ip: string, port: number, stop: (() => Promise<unknown>) | undefined;

	beforeAll(async () => {
		({ ip, port, stop } = await runWranglerPagesDev(
			resolve(__dirname, ".."),
			undefined,
			["--port=0", "--inspector-port=0"]
		));
	});

	afterAll(async () => {
		await stop?.();
	});

	it("should render static pages", async () => {
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(text).toContain(
			"🪩 Holiday! Celebrate! Pages supports 'wrangler.toml' 🪩"
		);
	});

	it("should run our _worker.js, and correctly apply the routing rules provided in the custom _routes.json file", async () => {
		// matches `/holiday` include rule
		let response = await fetch(`http://${ip}:${port}/holiday`);
		let text = await response.text();
		expect(text).toEqual(
			`[/holiday]:\n` +
				`🎶 🎶 🎶\n` +
				`If we took a holiday\n` +
				`Took some time to celebrate\n` +
				`Just one day out of life\n` +
				`It would be, it would be so nice 🎉\n` +
				`🎶 🎶 🎶`
		);

		// matches `/celebrate` include rule
		response = await fetch(`http://${ip}:${port}/celebrate`);
		text = await response.text();
		expect(text).toEqual(
			`[/celebrate]:\n` +
				`🎶 🎶 🎶\n` +
				`Everybody spread the word\n` +
				`We're gonna have a celebration\n` +
				`All across the world\n` +
				`In every nation\n` +
				`🎶 🎶 🎶`
		);

		// matches `/oh-yeah` exclude rule
		response = await fetch(`http://${ip}:${port}/oh-yeah`);
		text = await response.text();
		expect(text).toContain(
			"🪩 Holiday! Celebrate! Pages supports 'wrangler.toml' 🪩"
		);
	});

	it("has version_metadata binding", async () => {
		const response = await fetch(`http://${ip}:${port}/version_metadata`);

		await expect(response.json()).resolves.toMatchObject({
			id: expect.any(String),
			tag: expect.any(String),
		});
	});
});
