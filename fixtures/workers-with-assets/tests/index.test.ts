import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fetch } from "undici";
import {
	afterAll,
	beforeAll,
	describe,
	expect,
	it,
	onTestFinished,
} from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("[Workers + Assets] dynamic site", () => {
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

	it("should fallback to the user Worker if there are no assets at a given path ", async () => {
		// Requests should hit the Asset Worker *first*, then try the user Worker
		const response = await fetch(`http://${ip}:${port}/no-assets-here`);
		const text = await response.text();
		expect(text).toContain(
			"There were no assets at this route! Hello from the user Worker instead!"
		);
	});

	// html_handling defaults to 'auto-trailing-slash'
	it("should `/` resolve to `/index.html` ", async () => {
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(text).toContain("<h1>Hello Workers + Assets World 🚀!</h1>");
	});

	it("should handle content types correctly on asset routes", async () => {
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

		response = await fetch(`http://${ip}:${port}/totallyinvalidextension.greg`);
		expect(response.status).toBe(200);
		expect(response.headers.has("Content-Type")).toBeFalsy();
	});

	it("should return 405 for non-GET or HEAD requests on routes where assets exist", async () => {
		// these should return the error and NOT be forwarded onto the user Worker
		// POST etc. request -> RW -> AW -> check manifest --405--> RW --405--> eyeball

		// methods as per https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods
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
		expect(text).toContain(`%5Bboop%5D.html`);
	});

	it("should forward all request types to the user Worker if there are *not* assets on that route", async () => {
		// Unlike above, if the AW does NOT find assets on a route, non-GET request should return 404s
		// This is because all requests are first sent to the AW and only then to the UW
		// and we don't want to 405 on a valid POST request intended for the UW
		// POST etc. request -> RW -> AW -> checks manifest --404--> RW -> UW -> response

		let response = await fetch(`http://${ip}:${port}/no-assets-here`, {
			method: "GET",
		});
		expect(response.status).toBe(200);

		response = await fetch(`http://${ip}:${port}/no-assets-here`, {
			method: "HEAD",
		});
		expect(response.status).toBe(200);

		response = await fetch(`http://${ip}:${port}/no-assets-here`, {
			method: "POST",
		});
		expect(response.status).toBe(200);

		response = await fetch(`http://${ip}:${port}/no-assets-here`, {
			method: "PUT",
		});
		expect(response.status).toBe(200);

		response = await fetch(`http://${ip}:${port}/no-assets-here`, {
			method: "DELETE",
		});
		expect(response.status).toBe(200);

		response = await fetch(`http://${ip}:${port}/no-assets-here`, {
			method: "OPTIONS",
		});
		expect(response.status).toBe(200);

		response = await fetch(`http://${ip}:${port}/no-assets-here`, {
			method: "PATCH",
		});
		expect(response.status).toBe(200);
	});

	it("should be able to use an ASSETS binding", async () => {
		let response = await fetch(`http://${ip}:${port}/assets-binding`);
		let text = await response.text();
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"text/html; charset=utf-8"
		);
		expect(text).toContain("<h1>✨This is from a user Worker binding✨</h1>");
	});

	it("should be able to use a binding to a named entrypoint", async () => {
		let response = await fetch(`http://${ip}:${port}/named-entrypoint`);
		let text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toContain("hello from a named entrypoint");
	});

	it("should apply custom redirects", async () => {
		let response = await fetch(`http://${ip}:${port}/foo`, {
			redirect: "manual",
		});
		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/bar");

		response = await fetch(`http://${ip}:${port}/pic`);
		expect(response.status).toBe(200);
		expect(await response.arrayBuffer()).toEqual(
			readFileSync(join(__dirname, "../public/lava-lamps.jpg")).buffer
		);
	});

	it("should apply custom headers", async () => {
		let response = await fetch(`http://${ip}:${port}/`);
		expect(response.status).toBe(200);
		expect(response.headers.get("X-Header")).toBe("Custom-Value");
	});

	it("should apply .assetsignore", async () => {
		let response = await fetch(`http://${ip}:${port}/.assetsignore`);
		expect(await response.text()).not.toContain("ignore-me.txt");

		response = await fetch(`http://${ip}:${port}/ignore-me.txt`);
		expect(await response.text()).not.toContain("SECRET");

		response = await fetch(`http://${ip}:${port}/_headers`);
		expect(await response.text()).not.toContain("X-Header");
	});

	it.todo("should warn of _worker.js", async () => {
		// let response = await fetch(`http://${ip}:${port}/_worker.js`);
		// expect(await response.text()).not.toContain("bang");
	});

	it("should work with files which start with .", async () => {
		let response = await fetch(`http://${ip}:${port}/.dot`);
		let text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toMatchInlineSnapshot(`
			"hi from .dot/index.html
			"
		`);

		response = await fetch(`http://${ip}:${port}/.dotfile.html`);
		text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toMatchInlineSnapshot(`
			"hi from .dotfile.html
			"
		`);
	});
});

describe("[Workers + Assets] logging", () => {
	it("should log _headers and _redirects parsing", async () => {
		const { ip, port, stop, getOutput } = await runWranglerDev(
			resolve(__dirname, ".."),
			["--port=0", "--inspector-port=0"]
		);

		// Await a request to ensure the logs have been written
		await fetch(`http://${ip}:${port}/`);

		expect(getOutput()).toContain(
			`[wrangler:info] ✨ Parsed 2 valid redirect rules.`
		);
		expect(getOutput()).toContain(
			`[wrangler:info] ✨ Parsed 1 valid header rule.`
		);
		onTestFinished(() => stop());
	});

	it("should not log _headers and _redirects parsing when log level set to none", async () => {
		const { ip, port, stop, getOutput } = await runWranglerDev(
			resolve(__dirname, ".."),
			["--port=0", "--inspector-port=0", "--log-level=none"]
		);
		expect(getOutput()).toMatchInlineSnapshot(`""`);
		onTestFinished(() => stop());
	});
});
