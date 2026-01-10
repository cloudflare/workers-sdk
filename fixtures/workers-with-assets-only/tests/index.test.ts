import { resolve } from "node:path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("[Workers + Assets] static-assets only site`", () => {
	let ip: string, port: number, stop: (() => Promise<unknown>) | undefined;

	beforeAll(async () => {
		({ ip, port, stop } = await runWranglerDev(resolve(__dirname, ".."), [
			"--port=0",
			"--inspector-port=0",
		]));
	});

	afterAll(async () => {
		await stop?.();
	});

	it("should respond with static asset content", async () => {
		let response = await fetch(`http://${ip}:${port}/index.html`);
		let text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toContain(`<h1>Hello Workers + Assets World 🚀!</h1>`);

		response = await fetch(`http://${ip}:${port}/about/index.html`);
		text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toContain(`<p>Learn more about Workers with Assets soon!</p>`);
	});

	it("should resolve '/' to '/index.html' ", async () => {
		let response = await fetch(`http://${ip}:${port}/`);
		expect(response.status).toBe(200);
		expect(await response.text()).toContain(
			`<h1>Hello Workers + Assets World 🚀!</h1>`
		);
	});

	it("should 404 if asset is not found in the asset manifest", async () => {
		let response = await fetch(`http://${ip}:${port}/hello.html`);
		expect(response.status).toBe(404);

		response = await fetch(`http://${ip}:${port}/hello.txt`);
		expect(response.status).toBe(404);
	});

	it("should handle content types correctly", async () => {
		let response = await fetch(`http://${ip}:${port}/index.html`);
		let text = await response.text();
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"text/html; charset=utf-8"
		);

		response = await fetch(`http://${ip}:${port}/README.md`);
		text = await response.text();
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"text/markdown; charset=utf-8"
		);
		expect(text).toContain(`Welcome to Workers + Assets YAY!`);

		response = await fetch(`http://${ip}:${port}/yay.txt`);
		text = await response.text();
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"text/plain; charset=utf-8"
		);
		expect(text).toContain(`.----------------.`);

		response = await fetch(`http://${ip}:${port}/lava-lamps.jpg`);
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("image/jpeg");
	});

	it("should return 405 for non-GET or HEAD requests if asset route exists", async () => {
		// as per https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods
		// excl. TRACE and CONNECT which are not supported

		let response = await fetch(`http://${ip}:${port}/index.html`, {
			method: "POST",
		});
		expect(response.status).toBe(405);
		expect(response.statusText).toBe("Method Not Allowed");

		response = await fetch(`http://${ip}:${port}/index.html`, {
			method: "PUT",
		});
		expect(response.status).toBe(405);
		expect(response.statusText).toBe("Method Not Allowed");

		response = await fetch(`http://${ip}:${port}/index.html`, {
			method: "DELETE",
		});
		expect(response.status).toBe(405);
		expect(response.statusText).toBe("Method Not Allowed");

		response = await fetch(`http://${ip}:${port}/index.html`, {
			method: "OPTIONS",
		});
		expect(response.status).toBe(405);
		expect(response.statusText).toBe("Method Not Allowed");

		response = await fetch(`http://${ip}:${port}/index.html`, {
			method: "PATCH",
		});
		expect(response.status).toBe(405);
		expect(response.statusText).toBe("Method Not Allowed");
	});

	it("should return 404 for non-GET requests if asset route does not exist", async () => {
		// as per https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods
		// excl. TRACE and CONNECT which are not supported

		let response = await fetch(`http://${ip}:${port}/nope.html`, {
			method: "HEAD",
		});
		expect(response.status).toBe(404);

		response = await fetch(`http://${ip}:${port}/nope.html`, {
			method: "POST",
		});
		expect(response.status).toBe(404);

		response = await fetch(`http://${ip}:${port}/nope.html`, {
			method: "PUT",
		});
		expect(response.status).toBe(404);

		response = await fetch(`http://${ip}:${port}/nope.html`, {
			method: "DELETE",
		});
		expect(response.status).toBe(404);

		response = await fetch(`http://${ip}:${port}/nope.html`, {
			method: "OPTIONS",
		});
		expect(response.status).toBe(404);

		response = await fetch(`http://${ip}:${port}/nope.html`, {
			method: "PATCH",
		});
		expect(response.status).toBe(404);
	});

	it("should work with encoded path names", async () => {
		let response = await fetch(`http://${ip}:${port}/about/[fünky].txt`);
		let text = await response.text();
		expect(response.status).toBe(200);
		expect(response.url).toBe(
			`http://${ip}:${port}/about/%5Bf%C3%BCnky%5D.txt`
		);
		expect(text).toContain(`This should work.`);

		response = await fetch(`http://${ip}:${port}/about/[boop]`);
		text = await response.text();
		expect(response.status).toBe(200);
		expect(response.url).toBe(`http://${ip}:${port}/about/%5Bboop%5D`);
		expect(text).toContain(`[boop].html`);

		response = await fetch(`http://${ip}:${port}/about/%5Bboop%5D`);
		text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toContain(`[boop].html`);

		response = await fetch(`http://${ip}:${port}/about/%255Bboop%255D`);
		text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toContain(`%255Bboop%255D.html`);
	});
});
