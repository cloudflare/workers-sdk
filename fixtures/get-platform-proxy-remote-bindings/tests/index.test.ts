import { execSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	afterAll,
	assert,
	beforeAll,
	beforeEach,
	describe,
	test,
	vi,
} from "vitest";
import { getPlatformProxy } from "wrangler";
import type { KVNamespace } from "@cloudflare/workers-types/experimental";
import type { DispatchFetch, Response } from "miniflare";
import type { AddressInfo } from "node:net";
import type { ExpectStatic } from "vitest";

type Fetcher = { fetch: DispatchFetch };

const workersDomain =
	process.env.E2E_ACCOUNT_WORKERS_DEV_DOMAIN ??
	"devprod-testing7928.workers.dev";
const auth = getAuthenticatedEnv();
const execOptions = {
	encoding: "utf8",
	env: { ...process.env, ...auth },
} as const;
const remoteWorkerName = `preserve-e2e-get-platform-proxy-remote`;
const remoteStagingWorkerName = `preserve-e2e-get-platform-proxy-remote-staging`;
// Shared across runs like the Workers above, and kept out of the scheduled
// cleanup by its `preserve-e2e-` prefix. A brand-new namespace can reject
// writes with "namespace not found" for longer than setup can wait, so reusing
// one means only the very first run ever has to wait for that.
const remoteKvName = "preserve-e2e-get-platform-proxy-kv";
const remoteKvKey = "test-key";
const remoteKvValue = "remote-kv-value";

if (auth) {
	describe("getPlatformProxy - remote bindings", { timeout: 50_000 }, () => {
		let remoteKvId: string;

		beforeAll(async () => {
			const deployedUrl = `https://preserve-e2e-get-platform-proxy-remote.${workersDomain}/`;

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
						assert.equal(response.status, 200);
					},
					{ timeout: 5000, interval: 500 }
				);
			}

			const stagingDeployedUrl = `https://preserve-e2e-get-platform-proxy-remote-staging.${workersDomain}/`;
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
						assert.equal(response.status, 200);
					},
					{ timeout: 5000, interval: 500 }
				);
			}

			remoteKvId = ensureKvNamespace(remoteKvName);

			// Only a newly created (or emptied) namespace needs the write. Brand-new
			// namespaces may not be available to the KV write API yet.
			if (readKvValue(remoteKvId, remoteKvKey) !== remoteKvValue) {
				await vi.waitFor(
					() => {
						execSync(
							`pnpm wrangler kv key put ${remoteKvKey} ${remoteKvValue} --namespace-id=${remoteKvId} --remote`,
							{ ...execOptions, timeout: 10_000 }
						);
					},
					{ timeout: 45_000, interval: 2_000 }
				);
			}

			rmSync("./.tmp", { recursive: true, force: true });
			mkdirSync("./.tmp");
		}, 90_000);

		afterAll(() => {
			try {
				rmSync("./.tmp", {
					recursive: true,
					force: true,
					maxRetries: 10,
					retryDelay: 100,
				});
			} catch {}
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

			test("getPlatformProxy works with remote bindings", async ({
				expect,
				onTestFinished,
			}) => {
				vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", auth.CLOUDFLARE_ACCOUNT_ID);
				vi.stubEnv("CLOUDFLARE_API_TOKEN", auth.CLOUDFLARE_API_TOKEN);

				const { env, dispose } = await getPlatformProxy<{
					MY_WORKER: Fetcher;
					MY_KV: KVNamespace;
				}>({
					configPath: "./.tmp/normal-usage/wrangler.json",
				});
				onTestFinished(dispose);

				const response = await fetchFromWorker(expect, env.MY_WORKER, "OK");
				const workerText = await response.text();
				expect(workerText).toEqual(
					"Hello from a remote Worker part of the getPlatformProxy remote bindings fixture!"
				);

				const kvValue = await env.MY_KV.get("test-key");
				expect(kvValue).toEqual("remote-kv-value");
			});

			test("getPlatformProxy works with remote bindings specified in an environment", async ({
				expect,
				onTestFinished,
			}) => {
				vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", auth.CLOUDFLARE_ACCOUNT_ID);
				vi.stubEnv("CLOUDFLARE_API_TOKEN", auth.CLOUDFLARE_API_TOKEN);
				const { env, dispose } = await getPlatformProxy<{
					MY_WORKER: Fetcher;
					MY_KV: KVNamespace;
				}>({
					configPath: "./.tmp/normal-usage/wrangler.json",
					environment: "staging",
				});
				onTestFinished(dispose);

				const workerText = await (
					await fetchFromWorker(expect, env.MY_WORKER, "OK")
				).text();
				expect(workerText).toEqual(
					"Hello from a remote Worker, defined for the staging environment, part of the getPlatformProxy remote bindings fixture!"
				);

				const kvValue = await env.MY_KV.get("test-key");
				expect(kvValue).toEqual("remote-kv-value");
			});
		});

		describe("account id taken from the wrangler config", () => {
			beforeEach(() => {
				vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", undefined);
				vi.stubEnv("CLOUDFLARE_API_TOKEN", auth.CLOUDFLARE_API_TOKEN);
			});

			test("usage with a wrangler config file with a valid account id", async ({
				expect,
				onTestFinished,
			}) => {
				mkdirSync("./.tmp/config-with-no-account-id", { recursive: true });

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
				onTestFinished(dispose);

				const response = await fetchFromWorker(expect, env.MY_WORKER, "OK");
				const workerText = await response.text();
				expect(workerText).toEqual(
					"Hello from a remote Worker part of the getPlatformProxy remote bindings fixture!"
				);
			});
		});
	});
} else {
	test.skip("getPlatformProxy - remote bindings (no auth credentials)");
}

test.for(["service", "hyperdrive"] as const)(
	"getPlatformProxy validates the configured account ID for remote %s",
	async (binding, { expect }) => {
		const directory = mkdtempSync(
			join(tmpdir(), "platform-proxy-invalid-account-")
		);
		const configPath = join(directory, "wrangler.json");
		try {
			vi.stubEnv("CLOUDFLARE_API_TOKEN", "not-used-for-an-invalid-account");
			writeFileSync(
				configPath,
				JSON.stringify({
					name: "get-platform-proxy-fixture-test",
					account_id: "NOT a valid account id",
					compatibility_date: "2025-06-01",
					...(binding === "service"
						? {
								services: [
									{
										binding: "MY_WORKER",
										service: remoteWorkerName,
										remote: true,
									},
								],
							}
						: {
								hyperdrive: [
									{ binding: "DB", id: "a".repeat(32), remote: true },
								],
							}),
				})
			);
			const proxy = getPlatformProxy<{ MY_WORKER: Fetcher }>({
				configPath,
				persist: false,
			});
			const accountError =
				'Invalid account ID "NOT a valid account id" set in your Wrangler configuration file.';
			try {
				if (binding === "hyperdrive") {
					const startupError = await proxy.then(
						() => undefined,
						(error: unknown) => error
					);
					expect(startupError).toBeInstanceOf(Error);
					expect(startupError).toHaveProperty(
						"message",
						expect.stringContaining(accountError)
					);
					return;
				}
				const response = await (
					await proxy
				).env.MY_WORKER.fetch("http://example.com", {
					signal: AbortSignal.timeout(5_000),
				});
				expect(response.status).toBe(503);
				expect(await response.text()).toContain(accountError);
			} finally {
				await proxy.then(
					({ dispose }) => dispose(),
					() => {}
				);
			}
		} finally {
			vi.unstubAllEnvs();
			rmSync(directory, { recursive: true, force: true });
		}
	}
);

test.for([
	{
		status: 400,
		code: 10000,
		message: "remote session could not be authenticated",
	},
	{ status: 403, code: 9999, message: "Account access denied" },
	{ status: 404, code: 9999, message: "Account not found" },
])(
	"getPlatformProxy fails remote Hyperdrive startup for an API rejection ($status)",
	async ({ status, code, message }, { expect }) => {
		const directory = mkdtempSync(
			join(tmpdir(), "platform-proxy-api-rejection-")
		);
		const configPath = join(directory, "wrangler.json");
		const requested = vi.fn();
		const server = createServer((request, response) => {
			requested(request.url);
			response
				.writeHead(status, { "Content-Type": "application/json" })
				.end(JSON.stringify({ success: false, errors: [{ code, message }] }));
		});
		try {
			server.listen(0, "127.0.0.1");
			await once(server, "listening");
			vi.stubEnv(
				"CLOUDFLARE_API_BASE_URL",
				`http://127.0.0.1:${(server.address() as AddressInfo).port}/client/v4`
			);
			vi.stubEnv("CLOUDFLARE_API_TOKEN", "mock-token");
			writeFileSync(
				configPath,
				JSON.stringify({
					name: "get-platform-proxy-fixture-test",
					account_id: "a".repeat(32),
					compatibility_date: "2025-06-01",
					hyperdrive: [{ binding: "DB", id: "b".repeat(32), remote: true }],
				})
			);
			const startupError = await getPlatformProxy({
				configPath,
				persist: false,
			}).then(
				async ({ dispose }) => {
					await dispose();
				},
				(error: unknown) => error
			);
			expect(startupError).toBeInstanceOf(Error);
			expect(startupError).toHaveProperty(
				"message",
				expect.stringContaining(message)
			);
			expect(requested).toHaveBeenCalledExactlyOnceWith(
				expect.stringMatching(/\/subdomain\/edge-preview$/)
			);
		} finally {
			vi.unstubAllEnvs();
			server.closeAllConnections();
			await new Promise<void>((resolve) => server.close(() => resolve()));
			rmSync(directory, { recursive: true, force: true });
		}
	}
);

/**
 * Polls a remote Worker until it responds with the expected status text.
 * Each request has a timeout so a hung connection cannot block polling indefinitely.
 *
 * @param expect The test context's assertion function.
 * @param worker The Worker to fetch from.
 * @param expectedStatusText The response's expected statusText.
 * @param timeout The maximum time to poll, in milliseconds.
 * @returns The successful Worker's response.
 * @throws If no matching response is obtained before the timeout.
 */
async function fetchFromWorker(
	expect: ExpectStatic,
	worker: Fetcher,
	expectedStatusText: string,
	timeout = 30_000
): Promise<Response> {
	return vi.waitFor(
		async () => {
			const response = await worker.fetch("http://example.com", {
				signal: AbortSignal.timeout(5_000),
			});
			// waitFor retries rejected callbacks; swallowing errors ends polling early.
			expect(response.statusText).toEqual(expectedStatusText);
			return response;
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
		"Skipping vitest-plugin remote bindings tests because the environment is not authenticated with Cloudflare."
	);
}

/**
 * Lists the account's KV namespaces through Wrangler.
 */
function listKvNamespaces(): { id: string; title: string }[] {
	const out = execSync("pnpm wrangler kv namespace list", execOptions);
	return JSON.parse(out.slice(out.search(/^\[/m)));
}

/**
 * Returns the ID of the KV namespace with the given title, creating it if it
 * doesn't exist yet.
 */
function ensureKvNamespace(title: string): string {
	const existing = listKvNamespaces().find((ns) => ns.title === title);
	if (existing) {
		return existing.id;
	}
	try {
		const out = execSync(
			`pnpm wrangler kv namespace create ${title}`,
			execOptions
		);
		const id = out.match(/"id": "(?<id>[^"]*?)"/)?.groups?.["id"];
		if (id) {
			return id;
		}
	} catch {
		// Another CI job may have created it at the same time; look it up below.
	}
	const created = listKvNamespaces().find((ns) => ns.title === title);
	assert(created, `Failed to find or create KV namespace ${title}`);
	return created.id;
}

/**
 * Reads a KV value as text, or returns `undefined` if the key is missing or the
 * read fails.
 */
function readKvValue(namespaceId: string, key: string): string | undefined {
	try {
		return execSync(
			`pnpm wrangler kv key get ${key} --namespace-id=${namespaceId} --remote --text`,
			{ ...execOptions, timeout: 10_000, stdio: ["ignore", "pipe", "ignore"] }
		).trim();
	} catch {
		return undefined;
	}
}
