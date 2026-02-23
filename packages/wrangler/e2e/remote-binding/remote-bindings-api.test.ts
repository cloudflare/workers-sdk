import { resolve } from "node:path";
import { assert, beforeAll, describe, expect, test } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "../helpers/account-id";
import {
	importMiniflare,
	importWrangler,
	WranglerE2ETestHelper,
} from "../helpers/e2e-wrangler-test";
import { generateResourceName } from "../helpers/generate-resource-name";
import type {
	MiniflareOptions,
	Miniflare as MiniflareType,
	RemoteProxyConnectionString,
	Response,
} from "miniflare";

const { Miniflare } = await importMiniflare();
const {
	startRemoteProxySession: startRemoteProxySession,
	maybeStartOrUpdateRemoteProxySession: maybeStartOrUpdateRemoteProxySession,
} = await importWrangler();

// Note: the tests in this file are simple ones that check basic functionalities of the remote bindings programmatic APIs
//       various other aspects of these APIs (e.g. different bindings, reloading capabilities) are indirectly tested when
//       generally testing remote bindings

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)(
	"wrangler dev - remote bindings - programmatic API",
	async () => {
		const remoteWorkerName = generateResourceName();
		const helper = new WranglerE2ETestHelper();

		beforeAll(async () => {
			await helper.seed(resolve(__dirname, "./workers"));
			const { cleanup } = await helper.worker({
				workerName: remoteWorkerName,
				entryPoint: "remote-worker.js",
				cleanOnTestFinished: false,
			});
			return cleanup;
		}, 35_000);

		function getMfOptions(
			remoteProxyConnectionString: RemoteProxyConnectionString
		): MiniflareOptions {
			return {
				modules: true,
				script: `
				export default {
					async fetch(req, env) {
						const myServiceMsg = !env.MY_SERVICE ? null : await (await env.MY_SERVICE.fetch(req)).text();
						return new Response("worker response: " + (myServiceMsg ?? ""));
					}
				}`,
				serviceBindings: {
					MY_SERVICE: {
						name: remoteWorkerName,
						remoteProxyConnectionString,
					},
				},
			};
		}

		describe("startRemoteProxySession", () => {
			test("base usage", async () => {
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

			test("user provided incorrect auth data", async () => {
				await expect(
					startRemoteProxySession(
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
					)
				).rejects.toMatchInlineSnapshot(
					`[Error: Failed to start the remote proxy session. There is likely additional logging output above.]`
				);
			});
		});

		describe("maybeStartOrUpdateRemoteProxySession", () => {
			test("base usage", async () => {
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

			test("user provided incorrect auth data", async () => {
				await expect(
					maybeStartOrUpdateRemoteProxySession(
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
					)
				).rejects.toMatchInlineSnapshot(
					`[Error: Failed to start the remote proxy session. There is likely additional logging output above.]`
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
