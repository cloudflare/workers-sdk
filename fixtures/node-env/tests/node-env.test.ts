import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { Miniflare } from "miniflare";
import { describe, it, vi } from "vitest";
import { createServer } from "wrangler";

describe("`process.env.NODE_ENV` replacement in development", () => {
	it("replaces `process.env.NODE_ENV` with `development` if it is `undefined`", async ({
		expect,
	}) => {
		vi.stubEnv("NODE_ENV", undefined);
		const server = createServer({
			root: path.resolve(__dirname, ".."),
			workers: [{ configPath: "wrangler.jsonc" }],
		});

		await server.listen();

		await vi.waitFor(async () => {
			const response = await server.fetch("/");
			const text = await response.text();
			expect(text).toBe(`The value of process.env.NODE_ENV is "development"`);
		});

		await server.close();

		vi.unstubAllEnvs();
	});

	it("replaces `process.env.NODE_ENV` with the given value if it is set", async ({
		expect,
	}) => {
		vi.stubEnv("NODE_ENV", "some-value");
		const server = createServer({
			root: path.resolve(__dirname, ".."),
			workers: [{ configPath: "wrangler.jsonc" }],
		});

		await server.listen();

		await vi.waitFor(async () => {
			const response = await server.fetch("/");
			const text = await response.text();
			expect(text).toBe(`The value of process.env.NODE_ENV is "some-value"`);
		});

		await server.close();

		vi.unstubAllEnvs();
	});
});

describe("`process.env.NODE_ENV` replacement in production", () => {
	const url = "http://localhost";

	it("replaces `process.env.NODE_ENV` with `production` if it is `undefined`", async ({
		expect,
	}) => {
		vi.stubEnv("NODE_ENV", undefined);

		spawnSync("npx wrangler build", {
			shell: true,
			stdio: "pipe",
		});

		const miniflare = new Miniflare({
			modules: [
				{
					type: "ESModule",
					path: "./dist/index.js",
				},
			],
		});

		await miniflare.ready;

		await vi.waitFor(async () => {
			const response = await miniflare.dispatchFetch(url);
			const text = await response.text();
			expect(text).toBe(`The value of process.env.NODE_ENV is "production"`);
		});

		await miniflare.dispose();

		vi.unstubAllEnvs();
	});

	it("replaces `process.env.NODE_ENV` with the given value if it is set", async ({
		expect,
	}) => {
		vi.stubEnv("NODE_ENV", "some-value");

		spawnSync("npx wrangler build", {
			shell: true,
			stdio: "pipe",
		});

		const miniflare = new Miniflare({
			modules: [
				{
					type: "ESModule",
					path: "./dist/index.js",
				},
			],
		});

		await miniflare.ready;

		await vi.waitFor(async () => {
			const response = await miniflare.dispatchFetch(url);
			const text = await response.text();
			expect(text).toBe(`The value of process.env.NODE_ENV is "some-value"`);
		});

		await miniflare.dispose();

		vi.unstubAllEnvs();
	});

	it("tree shakes React when `process.env.NODE_ENV` is `production`", ({
		expect,
	}) => {
		vi.stubEnv("NODE_ENV", undefined);

		spawnSync("npx wrangler build", {
			shell: true,
			stdio: "pipe",
		});

		const outputJs = fs.readFileSync("./dist/index.js", "utf8");

		expect(outputJs).not.toContain("react-dom.development.js");
		// the React development code links to the facebook/react repo
		expect(outputJs).not.toContain("https://github.com/facebook/react");

		vi.unstubAllEnvs();
	});
});
