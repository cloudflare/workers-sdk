import { resolve } from "node:path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

describe("Pages Advanced Mode with custom _routes.json", () => {
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

	it("renders static pages", async () => {
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(text).toContain(
			"Bienvenue sur notre projet &#10024; pages-workerjs-with-routes-app!"
		);
	});

	it("runs our _worker.js", async () => {
		// matches /greeting/* include rule
		let response = await fetch(`http://${ip}:${port}/greeting/hello`);
		let text = await response.text();
		expect(text).toEqual("[/greeting/hello]: Bonjour le monde!");

		// matches /greeting/* include rule
		response = await fetch(`http://${ip}:${port}/greeting/bye`);
		text = await response.text();
		expect(text).toEqual("[/greeting/bye]: A plus tard alligator 👋");

		// matches /date include rule
		response = await fetch(`http://${ip}:${port}/date`);
		text = await response.text();
		expect(text).toMatch(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/);

		// matches both /party* include and /party exclude rules, but exclude
		// has priority
		response = await fetch(`http://${ip}:${port}/party`);
		text = await response.text();
		expect(text).toContain(
			"Bienvenue sur notre projet &#10024; pages-workerjs-with-routes-app!"
		);

		// matches /party* include rule
		response = await fetch(`http://${ip}:${port}/party-disco`);
		text = await response.text();
		expect(text).toEqual("[/party-disco]: Tout le monde à la discothèque 🪩");

		// matches /greeting/* include rule
		response = await fetch(`http://${ip}:${port}/greeting`);
		text = await response.text();
		expect(text).toEqual("[/greeting]: Bonjour à tous!");

		// matches no rule
		response = await fetch(`http://${ip}:${port}/greetings`);
		text = await response.text();
		expect(text).toContain(
			"Bienvenue sur notre projet &#10024; pages-workerjs-with-routes-app!"
		);
	});
});
