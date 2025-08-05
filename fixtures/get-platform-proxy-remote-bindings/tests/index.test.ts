import { execSync } from "child_process";
import { randomUUID } from "crypto";
import assert from "node:assert";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { getPlatformProxy } from "wrangler";
import type { KVNamespace } from "@cloudflare/workers-types/experimental";
import type { DispatchFetch, Response } from "miniflare";

type Fetcher = { fetch: DispatchFetch };

const auth = getAuthenticatedEnv();
const execOptions = {
	encoding: "utf8",
	env: { ...process.env, ...auth },
} as const;
const remoteWorkerName = `tmp-e2e-worker-test-remote-bindings-${randomUUID().split("-")[0]}`;
const remoteStagingWorkerName = `tmp-e2e-staging-worker-test-remote-bindings-${randomUUID().split("-")[0]}`;
const remoteKvName = `tmp-e2e-remote-kv-test-remote-bindings-${randomUUID().split("-")[0]}`;

if (auth) {
	describe(
		"getPlatformProxy - remote bindings",
		() => {
			let remoteKvId: string;
			beforeAll(async () => {
				const deployOut = execSync(
					`pnpm wrangler deploy remote-worker.js --name ${remoteWorkerName} --compatibility-date 2025-06-19`,
					execOptions
				);

				if (!new RegExp(`Deployed\\s+${remoteWorkerName}\\b`).test(deployOut)) {
					throw new Error(`Failed to deploy ${remoteWorkerName}`);
				}

				const stagingDeployOut = execSync(
					`pnpm wrangler deploy remote-worker.staging.js --name ${remoteStagingWorkerName} --compatibility-date 2025-06-19`,
					execOptions
				);

				if (
					!new RegExp(`Deployed\\s+${remoteStagingWorkerName}\\b`).test(
						stagingDeployOut
					)
				) {
					throw new Error(`Failed to deploy ${remoteStagingWorkerName}`);
				}

				const kvAddOut = execSync(
					`pnpm wrangler kv namespace create ${remoteKvName}`,
					execOptions
				);

				const createdKvRegexMatch = kvAddOut.match(/"id": "(?<id>[^"]*?)"/);
				const maybeRemoteKvId = createdKvRegexMatch?.groups?.["id"];
				assert(maybeRemoteKvId, `Failed to create remote kv ${remoteKvName}`);
				remoteKvId = maybeRemoteKvId;

				execSync(
					`pnpm wrangler kv key put test-key remote-kv-value --namespace-id=${remoteKvId} --remote`,
					execOptions
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
							env: {
								staging: {
									services: [
										{
											binding: "MY_WORKER",
											service: remoteStagingWorkerName,
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
							},
						},
						undefined,
						2
					),
					"utf8"
				);
			}, 25_000);

			afterAll(() => {
				execSync(
					`pnpm wrangler delete --name ${remoteWorkerName}`,
					execOptions
				);
				execSync(
					`pnpm wrangler delete --name ${remoteStagingWorkerName}`,
					execOptions
				);
				execSync(
					`pnpm wrangler kv namespace delete --namespace-id=${remoteKvId}`,
					execOptions
				);
				rmSync("./.tmp", { recursive: true, force: true });
			}, 25_000);

			test("getPlatformProxy works with remote bindings", async () => {
				vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", auth.CLOUDFLARE_ACCOUNT_ID);
				vi.stubEnv("CLOUDFLARE_API_TOKEN", auth.CLOUDFLARE_API_TOKEN);

				const { env, dispose } = await getPlatformProxy<{
					MY_WORKER: Fetcher;
					MY_KV: KVNamespace;
				}>({
					configPath: "./.tmp/wrangler.json",
					experimental: { remoteBindings: true },
				});

				const response = await fetchFromWorker(env.MY_WORKER, "OK");
				const workerText = await response?.text();
				expect(workerText).toEqual(
					"Hello from a remote Worker part of the getPlatformProxy remote bindings fixture!"
				);

				const kvValue = await env.MY_KV.get("test-key");
				expect(kvValue).toEqual("remote-kv-value");

				await dispose();
			});

			test("getPlatformProxy works with remote bindings specified in an environment", async () => {
				vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", auth.CLOUDFLARE_ACCOUNT_ID);
				vi.stubEnv("CLOUDFLARE_API_TOKEN", auth.CLOUDFLARE_API_TOKEN);
				const { env, dispose } = await getPlatformProxy<{
					MY_WORKER: Fetcher;
					MY_KV: KVNamespace;
				}>({
					configPath: "./.tmp/wrangler.json",
					experimental: { remoteBindings: true },
					environment: "staging",
				});

				const workerText = await (
					await env.MY_WORKER.fetch("http://example.com")
				).text();
				expect(workerText).toEqual(
					"Hello from a remote Worker, defined for the staging environment, part of the getPlatformProxy remote bindings fixture!"
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

				const response = await fetchFromWorker(
					env.MY_WORKER,
					"Service Unavailable"
				);
				const workerText = await response?.text();
				expect(workerText).toEqual(
					`[wrangler] Couldn\'t find \`wrangler dev\` session for service "${remoteWorkerName}" to proxy to`
				);

				const kvValue = await env.MY_KV.get("test-key");
				expect(kvValue).toEqual(null);

				await dispose();
			});
		},
		{ timeout: 50_000 }
	);
} else {
	test.skip("getPlatformProxy - remote bindings (no auth credentials)");
}

/**
 * Tries to fetch from a worker multiple times until a response is returned which matches a specified
 * statusText. Each fetch has a timeout signal making sure that it can't simply get stuck.
 *
 * This utility is used, instead of directly fetching from the Worker in order to prevent flakiness.
 *
 * @param worker The Worker to fetch from.
 * @param expectedStatusText The response's expected statusText.
 * @returns The successful Worker's response or null if no such response was obtained.
 */
async function fetchFromWorker(
	worker: Fetcher,
	expectedStatusText: string
): Promise<Response> {
	return vi.waitFor(
		async () => {
			const response = await worker.fetch("http://example.com", {
				signal: AbortSignal.timeout(5_000),
			});
			expect(response.statusText).toEqual(expectedStatusText);
			return response;
		},
		{ timeout: 30_000, interval: 500 }
	);
}

/**
 * Gets an env object containing Cloudflare credentials or undefined if not authenticated.
 *
 * In the Github actions we convert the TEST_CLOUDFLARE_ACCOUNT_ID and TEST_CLOUDFLARE_API_TOKEN env variables.
 * In local development we can rely on CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN env variables directly.
 */
function getAuthenticatedEnv() {
	const CLOUDFLARE_ACCOUNT_ID =
		process.env.TEST_CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
	const CLOUDFLARE_API_TOKEN =
		process.env.TEST_CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;

	if (CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN) {
		return {
			CLOUDFLARE_API_TOKEN,
			CLOUDFLARE_ACCOUNT_ID,
		};
	}
	console.warn(
		"Skipping vitest-pool-workers remote bindings tests because the environment is not authenticated with Cloudflare."
	);
}
