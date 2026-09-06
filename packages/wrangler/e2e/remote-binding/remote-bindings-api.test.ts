import { resolve } from "node:path";
import { fetch } from "undici";
import { assert, beforeAll, describe, test } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "../helpers/account-id";
import {
	importMiniflare,
	importWrangler,
	WranglerE2ETestHelper,
} from "../helpers/e2e-wrangler-test";
import { normalizeOutput } from "../helpers/normalize";
import type {
	MiniflareOptions,
	Miniflare as MiniflareType,
	RemoteProxyConnectionString,
	Response,
} from "miniflare";

const { Miniflare } = await importMiniflare();
const { startRemoteProxySession, maybeStartOrUpdateRemoteProxySession } =
	await importWrangler();

// Note: the tests in this file are simple ones that check basic functionalities of the remote bindings programmatic APIs
//       various other aspects of these APIs (e.g. different bindings, reloading capabilities) are indirectly tested when
//       generally testing remote bindings

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)(
	"wrangler dev - remote bindings - programmatic API",
	async () => {
		const remoteWorkerName = "preserve-e2e-wrangler-remote-worker";
		const helper = new WranglerE2ETestHelper();

		beforeAll(async () => {
			await helper.seed(resolve(__dirname, "./workers"));
			await helper.ensureWorkerDeployed({
				workerName: remoteWorkerName,
				entryPoint: "remote-worker.js",
			});
		}, 35_000);

		function getMfOptions(
			remoteProxyConnectionString: RemoteProxyConnectionString
		): MiniflareOptions {
			return {
				workers: [
					{
						config: {
							type: "worker",
							name: "",
							compatibilityDate: "2025-09-06",
							manifest: {
								mainModule: "index.js",
								modules: {
									"index.js": {
										type: "esm",
										contents: `
											export default {
												async fetch(req, env) {
													const myServiceMsg = !env.MY_SERVICE ? null : await (await env.MY_SERVICE.fetch(req)).text();
													return new Response("worker response: " + (myServiceMsg ?? ""));
												}
											}`,
									},
								},
							},
							env: {
								MY_SERVICE: {
									type: "worker",
									worker: remoteWorkerName,
									dev: { remote: true },
								},
							},
						},
						dev: {
							remoteProxyConnectionString,
						},
					},
				],
			};
		}

		describe("startRemoteProxySession", () => {
			test("base usage", async ({ expect }) => {
				const remoteProxySession = await startRemoteProxySession({
					MY_SERVICE: {
						type: "service",
						service: remoteWorkerName,
					},
				});
				await remoteProxySession.ready;

				const mf = new Miniflare(
					getMfOptions(remoteProxySession.remoteProxyConnectionString)
				);

				const response = await timedDispatchFetch(mf);
				const responseText = await response?.text();

				expect(responseText).toEqual(
					"worker response: Hello from a remote worker"
				);

				await mf.dispose();
				await remoteProxySession.dispose();
			});

			test("handles different bindings across fresh sessions with the same Worker name", async ({
				expect,
			}) => {
				for (let i = 0; i < 2; i++) {
					const bindingName =
						i % 2 === 0 ? "REMOTE_WORKER_A" : "REMOTE_WORKER_B";
					const remoteProxySession = await startRemoteProxySession(
						{
							[bindingName]: {
								type: "service",
								service: remoteWorkerName,
							},
						},
						{ workerName: "remote-bindings-fresh-session-stress-test" }
					);

					try {
						const response = await fetch(
							remoteProxySession.remoteProxyConnectionString,
							{ headers: { "MF-Binding": bindingName } }
						);
						expect(await response.text(), `iteration ${i}`).toBe(
							"Hello from a remote worker"
						);
					} finally {
						await remoteProxySession.dispose();
					}
				}
			});

			test("user provided incorrect auth data", async ({ expect }) => {
				let error: unknown;
				try {
					await startRemoteProxySession(
						{
							MY_SERVICE: {
								type: "service",
								service: remoteWorkerName,
							},
						},
						{
							auth: {
								accountId: CLOUDFLARE_ACCOUNT_ID,
								apiToken: {
									apiToken: "This is an incorrect API TOKEN!",
								},
							},
						}
					);
				} catch (e) {
					error = e;
				}
				expect(normalizeOutput(`${error}`)).toMatchInlineSnapshot(
					`
					"Error: This Worker uses bindings that need to run remotely, even when developing locally, but the remote session could not be authenticated.
					It looks like you are authenticating via a custom API token (\`CLOUDFLARE_API_TOKEN\`) set in an environment variable.
					The token may be invalid or lack the required permissions for this operation.
					To fix this, verify that your token is valid and has the correct permissions.
					You can also run \`wrangler whoami\` to check your current authentication status."
				`
				);
			});
		});

		describe("maybeStartOrUpdateRemoteProxySession", () => {
			test("base usage", async ({ expect }) => {
				const proxySessionData = await maybeStartOrUpdateRemoteProxySession({
					bindings: {
						MY_SERVICE: {
							type: "service",
							service: remoteWorkerName,
							remote: true,
						},
					},
				});

				assert(proxySessionData);

				await proxySessionData.session.ready;

				const mf = new Miniflare(
					getMfOptions(proxySessionData.session.remoteProxyConnectionString)
				);

				const response = await timedDispatchFetch(mf);
				const responseText = await response?.text();

				expect(responseText).toEqual(
					"worker response: Hello from a remote worker"
				);

				await mf.dispose();
				await proxySessionData.session.dispose();
			});

			test("user provided incorrect auth data", async ({ expect }) => {
				let error: unknown;
				try {
					await maybeStartOrUpdateRemoteProxySession(
						{
							bindings: {
								MY_SERVICE: {
									type: "service",
									service: remoteWorkerName,
									remote: true,
								},
							},
						},
						undefined,
						{
							accountId: CLOUDFLARE_ACCOUNT_ID,
							apiToken: {
								apiToken: "This is an incorrect API TOKEN!",
							},
						}
					);
				} catch (e) {
					error = e;
				}
				expect(normalizeOutput(`${error}`)).toMatchInlineSnapshot(
					`
					"Error: This Worker uses bindings that need to run remotely, even when developing locally, but the remote session could not be authenticated.
					It looks like you are authenticating via a custom API token (\`CLOUDFLARE_API_TOKEN\`) set in an environment variable.
					The token may be invalid or lack the required permissions for this operation.
					To fix this, verify that your token is valid and has the correct permissions.
					You can also run \`wrangler whoami\` to check your current authentication status."
				`
				);
			});
		});
	}
);

async function timedDispatchFetch(mf: MiniflareType): Promise<Response | null> {
	try {
		return await mf.dispatchFetch("http://localhost/", {
			signal: AbortSignal.timeout(5000),
		});
	} catch {
		return null;
	}
}
