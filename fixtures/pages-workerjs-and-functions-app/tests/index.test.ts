import { resolve } from "node:path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

describe("Pages project with `_worker.js` and `/functions` directory", () => {
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
			"Bienvenue sur notre projet &#10024; pages-workerjs-and-functions-app!"
		);
	});

	it("runs our _worker.js and ignores the functions directory", async () => {
		let response = await fetch(`http://${ip}:${port}/greeting/hello`);
		let text = await response.text();
		expect(text).toEqual("Bonjour le monde!");

		response = await fetch(`http://${ip}:${port}/greeting/goodbye`);
		text = await response.text();
		expect(text).toEqual("A plus tard alligator 👋");

		response = await fetch(`http://${ip}:${port}/date`);
		text = await response.text();
		expect(text).toEqual(
			"Yesterday is history, tomorrow is a mystery, but today is a gift. That’s why it is called the present."
		);

		response = await fetch(`http://${ip}:${port}/party`);
		text = await response.text();
		expect(text).toEqual("Oops! Tous les alligators sont allés à la fête 🎉");
	});
});
