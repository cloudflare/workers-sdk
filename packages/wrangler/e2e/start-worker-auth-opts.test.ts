import path from "node:path";
import dedent from "ts-dedent";
import {
	afterEach,
	assert,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import {
	importWrangler,
	WranglerE2ETestHelper,
} from "./helpers/e2e-wrangler-test";
import type { Worker } from "../src/api/startDevWorker";
import type { MockInstance } from "vitest";

const { unstable_startWorker: startWorker } = await importWrangler();

describe("startWorker - auth options", { sequential: true }, () => {
	let worker: Worker | undefined;
	describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)("with remote bindings", () => {
		let helper: WranglerE2ETestHelper;

		let consoleErrorMock: MockInstance<typeof console.error>;

		beforeEach(async () => {
			consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => {
				// suppress error output during tests - we are going to check for specific error messages in the tests themselves
			});

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

		test("starting a worker with startWorker with the valid auth information and updating it with invalid information", async () => {
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

			await assertValidWorkerAiResponse();

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
					auth: incorrectAuth,
				},
			});

			await assertInvalidWorkerAiResponse();

			expect(incorrectAuth).toHaveBeenCalledOnce();
		});

		test("starting a worker with startWorker with invalid auth information and updating it with valid auth information", async () => {
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

			await assertInvalidWorkerAiResponse();

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
					auth: validAuth,
				},
			});

			await assertValidWorkerAiResponse();

			expect(validAuth).toHaveBeenCalledOnce();
		});

		async function assertValidWorkerAiResponse() {
			assert(worker, "Worker is not defined");
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

		async function assertInvalidWorkerAiResponse() {
			assert(worker, "Worker is not defined");
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
		test("starting a worker via startWorker without any remote bindings (doesn't cause wrangler to try to get the auth information)", async () => {
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
