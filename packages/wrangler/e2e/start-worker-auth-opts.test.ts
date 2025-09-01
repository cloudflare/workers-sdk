import assert from "node:assert";
import path from "node:path";
import dedent from "ts-dedent";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import type { Worker } from "../src/api/startDevWorker";
import type { MockInstance } from "vitest";

type Wrangler = Awaited<ReturnType<WranglerE2ETestHelper["importWrangler"]>>;

describe("startWorker - auth options", () => {
	let consoleErrorMock: MockInstance<typeof console.error>;

	beforeAll(() => {
		consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)("with remote bindings", () => {
		let helper: WranglerE2ETestHelper;
		let wrangler: Wrangler;
		let startWorker: Wrangler["unstable_startWorker"];

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

					const content = await env.AI.run("@hf/thebloke/zephyr-7b-beta-awq", {
						messages,
					});

					return new Response(content.response);
				},
			}
		`;
			await helper.seed({
				"src/index.js": aiWorkerScript,
			});
			wrangler = await helper.importWrangler();
			startWorker = wrangler.unstable_startWorker;
		});

		test("starting a worker with startWorker with the valid auth information and updating it with invalid information", async (t) => {
			t.onTestFinished(async () => await worker?.dispose());

			const validAuth = vi.fn(() => {
				assert(process.env.CLOUDFLARE_API_TOKEN);

				return {
					accountId: CLOUDFLARE_ACCOUNT_ID,
					apiToken: {
						apiToken: process.env.CLOUDFLARE_API_TOKEN,
					},
				};
			});

			const worker = await startWorker({
				entrypoint: path.resolve(helper.tmpPath, "src/index.js"),
				bindings: {
					AI: {
						type: "ai",
						experimental_remote: true,
					},
				},
				dev: {
					experimentalRemoteBindings: true,
					auth: validAuth,
					server: {
						port: 0,
					},
				},
			});

			await assertValidWorkerAiResponse(worker);

			expect(validAuth).toHaveBeenCalledOnce();

			consoleErrorMock.mockReset();

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
					experimentalRemoteBindings: true,
					auth: incorrectAuth,
				},
			});

			await assertInvalidWorkerAiResponse(worker);

			expect(incorrectAuth).toHaveBeenCalledOnce();
		});

		test("starting a worker with startWorker with invalid auth information and updating it with valid auth information", async (t) => {
			t.onTestFinished(async () => await worker?.dispose());

			const incorrectAuth = vi.fn(() => {
				return {
					accountId: CLOUDFLARE_ACCOUNT_ID,
					apiToken: {
						apiToken: "This is an incorrect API TOKEN!",
					},
				};
			});

			const worker = await startWorker({
				entrypoint: path.resolve(helper.tmpPath, "src/index.js"),
				bindings: {
					AI: {
						type: "ai",
						experimental_remote: true,
					},
				},
				dev: {
					experimentalRemoteBindings: true,
					auth: incorrectAuth,
					server: {
						port: 0,
					},
				},
			});

			await assertInvalidWorkerAiResponse(worker);

			expect(incorrectAuth).toHaveBeenCalledOnce();

			consoleErrorMock.mockReset();

			const validAuth = vi.fn(() => {
				assert(process.env.CLOUDFLARE_API_TOKEN);

				return {
					accountId: CLOUDFLARE_ACCOUNT_ID,
					apiToken: {
						apiToken: process.env.CLOUDFLARE_API_TOKEN,
					},
				};
			});

			await worker.patchConfig({
				dev: {
					experimentalRemoteBindings: true,
					auth: validAuth,
				},
			});

			await assertValidWorkerAiResponse(worker);

			expect(validAuth).toHaveBeenCalledOnce();
		});

		async function assertValidWorkerAiResponse(worker: Worker) {
			const responseText = await fetchTimedTextFromWorker(worker);

			// We've fixed the auth information so now we can indeed get
			// a valid response from the worker
			expect(responseText).toBeTruthy();
			expect(responseText).toContain("This is a response from Workers AI.");

			// And there should be no error regarding the Cloudflare API in the console
			expect(consoleErrorMock).not.toHaveBeenCalledWith(
				expect.stringMatching(
					/A request to the Cloudflare API \([^)]*\) failed\./
				)
			);
		}

		async function assertInvalidWorkerAiResponse(worker: Worker) {
			const responseText = await fetchTimedTextFromWorker(worker);

			// The remote connection is not established so we can't successfully
			// get a response from the worker
			expect(responseText).toBe(null);

			// And in the console an appropriate error was logged
			expect(consoleErrorMock).toHaveBeenCalledWith(
				expect.stringMatching(
					/A request to the Cloudflare API \([^)]*\) failed\./
				)
			);
		}
	});

	describe("without remote bindings (no auth is needed)", () => {
		test("starting a worker via startWorker without any remote bindings (doesn't cause wrangler to try to get the auth information)", async (t) => {
			t.onTestFinished(async () => await worker?.dispose());

			const helper = new WranglerE2ETestHelper();
			const wrangler = await helper.importWrangler();
			const startWorker = wrangler.unstable_startWorker;

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

			const worker = await startWorker({
				entrypoint: path.resolve(helper.tmpPath, "src/index.js"),
				dev: {
					experimentalRemoteBindings: true,
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
		await vi.waitFor(
			async () => {
				responseText = await (
					await worker.fetch("http://example.com", {
						signal: AbortSignal.timeout(1000),
					})
				).text();
			},
			{ timeout: 20_000, interval: 700 }
		);
	} catch {
		return null;
	}

	return responseText;
}
