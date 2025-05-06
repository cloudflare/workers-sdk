import assert from "node:assert";
import test, { describe } from "node:test";
import { experimental_startMixedModeSession } from "wrangler";

describe("startMixedModeSession", () => {
	test("simple AI request to the proxyServerWorker", async (t) => {
		if (
			!process.env.TEST_CLOUDFLARE_ACCOUNT_ID ||
			!process.env.TEST_CLOUDFLARE_API_TOKEN
		) {
			return t.skip();
		}

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
						"MF-Binding-Name": "AI",
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
});
