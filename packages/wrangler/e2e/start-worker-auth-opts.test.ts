import path from "node:path";
import dedent from "ts-dedent";
import { afterEach, assert, beforeEach, describe, test, vi } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import {
	importWrangler,
	WranglerE2ETestHelper,
} from "./helpers/e2e-wrangler-test";
import { waitForLong } from "./helpers/wait-for";
import type { Worker } from "../src/api/startDevWorker";
import type { ExpectStatic, MockInstance } from "vitest";

const { unstable_startWorker: startWorker } = await importWrangler();

describe("startWorker - auth options", { sequential: true }, () => {
	let worker: Worker | undefined;
	describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)("with remote bindings", () => {
		let helper: WranglerE2ETestHelper;

		let consoleErrorMock: MockInstance<typeof console.error>;

		beforeEach(async () => {
			consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => {
				// suppress error output during tests
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

			let emittedErrors: unknown[] = [];

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

			worker.raw.on("error", (e: unknown) => emittedErrors.push(e));

			await assertValidWorkerAiResponse(expect, emittedErrors);

			expect(validAuth).toHaveBeenCalled();

			emittedErrors = [];

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

			await assertAuthErrorForWorkerAiResponse(expect, emittedErrors);

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

			let emittedErrors: unknown[] = [];

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

			worker.raw.on("error", (e: unknown) => emittedErrors.push(e));

			await assertAuthErrorForWorkerAiResponse(expect, emittedErrors);

			expect(incorrectAuth).toHaveBeenCalled();

			consoleErrorMock.mockReset();
			emittedErrors = [];

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

			await assertValidWorkerAiResponse(expect, emittedErrors);

			expect(validAuth).toHaveBeenCalled();
		});

		async function assertValidWorkerAiResponse(
			expect: ExpectStatic,
			emittedErrors: unknown[]
		) {
			assert(worker, "Worker is not defined");
			const responseText = await fetchTimedTextFromWorker(worker);

			// We've fixed the auth information so now we can indeed get
			// a valid response from the worker
			expect(responseText).toBeTruthy();
			expect(responseText).toContain("This is a response from Workers AI.");

			// And there should be no authentication error emitted
			const authErrors = emittedErrors.filter((e) =>
				hasMatchingCauseMessage(
					e,
					/Failed to establish remote session due to an authentication issue/
				)
			);
			expect(authErrors).toHaveLength(0);
		}

		async function assertAuthErrorForWorkerAiResponse(
			expect: ExpectStatic,
			emittedErrors: unknown[]
		) {
			assert(worker, "Worker is not defined");
			const responseText = await fetchTimedTextFromWorker(worker);

			// The remote connection is not established so we can't successfully
			// get a response from the worker
			expect(responseText).toBe(null);

			// And an authentication error was emitted
			const authErrors = emittedErrors.filter((e) =>
				hasMatchingCauseMessage(
					e,
					/Failed to establish remote session due to an authentication issue/
				)
			);
			expect(authErrors.length).toBeGreaterThan(0);
		}

		/**
		 * Checks whether an emitted error event (or its cause chain) contains
		 * a message matching the given pattern.
		 *
		 * @param event - the error event to inspect
		 * @param pattern - the regex pattern to match against error messages
		 * @returns whether any error in the cause chain matches the pattern
		 */
		function hasMatchingCauseMessage(event: unknown, pattern: RegExp): boolean {
			if (event == null || typeof event !== "object") {
				return false;
			}
			const cause = (event as { cause?: unknown }).cause;
			if (cause instanceof Error && pattern.test(cause.message)) {
				return true;
			}
			// Recurse into nested cause
			if (cause instanceof Error && cause.cause) {
				return hasMatchingCauseMessage({ cause: cause.cause }, pattern);
			}
			return false;
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
