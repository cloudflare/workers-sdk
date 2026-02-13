import { execSync } from "child_process";
import { randomUUID } from "crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
/* eslint-disable workers-sdk/no-vitest-import-expect -- uses expect in helper functions and beforeAll */
import {
	afterAll,
	assert,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { getPlatformProxy } from "wrangler";
import type { KVNamespace } from "@cloudflare/workers-types/experimental";
import type { DispatchFetch, Response } from "miniflare";

type Fetcher = { fetch: DispatchFetch };

const auth = getAuthenticatedEnv();
const execOptions = {
	encoding: "utf8",
	env: { ...process.env, ...auth },
} as const;
const remoteWorkerName = `preserve-e2e-get-platform-proxy-remote`;
const remoteStagingWorkerName = `preserve-e2e-get-platform-proxy-remote-staging`;
const remoteKvName = `tmp-e2e-kv${Date.now()}-test-remote-bindings-${randomUUID().split("-")[0]}`;

const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

if (auth) {
	describe("getPlatformProxy - remote bindings", { timeout: 50_000 }, () => {
		let remoteKvId: string;

		beforeAll(async () => {
			const deployedUrl =
				"https://preserve-e2e-get-platform-proxy-remote.devprod-testing7928.workers.dev/";

			try {
				assert((await fetch(deployedUrl)).status !== 404);
			} catch (e) {
				execSync(
					`pnpm wrangler deploy remote-worker.js --name ${remoteWorkerName} --compatibility-date 2025-06-19`,
					execOptions
				);
				await vi.waitFor(
					async () => {
						const response = await fetch(deployedUrl);
						expect(response.status).toBe(200);
					},
					{ timeout: 5000, interval: 500 }
				);
			}

			const stagingDeployedUrl =
				"https://preserve-e2e-get-platform-proxy-remote-staging.devprod-testing7928.workers.dev/";
			try {
				assert((await fetch(stagingDeployedUrl)).status !== 404);
			} catch {
				execSync(
					`pnpm wrangler deploy remote-worker.staging.js --name ${remoteStagingWorkerName} --compatibility-date 2025-06-19`,
					execOptions
				);
				await vi.waitFor(
					async () => {
						const response = await fetch(stagingDeployedUrl);
						expect(response.status).toBe(200);
					},
					{ timeout: 5000, interval: 500 }
				);
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
		}, 35_000);

		afterAll(() => {
			try {
				execSync(
					`pnpm wrangler kv namespace delete --namespace-id=${remoteKvId}`,
					execOptions
				);
			} catch {}

			try {
				rmSync("./.tmp", {
					recursive: true,
					force: true,
					maxRetries: 10,
					retryDelay: 100,
				});
			} catch {}
		}, 35_000);

		beforeEach(() => {
			errorSpy.mockReset();
		});

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
									remote: true,
								},
							],
							kv_namespaces: [
								{
									binding: "MY_KV",
									id: remoteKvId,
									remote: true,
								},
							],
							env: {
								staging: {
									services: [
										{
											binding: "MY_WORKER",
											service: remoteStagingWorkerName,
											remote: true,
										},
									],
									kv_namespaces: [
										{
											binding: "MY_KV",
											id: remoteKvId,
											remote: true,
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
									remote: true,
								},
							],
						},
						undefined,
						2
					),
					"utf8"
				);

				await expect(
					getPlatformProxy<{
						MY_WORKER: Fetcher;
					}>({
						configPath: "./.tmp/config-with-invalid-account-id/wrangler.json",
					})
				).rejects.toMatchInlineSnapshot(
					`[Error: Failed to start the remote proxy session. There is likely additional logging output above.]`
				);

				expect(errorSpy).toHaveBeenCalledOnce();
				expect(
					`${errorSpy.mock.calls?.[0]?.[0]}`
						// Windows gets a different marker for ✘, so let's normalize it here
						// so that this test can be platform independent
						.replaceAll("✘", "X")
				).toMatchInlineSnapshot(`
					"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/NOT a valid account id/workers/subdomain/edge-preview) failed.[0m

					"
				`);
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
									remote: true,
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
