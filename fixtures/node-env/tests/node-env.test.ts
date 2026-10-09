import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { describe, it, onTestFinished, vi } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("`process.env.NODE_ENV` replacement in development", () => {
	it("replaces `process.env.NODE_ENV` with `development` if it is `undefined`", async ({
		expect,
	}) => {
		vi.stubEnv("NODE_ENV", undefined);
		onTestFinished(() => {
			vi.unstubAllEnvs();
		});

		const { ip, port, stop } = await runWranglerDev(
			path.resolve(__dirname, ".."),
			["--port=0", "--inspector-port=0"]
		);
		onTestFinished(stop);

		// NODE_ENV is fixed at startup. Await the first response instead of racing
		// a cold Worker against vi.waitFor's one-second polling timeout.
		const response = await fetch(`http://${ip}:${port}/`);
		expect(await response.text()).toBe(
			`The value of process.env.NODE_ENV is "development"`
		);
	});

	it("replaces `process.env.NODE_ENV` with the given value if it is set", async ({
		expect,
	}) => {
		vi.stubEnv("NODE_ENV", "some-value");
		onTestFinished(() => {
			vi.unstubAllEnvs();
		});

		const { ip, port, stop } = await runWranglerDev(
			path.resolve(__dirname, ".."),
			["--port=0", "--inspector-port=0"]
		);
		onTestFinished(stop);

		const response = await fetch(`http://${ip}:${port}/`);
		expect(await response.text()).toBe(
			`The value of process.env.NODE_ENV is "some-value"`
		);
	});
});

describe("`process.env.NODE_ENV` replacement in production", () => {
	const url = "http://localhost";

	it("replaces `process.env.NODE_ENV` with `production` if it is `undefined`", async ({
		expect,
	}) => {
		vi.stubEnv("NODE_ENV", undefined);
		onTestFinished(() => {
			vi.unstubAllEnvs();
		});

		spawnSync("npx wrangler build", {
			shell: true,
			stdio: "pipe",
		});

		const miniflare = new Miniflare(
			convertV4MiniflareOptions({
				modules: [
					{
						type: "ESModule",
						path: "./dist/index.js",
					},
				],
			})
		);
		onTestFinished(() => miniflare.dispose());

		await miniflare.ready;

		const response = await miniflare.dispatchFetch(url);
		expect(await response.text()).toBe(
			`The value of process.env.NODE_ENV is "production"`
		);
	});

	it("replaces `process.env.NODE_ENV` with the given value if it is set", async ({
		expect,
	}) => {
		vi.stubEnv("NODE_ENV", "some-value");
		onTestFinished(() => {
			vi.unstubAllEnvs();
		});

		spawnSync("npx wrangler build", {
			shell: true,
			stdio: "pipe",
		});

		const miniflare = new Miniflare(
			convertV4MiniflareOptions({
				modules: [
					{
						type: "ESModule",
						path: "./dist/index.js",
					},
				],
			})
		);
		onTestFinished(() => miniflare.dispose());

		await miniflare.ready;

		const response = await miniflare.dispatchFetch(url);
		expect(await response.text()).toBe(
			`The value of process.env.NODE_ENV is "some-value"`
		);
	});

	it("tree shakes React when `process.env.NODE_ENV` is `production`", ({
		expect,
	}) => {
		vi.stubEnv("NODE_ENV", undefined);
		onTestFinished(() => {
			vi.unstubAllEnvs();
		});

		spawnSync("npx wrangler build", {
			shell: true,
			stdio: "pipe",
		});

		const outputJs = fs.readFileSync("./dist/index.js", "utf8");

		expect(outputJs).not.toContain("react-dom.development.js");
		// the React development code links to the facebook/react repo
		expect(outputJs).not.toContain("https://github.com/facebook/react");
	});
});
