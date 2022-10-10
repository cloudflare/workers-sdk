import fs from "node:fs";
import path from "node:path";
import fetchMock from "jest-fetch-mock";
import { getGlobalWranglerConfigPath } from "../global-wrangler-config-path";
import { CI } from "../is-ci";
import {
	loginOrRefreshIfRequired,
	readAuthConfigFile,
	requireAuth,
	USER_AUTH_CONFIG_FILE,
	writeAuthConfigFile,
} from "../user";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { mockOAuthFlow } from "./helpers/mock-oauth-flow";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { Config } from "../config";
import type { UserAuthConfig } from "../user";

describe("User", () => {
	let isCISpy: jest.SpyInstance;
	runInTempDir();
	const std = mockConsoleMethods();
	const {
		mockOAuthServerCallback,
		mockGrantAccessToken,
		mockGrantAuthorization,
		mockRevokeAuthorization,
		mockExchangeRefreshTokenForAccessToken,
	} = mockOAuthFlow();

	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		isCISpy = jest.spyOn(CI, "isCI").mockReturnValue(false);
	});

	describe("login", () => {
		it("should login a user when `wrangler login` is run", async () => {
			mockOAuthServerCallback();
			const accessTokenRequest = mockGrantAccessToken({ respondWith: "ok" });
			mockGrantAuthorization({ respondWith: "success" });

			await runWrangler("login");

			expect(accessTokenRequest.actual.url).toEqual(
				accessTokenRequest.expected.url
			);
			expect(accessTokenRequest.actual.method).toEqual(
				accessTokenRequest.expected.method
			);

			expect(std.out).toMatchInlineSnapshot(`
			"Attempting to login via OAuth...
			Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
			Successfully logged in."
		`);

			expect(readAuthConfigFile()).toEqual<UserAuthConfig>({
				api_token: undefined,
				oauth_token: "test-access-token",
				refresh_token: "test-refresh-token",
				expiration_time: expect.any(String),
				scopes: ["account:read"],
			});
		});
	});

	describe("logout", () => {
		it("should exit with a message stating the user is not logged in", async () => {
			await runWrangler("logout");
			expect(std.out).toMatchInlineSnapshot(`"Not logged in, exiting..."`);
		});

		it("should logout user that has been properly logged in", async () => {
			writeAuthConfigFile({
				oauth_token: "some-oauth-tok",
				refresh_token: "some-refresh-tok",
			});
			const outcome = mockRevokeAuthorization();

			await runWrangler("logout");

			expect(outcome.actual.url).toEqual(
				"https://dash.cloudflare.com/oauth2/revoke"
			);
			expect(outcome.actual.method).toEqual("POST");

			expect(std.out).toMatchInlineSnapshot(`"Successfully logged out."`);

			// Make sure that we made the request to logout.
			expect(fetchMock).toHaveBeenCalledTimes(1);

			// Make sure that logout removed the config file containing the auth tokens.
			const config = path.join(
				getGlobalWranglerConfigPath(),
				USER_AUTH_CONFIG_FILE
			);
			expect(fs.existsSync(config)).toBeFalsy();
		});
	});

	// TODO: Improve OAuth mocking to handle `/token` endpoints from different calls
	it("should handle errors for failed token refresh", async () => {
		setIsTTY(false);
		writeAuthConfigFile({
			oauth_token: "hunter2",
			refresh_token: "Order 66",
		});
		mockExchangeRefreshTokenForAccessToken({
			respondWith: "badResponse",
		});

		// Handles the requireAuth error throw from failed login that is unhandled due to directly calling it here
		await expect(
			requireAuth({} as Config)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`"In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN environment variable for wrangler to work. Please go to https://developers.cloudflare.com/api/tokens/create/ for instructions on how to create an api token, and assign its value to CLOUDFLARE_API_TOKEN."`
		);
	});

	it("should confirm no error message when refresh is successful", async () => {
		setIsTTY(false);
		mockOAuthServerCallback();
		writeAuthConfigFile({
			oauth_token: "hunter2",
			refresh_token: "Order 66",
		});
		mockGrantAuthorization({ respondWith: "success" });

		mockExchangeRefreshTokenForAccessToken({
			respondWith: "refreshSuccess",
		});

		// Handles the requireAuth error throw from failed login that is unhandled due to directly calling it here
		await expect(requireAuth({} as Config)).rejects.toThrowError();
		expect(std.err).toContain("");
	});

	it("should revert to non-interactive mode if in CI", async () => {
		isCISpy.mockReturnValue(true);
		await expect(loginOrRefreshIfRequired()).resolves.toEqual(false);
	});

	it("should revert to non-interactive mode if isTTY throws an error", async () => {
		setIsTTY({
			stdin() {
				throw new Error("stdin is not tty");
			},
			stdout: true,
		});
		await expect(loginOrRefreshIfRequired()).resolves.toEqual(false);
	});
});
