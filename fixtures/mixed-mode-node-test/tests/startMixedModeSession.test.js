import assert from "node:assert";
import test, { describe } from "node:test";
import { experimental_startMixedModeSession } from "wrangler";

describe("startMixedModeSession", () => {
	test("no-op mixed-mode proxyServerWorker", async (t) => {
		if (
			!process.env.CLOUDFLARE_ACCOUNT_ID ||
			!process.env.CLOUDFLARE_API_TOKEN
		) {
			return t.skip();
		}

		const mixedModeSession = await experimental_startMixedModeSession({});
		const proxyServerUrl =
			mixedModeSession.mixedModeConnectionString.toString();
		assert.match(proxyServerUrl, /http:\/\/localhost:\d{4,5}\//);
		assert.strictEqual(
			await (await fetch(proxyServerUrl)).text(),
			"no-op mixed-mode proxyServerWorker"
		);
		await mixedModeSession.ready;
		await mixedModeSession.dispose();
	});
});
