import { execSync } from "child_process";
import { randomUUID } from "crypto";
import assert from "node:assert";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import test, { after, before, describe } from "node:test";
import { getPlatformProxy } from "wrangler";

if (
	!process.env.TEST_CLOUDFLARE_API_TOKEN ||
	!process.env.TEST_CLOUDFLARE_ACCOUNT_ID
) {
	console.warn("No credentials provided, skipping test...");
	process.exit(0);
}

describe("getPlatformProxy remote-bindings", () => {
	const remoteWorkerName = `get-platform-proxy-remote-worker-test-${randomUUID().split("-")[0]}`;

	before(async () => {
		// Note: ideally we pass the auth data to `getPlatformProxy`, that currently is not
		//       possible (DEVX-1857) so we need to make sure that the CLOUDFLARE_ACCOUNT_ID
		//       and CLOUDFLARE_API_TOKEN env variables are set so that `getPlatformProxy`
		//       can establish the remote proxy connection
		process.env.CLOUDFLARE_ACCOUNT_ID = process.env.TEST_CLOUDFLARE_ACCOUNT_ID;
		process.env.CLOUDFLARE_API_TOKEN = process.env.TEST_CLOUDFLARE_API_TOKEN;

		const deployOut = execSync(
			`pnpm dlx wrangler deploy remote-worker.js --name ${remoteWorkerName} --compatibility-date 2025-06-19`,
			{
				stdio: "pipe",
			}
		);

		if (
			!new RegExp(`Deployed\\s+${remoteWorkerName}\\b`).test(`${deployOut}`)
		) {
			throw new Error(`Failed to deploy ${remoteWorkerName}`);
		}

		rmSync("./.tmp", { recursive: true, force: true });

		mkdirSync("./.tmp");

		writeFileSync(
			"./.tmp/wrangler.json",
			JSON.stringify(
				{
					name: "get-platform-proxy-fixture-test",
					compatibility_date: "2025-06-01",
					services: [
						{
							binding: "MY_WORKER",
							service: remoteWorkerName,
							experimental_remote: true,
						},
					],
				},
				undefined,
				2
			),
			"utf8"
		);
	});

	test("getPlatformProxy works with remote bindings", async () => {
		const { env, dispose } = await getPlatformProxy({
			configPath: "./.tmp/wrangler.json",
			experimental: { remoteBindings: true },
		});

		try {
			assert.strictEqual(
				await (await env.MY_WORKER.fetch("http://example.com")).text(),
				"Hello from a remote Worker part of the getPlatformProxy remote bindings fixture!"
			);
		} finally {
			await dispose();
		}
	});

	after(async () => {
		execSync(`pnpm dlx wrangler delete --name ${remoteWorkerName}`);
		rmSync("./.tmp", { recursive: true, force: true });
	});
});
