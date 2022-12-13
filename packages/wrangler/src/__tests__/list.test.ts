import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import {
	msw,
	mswSuccessOauthHandlers,
	mswSuccessUserHandlers,
} from "./helpers/msw";
import { mswSuccessServices } from "./helpers/msw/handlers/list";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("list", () => {
	const std = mockConsoleMethods();
	runInTempDir();
	mockAccountId();
	mockApiToken();
	runInTempDir();

	beforeEach(() => {
		msw.use(
			...mswSuccessServices,
			...mswSuccessOauthHandlers,
			...mswSuccessUserHandlers
		);
	});

	it("should list workers", async () => {
		await runWrangler("publish --list");
		expect(std.out).toMatchInlineSnapshot(`
		"
		worker-one
		Deployed from: wrangler
		Created on:    2021-02-02T00:00:00.000000Z

		other-worker
		Deployed from: wrangler
		Created on:    2021-02-02T00:00:00.000000Z
		"
	`);
	});

	it("should search workers", async () => {
		await runWrangler("publish --prefix other");
		expect(std.out).toMatchInlineSnapshot(`
		"
		other-worker
		Deployed from: wrangler
		Created on:    2021-02-02T00:00:00.000000Z
		"
	`);
	});
});
