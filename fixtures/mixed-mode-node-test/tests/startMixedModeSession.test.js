import assert from "node:assert";
import test, { describe } from "node:test";
import { Miniflare } from "miniflare";
import { experimental_startMixedModeSession } from "wrangler";

process.env.CLOUDFLARE_ACCOUNT_ID = process.env.TEST_CLOUDFLARE_ACCOUNT_ID;
process.env.CLOUDFLARE_API_TOKEN = process.env.TEST_CLOUDFLARE_API_TOKEN;

describe("startMixedModeSession", () => {
	test.skip("simple AI request to the proxyServerWorker", async () => {
		const mixedModeSession = await experimental_startMixedModeSession({
			AI: {
				type: "ai",
			},
		});
		const proxyServerUrl =
			mixedModeSession.mixedModeConnectionString.toString();
		assert.match(proxyServerUrl, /http:\/\/localhost:\d{4,5}\//);
		assert.match(
			await (
				await fetch(proxyServerUrl, {
					headers: {
						"MF-Binding": "AI",
						"MF-URL": "https://workers-binding.ai/ai-api/models/search",
					},
				})
			).text(),
			// Assert the catalog _at least_ contains a LLama model
			/Llama/
		);
		await mixedModeSession.ready;
		await mixedModeSession.dispose();
	});
	test.skip("AI mixed mode binding", async () => {
		const mixedModeSession = await experimental_startMixedModeSession({
			AI: {
				type: "ai",
			},
		});

		const mf = new Miniflare({
			compatibilityDate: "2025-01-01",
			modules: true,
			script: /* javascript */ `
				export default {
					async fetch(request, env) {
						const messages = [
							{
								role: "user",
								// Doing snapshot testing against AI responses can be flaky, but this prompt generates the same output relatively reliably
								content: "Respond with the exact text 'This is a response from Workers AI.'. Do not include any other text",
							},
						];

						const content = await env.AI.run("@hf/thebloke/zephyr-7b-beta-awq", {
							messages,
						});

						return new Response(content.response);
					}
				}
			`,
			ai: {
				binding: "AI",
				mixedModeConnectionString: mixedModeSession.mixedModeConnectionString,
			},
		});
		assert.match(
			await (await mf.dispatchFetch("http://example.com")).text(),
			/This is a response from Workers AI/
		);
		await mf.dispose();

		await mixedModeSession.ready;
		await mixedModeSession.dispose();
	});

	test("Browser mixed mode binding", async () => {
		const mixedModeSession = await experimental_startMixedModeSession({
			BROWSER: {
				type: "browser",
			},
		});

		const mf = new Miniflare({
			compatibilityDate: "2025-01-01",
			compatibilityFlags: ["nodejs_compat"],
			modules: true,
			script: /* javascript */ `
			export default {
				async fetch(request, env) {
					// Simulate acquiring a session
					const content = await env.BROWSER.fetch("http://fake.host/v1/acquire");
					return Response.json(await content.json());
				}
			}
		`,
			browserRendering: {
				binding: "BROWSER",
				mixedModeConnectionString: mixedModeSession.mixedModeConnectionString,
			},
		});

		assert.match(
			await (await mf.dispatchFetch("http://example.com")).text(),
			/sessionId/
		);
		await mf.dispose();

		await mixedModeSession.ready;
		await mixedModeSession.dispose();
	});
});
