import assert from "node:assert";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "../helpers/account-id";
import { WranglerE2ETestHelper } from "../helpers/e2e-wrangler-test";
import { generateResourceName } from "../helpers/generate-resource-name";
import type {
	Miniflare,
	MiniflareOptions,
	RemoteProxyConnectionString,
	Response,
} from "miniflare";

// Note: the tests in this file are simple ones that check basic functionalities of the remote bindings programmatic APIs
//       various other aspects of these APIs (e.g. different bindings, reloading capabilities) are indirectly tested when
//       generally testing remote bindings

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)(
	"wrangler dev - remote bindings - programmatic API",
	async () => {
		const remoteWorkerName = generateResourceName();
		const helper = new WranglerE2ETestHelper();

		const { Miniflare } = await helper.importMiniflare();

		const {
			experimental_startRemoteProxySession: startRemoteProxySession,
			experimental_maybeStartOrUpdateRemoteProxySession:
				maybeStartOrUpdateRemoteProxySession,
		} = await helper.importWrangler();

		beforeAll(async () => {
			await helper.seed(resolve(__dirname, "./workers"));
			const { cleanup } = await helper.worker({
				workerName: remoteWorkerName,
				entryPoint: "remote-worker.js",
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

			test("user provided (incorrect but then corrected) auth data", async () => {
				const remoteProxySession = await startRemoteProxySession(
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
				await remoteProxySession.ready;

				const mf = new Miniflare(
					getMfOptions(remoteProxySession.remoteProxyConnectionString)
				);

				const noResponse = await timedDispatchFetch(mf);
				// We are unable to fetch from the worker since the remote connection is not correctly established
				expect(noResponse).toBe(null);

				assert(process.env.CLOUDFLARE_API_TOKEN);

				const amendedRemoteProxySession = await startRemoteProxySession(
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
								apiToken: process.env.CLOUDFLARE_API_TOKEN,
							},
						},
					}
				);

				await amendedRemoteProxySession.ready;

				await mf.setOptions(
					getMfOptions(amendedRemoteProxySession.remoteProxyConnectionString)
				);

				const response = await timedDispatchFetch(mf);
				const responseText = await response?.text();

				expect(responseText).toEqual(
					"worker response: Hello from a remote worker"
				);

				await mf.dispose();
				await remoteProxySession.dispose();
				await amendedRemoteProxySession.dispose();
			});
		});

		describe("maybeStartOrUpdateRemoteProxySession", () => {
			test("base usage", async () => {
				const proxySessionData = await maybeStartOrUpdateRemoteProxySession({
					bindings: {
						MY_SERVICE: {
							type: "service",
							service: remoteWorkerName,
							experimental_remote: true,
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

			test("user provided (incorrect but then corrected) auth data", async () => {
				let proxySessionData = await maybeStartOrUpdateRemoteProxySession(
					{
						bindings: {
							MY_SERVICE: {
								type: "service",
								service: remoteWorkerName,
								experimental_remote: true,
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

				assert(proxySessionData);

				await proxySessionData.session.ready;

				const mf = new Miniflare(
					getMfOptions(proxySessionData.session.remoteProxyConnectionString)
				);

				const noResponse = await timedDispatchFetch(mf);
				// We are unable to fetch from the worker since the remote connection is not correctly established
				expect(noResponse).toBe(null);

				assert(process.env.CLOUDFLARE_API_TOKEN);

				proxySessionData = await maybeStartOrUpdateRemoteProxySession(
					{
						bindings: {
							MY_SERVICE: {
								type: "service",
								service: remoteWorkerName,
								experimental_remote: true,
							},
						},
					},
					proxySessionData,
					{
						accountId: CLOUDFLARE_ACCOUNT_ID,
						apiToken: {
							apiToken: process.env.CLOUDFLARE_API_TOKEN,
						},
					}
				);

				assert(proxySessionData);

				await mf.setOptions(
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
		});
	}
);

async function timedDispatchFetch(mf: Miniflare): Promise<Response | null> {
	try {
		return await mf.dispatchFetch("http://localhost/", {
			signal: AbortSignal.timeout(5000),
		});
	} catch {
		return null;
	}
}
