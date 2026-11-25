import events from "node:events";
import path from "node:path";
import { mockConsoleMethods } from "@cloudflare/workers-utils/test-helpers";
import dedent from "ts-dedent";
import { afterEach, assert, beforeEach, describe, test, vi } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import {
	importWrangler,
	WranglerE2ETestHelper,
} from "./helpers/e2e-wrangler-test";
import { waitForLong } from "./helpers/wait-for";
import type { Worker } from "../src/api/startDevWorker";
import type { ExpectStatic } from "vitest";

const { unstable_startWorker: startWorker } = await importWrangler();

// AI is a remote-only binding, so its remote session only connects on the first
// binding call. A failed authentication fails that call and is logged as this
// warning, rather than emitted as an error on the worker.
const AUTH_WARNING =
	"Could not connect remote bindings: This Worker uses bindings that need to run remotely, even when developing locally, but the remote session could not be authenticated.";

describe("startWorker - auth options", { concurrent: false }, () => {
	let worker: Worker | undefined;
	describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)("with remote bindings", () => {
		let helper: WranglerE2ETestHelper;

		const std = mockConsoleMethods();

		beforeEach(async () => {
			helper = new WranglerE2ETestHelper();
			const aiWorkerScript = dedent`
			export default {
				async fetch(_request, env) {
					const messages = [
						{
							role: "user",
							content:
								"Respond with the exact text 'This is a response from Workers AI.'. Do not include any other text",
						},
					];

					const content = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
						messages,
					});

					return new Response(content.response);
				},
			}
		`;
			await helper.seed({
				"src/index.js": aiWorkerScript,
			});
		});

		afterEach(() => worker?.dispose());

		test("starting a worker with startWorker with the valid auth information and updating it with invalid information", async ({
			expect,
		}) => {
			const validAuth = vi.fn(() => {
				assert(process.env.CLOUDFLARE_API_TOKEN);

				return {
					accountId: CLOUDFLARE_ACCOUNT_ID,
					apiToken: {
						apiToken: process.env.CLOUDFLARE_API_TOKEN,
					},
				};
			});

			worker = await startWorker({
				entrypoint: path.resolve(helper.tmpPath, "src/index.js"),
				bindings: {
					AI: {
						type: "ai",
						remote: true,
					},
				},
				dev: {
					auth: validAuth,
					inspector: false,
					server: {
						port: 0,
					},
				},
			});

			await assertValidWorkerAiResponse(expect);

			expect(validAuth).toHaveBeenCalled();

			const incorrectAuth = vi.fn(() => {
				return {
					accountId: CLOUDFLARE_ACCOUNT_ID,
					apiToken: {
						apiToken: "This is an incorrect API TOKEN!",
					},
				};
			});

			await worker.patchConfig({
				dev: {
					auth: incorrectAuth,
				},
			});

			await assertAuthErrorForWorkerAiResponse(expect);

			expect(incorrectAuth).toHaveBeenCalled();
		});

		test("starting a worker with startWorker with invalid auth information and updating it with valid auth information", async ({
			expect,
		}) => {
			const incorrectAuth = vi.fn(() => {
				return {
					accountId: CLOUDFLARE_ACCOUNT_ID,
					apiToken: {
						apiToken: "This is an incorrect API TOKEN!",
					},
				};
			});

			worker = await startWorker({
				entrypoint: path.resolve(helper.tmpPath, "src/index.js"),
				bindings: {
					AI: {
						type: "ai",
						remote: true,
					},
				},
				dev: {
					auth: incorrectAuth,
					inspector: false,
					server: {
						port: 0,
					},
				},
			});

			await assertAuthErrorForWorkerAiResponse(expect);

			expect(incorrectAuth).toHaveBeenCalled();

			const validAuth = vi.fn(() => {
				assert(process.env.CLOUDFLARE_API_TOKEN);

				return {
					accountId: CLOUDFLARE_ACCOUNT_ID,
					apiToken: {
						apiToken: process.env.CLOUDFLARE_API_TOKEN,
					},
				};
			});

			// `patchConfig` resolves before the reload disposes the failed remote
			// session, which may still be failing a binding call from the last
			// poll. A disposed session reports no errors, and disposal precedes
			// `reloadComplete`, so clear warnings only once the reload completes.
			// A failed rebuild emits `buildFailed` rather than `error`, so bound the
			// wait instead of relying on `events.once` rejecting. Awaiting both
			// together handles a timeout even while `patchConfig` is pending.
			await Promise.all([
				events.once(worker.raw, "reloadComplete", {
					signal: AbortSignal.timeout(20_000),
				}),
				worker.patchConfig({
					dev: {
						auth: validAuth,
					},
				}),
			]);
			vi.mocked(console.warn).mockClear();

			await assertValidWorkerAiResponse(expect);

			expect(validAuth).toHaveBeenCalled();
		});

		async function assertValidWorkerAiResponse(expect: ExpectStatic) {
			assert(worker, "Worker is not defined");
			const responseText = await fetchTimedTextFromWorker(worker);

			// We've fixed the auth information so now we can indeed get
			// a valid response from the worker
			expect(responseText).toBeTruthy();
			expect(responseText).toContain("This is a response from Workers AI.");

			// And the remote session authenticated without logging an auth warning
			expect(std.warn).not.toContain(AUTH_WARNING);
		}

		async function assertAuthErrorForWorkerAiResponse(expect: ExpectStatic) {
			assert(worker, "Worker is not defined");
			const responseText = await fetchTimedTextFromWorker(worker);

			// The remote connection is not established so we can't successfully
			// get a response from the worker
			expect(responseText).toBe(null);

			// And the authentication failure was logged as a warning
			expect(std.warn).toContain(AUTH_WARNING);
		}
	});

	describe("without remote bindings (no auth is needed)", () => {
		test("starting a worker via startWorker without any remote bindings (doesn't cause wrangler to try to get the auth information)", async ({
			expect,
		}) => {
			const helper = new WranglerE2ETestHelper();

			const simpleWorkerScript = dedent`
			export default {
				async fetch(_request, env) {
					return new Response('hello from a simple (local-only) worker');
				},
			}
		`;
			await helper.seed({
				"src/index.js": simpleWorkerScript,
			});

			const someAuth = vi.fn(() => {
				return {
					accountId: "",
					apiToken: {
						apiToken: "",
					},
				};
			});

			worker = await startWorker({
				entrypoint: path.resolve(helper.tmpPath, "src/index.js"),
				dev: {
					auth: someAuth,
					server: {
						port: 0,
					},
				},
			});

			const response = await fetchTimedTextFromWorker(worker);

			expect(response).toEqual("hello from a simple (local-only) worker");

			expect(someAuth).not.toHaveBeenCalled();
		});
	});
});

/**
 * Tries to fetch some text from a target worker, as part of this it also polls from the worker
 * trying multiple times to fetch from it.
 *
 * @param worker The worker in question
 * @returns The text from the worker's response, or null if not response could be obtained.
 */
async function fetchTimedTextFromWorker(
	worker: Worker
): Promise<string | null> {
	let responseText: string | null = null;

	try {
		assert(worker, "Worker is not defined");
		await waitForLong(
			async () => {
				responseText = await (
					await worker.fetch("http://example.com", {
						signal: AbortSignal.timeout(1000),
					})
				).text();
			},
			{ timeout: 20_000 }
		);
	} catch {
		return null;
	}

	return responseText;
}
