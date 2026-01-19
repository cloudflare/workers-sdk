import { resolve } from "node:path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

describe("Pages Functions with custom _routes.json", () => {
	let ip: string, port: number, stop: (() => Promise<unknown>) | undefined;

	beforeAll(async () => {
		({ ip, port, stop } = await runWranglerPagesDev(
			resolve(__dirname, ".."),
			"public",
			["--port=0", "--inspector-port=0"]
		));
	});

	afterAll(async () => {
		await stop?.();
	});

	it("should render static pages", async () => {
		const response = await fetch(`http://${ip}:${port}/undefined-route`);
		const text = await response.text();
		expect(text).toContain(
			"Bienvenue sur notre projet &#10024; pages-functions-with-routes-app!"
		);
	});

	it("should correctly apply the routing rules provided in the custom _routes.json file", async () => {
		// matches / include rule
		let response = await fetch(`http://${ip}:${port}`);
		let text = await response.text();
		expect(text).toEqual("ROOT");

		// matches /greeting/* include rule
		response = await fetch(`http://${ip}:${port}/greeting`);
		text = await response.text();
		expect(text).toEqual("[/functions/greeting/index]: Bonjour alligator!");

		// matches /greeting/* include rule
		response = await fetch(`http://${ip}:${port}/greeting/hello`);
		text = await response.text();
		expect(text).toEqual("[/functions/greeting/hello]: Bonjour le monde!");

		// matches /greeting/* include rule
		response = await fetch(`http://${ip}:${port}/greeting/bye`);
		text = await response.text();
		expect(text).toEqual("[/functions/greeting/bye]: A plus tard alligator 👋");

		// matches both include|exclude /date rules, but exclude has priority
		response = await fetch(`http://${ip}:${port}/date`);
		text = await response.text();
		expect(text).toContain(
			"Bienvenue sur notre projet &#10024; pages-functions-with-routes-app!"
		);

		// matches /bye* exclude rule
		response = await fetch(`http://${ip}:${port}/bye`);
		text = await response.text();
		expect(text).toContain(
			"Bienvenue sur notre projet &#10024; pages-functions-with-routes-app!"
		);

		// matches /greeting* include rule
		response = await fetch(`http://${ip}:${port}/greetings`);
		text = await response.text();
		expect(text).toEqual("[/functions/greetings]: Bonjour à tous!");

		// matches /*.* exclude rule
		response = await fetch(`http://${ip}:${port}/greeting/test.json`);
		const json = await response.json();
		expect(json).toEqual({ value: 99 });
	});
});
