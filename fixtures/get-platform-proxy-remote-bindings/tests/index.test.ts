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
	describe("getPlatformProxy - remote bindings", { timeout: 50_000 }, () => {
		let remoteKvId: string;

		beforeAll(async () => {
			const deployOut = execSync(
				`pnpm wrangler deploy remote-worker.js --name ${remoteWorkerName} --compatibility-date 2025-06-19`,
				execOptions
			);
			const deployedUrl = deployOut.match(
				/(?<url>https:\/\/tmp-e2e-.+?\..+?\.workers\.dev)/
			)?.groups?.url;
			assert(deployedUrl, "Failed to find deployed worker URL");

			const stagingDeployOut = execSync(
				`pnpm wrangler deploy remote-worker.staging.js --name ${remoteStagingWorkerName} --compatibility-date 2025-06-19`,
				execOptions
			);
			const stagingDeployedUrl = stagingDeployOut.match(
				/(?<url>https:\/\/tmp-e2e-.+?\..+?\.workers\.dev)/
			)?.groups?.url;
			assert(stagingDeployedUrl, "Failed to find deployed staging worker URL");

			// Wait for the deployed workers to be available
			await Promise.all([
				vi.waitFor(
					async () => {
						const response = await fetch(deployedUrl);
						expect(response.status).toBe(200);
					},
					{ timeout: 5000, interval: 500 }
				),
				vi.waitFor(
					async () => {
						const response = await fetch(stagingDeployedUrl);
						expect(response.status).toBe(200);
					},
					{ timeout: 5000, interval: 500 }
				),
			]);

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
		}, 35_000);

		afterAll(() => {
			try {
				execSync(
					`pnpm wrangler delete --name ${remoteWorkerName}`,
					execOptions
				);
			} catch {}
			try {
				execSync(
					`pnpm wrangler delete --name ${remoteStagingWorkerName}`,
					execOptions
				);
			} catch {}
			try {
				execSync(
					`pnpm wrangler kv namespace delete --namespace-id=${remoteKvId}`,
					execOptions
				);
			} catch {}

			rmSync("./.tmp", {
				recursive: true,
				force: true,
				maxRetries: 10,
				retryDelay: 100,
			});
		}, 35_000);

		describe("normal usage", () => {
			beforeAll(async () => {
				mkdirSync("./.tmp/normal-usage");

				writeFileSync(
					"./.tmp/normal-usage/wrangler.json",
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
			});

			test("getPlatformProxy works with remote bindings", async () => {
				vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", auth.CLOUDFLARE_ACCOUNT_ID);
				vi.stubEnv("CLOUDFLARE_API_TOKEN", auth.CLOUDFLARE_API_TOKEN);

				const { env, dispose } = await getPlatformProxy<{
					MY_WORKER: Fetcher;
					MY_KV: KVNamespace;
				}>({
					configPath: "./.tmp/normal-usage/wrangler.json",
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
					configPath: "./.tmp/normal-usage/wrangler.json",
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
					configPath: "./.tmp/normal-usage/wrangler.json",
				});

				const response = await fetchFromWorker(
					env.MY_WORKER,
					"Service Unavailable"
				);
				const workerText = await response?.text();
				expect(workerText).toEqual(
					`Couldn't find a local dev session for the "default" entrypoint of service "${remoteWorkerName}" to proxy to`
				);

				const kvValue = await env.MY_KV.get("test-key");
				expect(kvValue).toEqual(null);

				await dispose();
			});
		});

		describe("account id taken from the wrangler config", () => {
			vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", undefined);
			vi.stubEnv("CLOUDFLARE_API_TOKEN", auth.CLOUDFLARE_API_TOKEN);

			test("usage with a wrangler config file with an invalid account id", async () => {
				mkdirSync("./.tmp/config-with-invalid-account-id");

				writeFileSync(
					"./.tmp/config-with-invalid-account-id/wrangler.json",
					JSON.stringify(
						{
							name: "get-platform-proxy-fixture-test",
							account_id: "NOT a valid account id",
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

				const { env, dispose } = await getPlatformProxy<{
					MY_WORKER: Fetcher;
				}>({
					configPath: "./.tmp/config-with-invalid-account-id/wrangler.json",
					experimental: { remoteBindings: true },
				});

				const response = await fetchFromWorker(env.MY_WORKER, "OK", 10_000);
				// The worker does not return a response
				expect(response).toBe(undefined);

				await dispose();
			});

			test("usage with a wrangler config file with a valid account id", async () => {
				mkdirSync("./.tmp/config-with-no-account-id");

				writeFileSync(
					"./.tmp/config-with-no-account-id/wrangler.json",
					JSON.stringify(
						{
							name: "get-platform-proxy-fixture-test",
							account_id: auth.CLOUDFLARE_ACCOUNT_ID,
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

				const { env, dispose } = await getPlatformProxy<{
					MY_WORKER: Fetcher;
				}>({
					configPath: "./.tmp/config-with-no-account-id/wrangler.json",
					experimental: { remoteBindings: true },
				});

				const response = await fetchFromWorker(env.MY_WORKER, "OK");
				const workerText = await response?.text();
				expect(workerText).toEqual(
					"Hello from a remote Worker part of the getPlatformProxy remote bindings fixture!"
				);

				await dispose();
			});
		});
	});
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
	expectedStatusText: string,
	timeout = 30_000
): Promise<Response | undefined> {
	return vi.waitFor(
		async () => {
			try {
				const response = await worker.fetch("http://example.com", {
					signal: AbortSignal.timeout(5_000),
				});
				expect(response.statusText).toEqual(expectedStatusText);
				return response;
			} catch {}
		},
		{ timeout, interval: 500 }
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
