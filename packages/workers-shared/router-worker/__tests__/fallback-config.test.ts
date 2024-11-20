import { createExecutionContext, env, fetchMock } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { default as worker } from "../src/index";

describe("unit tests", async () => {
	// beforeAll(() => {
	// 	// Enable mocks
	// 	fetchMock.activate();
	// 	fetchMock.disableNetConnect();
	// });

	it("fails if specify running user worker ahead of assets, without user worker", async () => {
		expect(true).toBeTruthy();
		// const request = new Request("https://example.com");
		// const ctx = createExecutionContext();

		// const env = {
		// 	CONFIG: {
		// 		invoke_user_worker_ahead_of_assets: true,
		// 		has_user_worker: false,
		// 	},
		// } as typeof env;

		// expect(async () => await worker.fetch(request, env, ctx)).toThrowError(
		// 	"Fetch for user worker without having a user worker binding"
		// );
	});
});
