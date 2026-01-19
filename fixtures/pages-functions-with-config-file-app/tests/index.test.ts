import { resolve } from "node:path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

describe("Pages Functions with wrangler.toml", () => {
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
		const response = await fetch(`http://${ip}:${port}`);
		const text = await response.text();
		expect(text).toContain("Celebrate! Pages now supports 'wrangler.toml' 🎉");
	});

	it("should correctly apply the routing rules provided in the custom _routes.json file", async () => {
		// matches `/celebrate` include rule
		let response = await fetch(`http://${ip}:${port}/celebrate`);
		let text = await response.text();
		expect(text).toEqual(
			`[/celebrate]:\n` +
				`🎵 🎵 🎵\n` +
				`You can turn this world around\n` +
				`And bring back all of those happy days\n` +
				`Put your troubles down\n` +
				`It's time to celebrate\n` +
				`🎵 🎵 🎵`
		);

		// matches `/holiday` exclude rule
		response = await fetch(`http://${ip}:${port}/holiday`);
		text = await response.text();
		expect(text).toContain("Celebrate! Pages now supports 'wrangler.toml' 🎉");
	});
});
