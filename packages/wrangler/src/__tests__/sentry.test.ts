import { rest } from "msw";

import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs, mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

declare const global: { SENTRY_DSN: string | undefined };

describe("sentry", () => {
	const ORIGINAL_SENTRY_DSN = global.SENTRY_DSN;
	const std = mockConsoleMethods();
	runInTempDir();
	mockAccountId();
	mockApiToken();
	const { setIsTTY } = useMockIsTTY();

	let sentryRequests: { count: number } | undefined;

	beforeEach(() => {
		global.SENTRY_DSN =
			"https://9edbb8417b284aa2bbead9b4c318918b@sentry.example.com/24601";

		sentryRequests = mockSentryEndpoint();
	});
	afterEach(() => {
		global.SENTRY_DSN = ORIGINAL_SENTRY_DSN;
		clearDialogs();
		msw.resetHandlers();
	});
	describe("non interactive", () => {
		it("should not hit sentry in normal usage", async () => {
			await runWrangler("version");
			expect(sentryRequests?.count).toEqual(0);
		});

		it("should not hit sentry after error", async () => {
			await expect(runWrangler("delete")).rejects.toMatchInlineSnapshot(
				`[AssertionError: A worker name must be defined, either via --name, or in wrangler.toml]`
			);
			expect(std.out).toMatchInlineSnapshot(`
		"
		[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m
		? Would you like to report this error to Cloudflare?
		🤖 Using fallback value in non-interactive context: no"
	`);
			expect(sentryRequests?.count).toEqual(0);
		});
	});
	describe("interactive", () => {
		beforeEach(() => {
			setIsTTY(true);
		});
		afterEach(() => {
			setIsTTY(false);
		});
		it("should not hit sentry in normal usage", async () => {
			await runWrangler("version");
			expect(sentryRequests?.count).toEqual(0);
		});
		it("should not hit sentry after error when permission denied", async () => {
			mockConfirm({
				text: "Would you like to report this error to Cloudflare?",
				result: false,
			});
			await expect(runWrangler("delete")).rejects.toMatchInlineSnapshot(
				`[AssertionError: A worker name must be defined, either via --name, or in wrangler.toml]`
			);
			expect(std.out).toMatchInlineSnapshot(`
			"
			[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
		`);
			expect(sentryRequests?.count).toEqual(0);
		});
		it("should hit sentry after error when permission provided", async () => {
			mockConfirm({
				text: "Would you like to report this error to Cloudflare?",
				result: true,
			});
			await expect(runWrangler("delete")).rejects.toMatchInlineSnapshot(
				`[AssertionError: A worker name must be defined, either via --name, or in wrangler.toml]`
			);
			expect(std.out).toMatchInlineSnapshot(`
			"
			[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
		`);
			// Sentry sends multiple HTTP requests to capture breadcrumbs
			expect(sentryRequests?.count).toBeGreaterThan(0);
		});
	});
});

function mockSentryEndpoint() {
	const requests = { count: 0 };
	msw.use(
		rest.post(
			`https://platform.dash.cloudflare.com/sentry/envelope`,
			async (req, res, cxt) => {
				requests.count++;
				return res(cxt.status(200), cxt.json({}));
			}
		)
	);

	return requests;
}
