import assert from "node:assert";
import test, { describe } from "node:test";
import { Miniflare } from "miniflare";
import { experimental_startMixedModeSession } from "wrangler";

describe("startMixedModeSession", () => {
	test("simple AI request to the proxyServerWorker", async () => {
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
	test("AI mixed mode binding", async () => {
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
});
