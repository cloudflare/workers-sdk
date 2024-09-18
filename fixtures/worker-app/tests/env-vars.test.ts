import { execSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, it } from "vitest";
import {
	runWranglerDev,
	wranglerEntryPath,
} from "../../shared/src/run-wrangler-long-lived";

describe("'wrangler dev' with WRANGLER_BUILD_CONDITIONS", () => {
	let ip: string, port: number, stop: (() => Promise<unknown>) | undefined;

	beforeAll(async () => {
		({ ip, port, stop } = await runWranglerDev(
			resolve(__dirname, ".."),
			[
				"--port=0",
				"--inspector-port=0",
				"--upstream-protocol=https",
				"--host=prod.example.org",
			],
			{ ...process.env, WRANGLER_BUILD_CONDITIONS: "other,node,browser" }
		));
	});

	afterAll(async () => {
		await stop?.();
	});

	it("should import from the `other` package export", async ({ expect }) => {
		const response = await fetch(`http://${ip}:${port}/random`);
		expect(await response.text()).toEqual("010203040506");
	});
});

describe("'wrangler build' with  WRANGLER_BUILD_PLATFORM", () => {
	it("should import from node imports if platform is set to 'node'", ({
		expect,
	}) => {
		execSync(`node ${wranglerEntryPath} deploy --dry-run --outdir=dist/node`, {
			env: {
				...process.env,
				WRANGLER_BUILD_PLATFORM: "node",
			},
		});
		expect(
			readFileSync(resolve(__dirname, "../dist/node/index.js"), "utf8")
		).toContain("isomorphic-random-example/src/node.js");
	});

	it("should import from node imports if platform is set to 'browser'", ({
		expect,
	}) => {
		execSync(
			`node ${wranglerEntryPath} deploy --dry-run --outdir=dist/browser`,
			{
				env: {
					...process.env,
					WRANGLER_BUILD_PLATFORM: "browser",
				},
			}
		);
		expect(
			readFileSync(resolve(__dirname, "../dist/browser/index.js"), "utf8")
		).toContain("../isomorphic-random-example/src/workerd.mjs");
	});
});
