import { execSync } from "child_process";
import { randomUUID } from "crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { Fetcher, KVNamespace } from "@cloudflare/workers-types/experimental";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { getPlatformProxy } from "wrangler";

if (
	!process.env.TEST_CLOUDFLARE_API_TOKEN ||
	!process.env.TEST_CLOUDFLARE_ACCOUNT_ID
) {
	console.warn("No credentials provided, skipping test...");
	process.exit(0);
}

describe("getPlatformProxy - remote bindings", () => {
	const remoteWorkerName = `tmp-e2e-worker-test-${randomUUID().split("-")[0]}`;
	const remoteKvName = `tmp-e2e-remote-kv-test-${randomUUID().split("-")[0]}`;
	let remoteKvId = "";

	beforeAll(async () => {
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

		const kvAddOut = execSync(
			`pnpm dlx wrangler kv namespace create ${remoteKvName}`,
			{
				stdio: "pipe",
			}
		);

		const createdKvRegexMatch = `${kvAddOut}`.match(/"id": "(?<id>[^"]*?)"/);
		const maybeRemoteKvId = createdKvRegexMatch?.groups?.["id"];

		if (!maybeRemoteKvId) {
			throw new Error(`Failed to create remote kv ${remoteKvName}`);
		}

		remoteKvId = maybeRemoteKvId;

		execSync(
			`pnpm dlx wrangler kv key put test-key remote-kv-value --namespace-id=${remoteKvId} --remote`
		);

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
					kv_namespaces: [
						{
							binding: "MY_KV",
							id: remoteKvId,
							experimental_remote: true,
						},
					],
				},
				undefined,
				2
			),
			"utf8"
		);
	}, 25_000);

	afterAll(async () => {
		execSync(`pnpm dlx wrangler delete --name ${remoteWorkerName}`);
		execSync(
			`pnpm dlx wrangler kv namespace delete --namespace-id=${remoteKvId}`
		);
		rmSync("./.tmp", { recursive: true, force: true });
	}, 25_000);

	test("getPlatformProxy works with remote bindings", async () => {
		const { env, dispose } = await getPlatformProxy<{
			MY_WORKER: Fetcher;
			MY_KV: KVNamespace;
		}>({
			configPath: "./.tmp/wrangler.json",
			experimental: { remoteBindings: true },
		});

		const workerText = await (
			await env.MY_WORKER.fetch("http://example.com")
		).text();
		expect(workerText).toEqual(
			"Hello from a remote Worker part of the getPlatformProxy remote bindings fixture!"
		);

		const kvValue = await env.MY_KV.get("test-key");
		expect(kvValue).toEqual("remote-kv-value");

		await dispose();
	});

	test("getPlatformProxy does not work with remote bindings if the experimental remoteBindings flag is not turned on", async () => {
		const { env, dispose } = await getPlatformProxy<{
			MY_WORKER: Fetcher;
			MY_KV: KVNamespace;
		}>({
			configPath: "./.tmp/wrangler.json",
		});

		const workerText = await (
			await env.MY_WORKER.fetch("http://example.com")
		).text();
		expect(workerText).toEqual(
			`[wrangler] Couldn\'t find \`wrangler dev\` session for service "${remoteWorkerName}" to proxy to`
		);

		const kvValue = await env.MY_KV.get("test-key");
		expect(kvValue).toEqual(null);

		await dispose();
	});
});
