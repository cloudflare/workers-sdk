import { resolve } from "path";
import { setTimeout } from "timers/promises";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("'wrangler dev' correctly renders pages", () => {
	let ip: string,
		port: number,
		stop: (() => Promise<unknown>) | undefined,
		getOutput: () => string;

	beforeAll(async () => {
		({ ip, port, stop, getOutput } = await runWranglerDev(
			resolve(__dirname, ".."),
			[
				"--port=0",
				"--inspector-port=0",
				"--upstream-protocol=https",
				"--host=prod.example.org",
			]
		));
	});

	afterAll(async () => {
		await stop?.();
	});

	it("renders ", async () => {
		await vi.waitFor(
			async () => {
				// Note that the local protocol defaults to http
				const response = await fetch(`http://${ip}:${port}/`);
				const text = await response.text();
				expect(response.status).toBe(200);
				expect(text).toContain(`https://prod.example.org/`);
			},
			{ interval: 1000, timeout: 5000 }
		);

		// Wait up to 5s for all request logs to be flushed
		for (let i = 0; i < 10; i++) {
			if (getOutput().includes("end of request")) break;
			await setTimeout(500);
		}

		// Ensure `console.log()`s from startup and requests are shown
		const output = getOutput();
		expect(output).toContain("startup log");
		expect(output).toContain("request log");

		if (process.platform === "win32") {
			// Check that the Windows warning is shown for the fake access violation error
			expect(output).toContain(
				"On Windows, this may be caused by an outdated Microsoft Visual C++ Redistributable library."
			);
		}

		// check host on request in the Worker is as expected
		expect(output).toContain(`host' => 'prod.example.org`);

		// Check logged strings are source mapped
		expect(output).toMatch(
			/Error: logged error one\n.+at logErrors.+fixtures\/worker-app\/src\/log\.ts:7:14/
		);
		expect(output).toMatch(
			/Error: logged error two\n.+at logErrors.+fixtures\/worker-app\/src\/log\.ts:8:14/
		);
		expect(output).toMatch(
			/Error: logged error three\n.+at logErrors.+fixtures\/worker-app\/src\/log\.ts:9:23/
		);
		expect(output).toMatch(
			/Error: logged error four\\n' \+\n.+at logErrors.+fixtures\/worker-app\/src\/log\.ts:10:33/
		);

		// Regression test for https://github.com/cloudflare/workers-sdk/issues/4668
		expect(output).toContain("some normal text to log");
		expect(output).toContain("text with at in the middle");
		expect(output).toContain("more text with    at in the middle");
	});

	it("renders pretty error after logging", async () => {
		// Regression test for https://github.com/cloudflare/workers-sdk/issues/4715
		const response = await fetch(`http://${ip}:${port}/error`);
		const text = await response.text();
		expect(text).toContain("Oops!");
		expect(response.headers.get("Content-Type")).toBe(
			"text/html;charset=utf-8"
		);
	});

	it("uses `workerd` condition when bundling", async () => {
		const response = await fetch(`http://${ip}:${port}/random`);
		const text = await response.text();
		expect(text).toMatch(/[0-9a-f]{16}/); // 8 hex bytes
	});

	it("passes through URL unchanged", async () => {
		const response = await fetch(`http://${ip}:${port}//thing?a=1`, {
			headers: { "X-Test-URL": "true" },
		});
		const text = await response.text();
		expect(text).toBe(`https://prod.example.org//thing?a=1`);
	});

	it("rewrites the Host and Origin headers appropriately", async () => {
		const response = await fetch(`http://${ip}:${port}/test`, {
			// Pass in an Origin header to trigger the rewriting
			headers: { Origin: `http://${ip}:${port}` },
		});
		const text = await response.text();
		expect(text).toContain(`HOST:prod.example.org`);
		expect(text).toContain(`ORIGIN:https://prod.example.org`);
	});

	it("does not rewrite Origin header if one is not passed by the client", async () => {
		const response = await fetch(`http://${ip}:${port}/test`, {});
		const text = await response.text();
		expect(text).toContain(`HOST:prod.example.org`);
		expect(text).toContain(`ORIGIN:null`);
	});

	it("does not rewrite Origin header if it not the same origin as the proxy Worker", async () => {
		const response = await fetch(`http://${ip}:${port}/test`, {
			headers: { Origin: `http://foo.com` },
		});
		const text = await response.text();
		expect(text).toContain(`HOST:prod.example.org`);
		expect(text).toContain(`ORIGIN:http://foo.com`);
	});

	it("rewrites response headers containing the emulated host", async () => {
		// This /redirect request will add a Location header that points to prod.example.com/foo
		// But we should rewrite this back to that of the proxy.
		const response = await fetch(`http://${ip}:${port}/redirect`, {
			redirect: "manual",
		});
		expect(response.status).toBe(302);
		expect(await response.text()).toEqual("");
		expect(response.headers.get("Location")).toEqual(
			`http://${ip}:${port}/foo`
		);
	});

	it("rewrites set-cookie headers to the hostname, not host", async () => {
		const response = await fetch(`http://${ip}:${port}/cookie`);

		expect(response.headers.getSetCookie()).toStrictEqual([
			`hello=world; Domain=${ip}`,
			`hello2=world2; Domain=${ip}; Secure`,
		]);
	});

	it("has access to version_metadata binding", async () => {
		const response = await fetch(`http://${ip}:${port}/version_metadata`);

		await expect(response.json()).resolves.toMatchObject({
			id: expect.any(String),
			tag: expect.any(String),
		});
	});

	it("passes through client content encoding", async () => {
		// https://github.com/cloudflare/workers-sdk/issues/5246
		const response = await fetch(`http://${ip}:${port}/content-encoding`, {
			headers: { "Accept-Encoding": "hello" },
		});
		expect(await response.json()).toStrictEqual({
			AcceptEncoding: "br, gzip",
			clientAcceptEncoding: "hello",
		});
	});

	it("supports encoded responses", async () => {
		const response = await fetch(`http://${ip}:${port}/content-encoding/gzip`, {
			headers: { "Accept-Encoding": "gzip" },
		});
		expect(await response.text()).toEqual("x".repeat(100));
	});

	it("uses explicit resource management", async () => {
		const response = await fetch(
			`http://${ip}:${port}/explicit-resource-management`
		);
		expect(await response.json()).toMatchInlineSnapshot(`
			[
			  "Connected",
			  "Connected",
			  "Sent hello",
			  "Sent goodbye",
			  "Disconnected asynchronously",
			  "Disconnected synchronously",
			]
		`);
	});

	it("reads local dev vars from the .env file", async () => {
		const response = await fetch(`http://${ip}:${port}/env`);
		const env = await response.text();
		expect(env).toBe(`"bar"`);
	});
});
