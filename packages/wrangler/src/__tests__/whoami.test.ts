import { http, HttpResponse } from "msw";
import { writeAuthConfigFile } from "../user";
import { getUserInfo } from "../whoami";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import {
	createFetchResult,
	msw,
	mswSuccessOauthHandlers,
	mswSuccessUserHandlers,
} from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("getUserInfo()", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		msw.use(...mswSuccessOauthHandlers, ...mswSuccessUserHandlers);
		setIsTTY(true);
	});

	it("should return undefined if there is no config file", async () => {
		const userInfo = await getUserInfo();
		expect(userInfo).toBeUndefined();
	});

	it("should return undefined if there is an empty config file", async () => {
		writeAuthConfigFile({});
		const userInfo = await getUserInfo();
		expect(userInfo).toBeUndefined();
	});

	it("should return undefined for email if the user settings API request fails with 9109", async () => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "123456789");
		msw.use(
			http.get(
				"*/user",
				() => {
					return HttpResponse.json(
						createFetchResult({}, false, [
							{
								code: 9109,
								message: "Uauthorized to access requested resource",
							},
						])
					);
				},
				{ once: true }
			),
			http.get(
				"*/accounts",
				({ request }) => {
					const headersObject = Object.fromEntries(request.headers.entries());
					delete headersObject["user-agent"];

					expect(headersObject).toMatchInlineSnapshot(`
			Object {
			  "authorization": "Bearer 123456789",
			}
		`);
					return HttpResponse.json(createFetchResult([]));
				},
				{ once: true }
			)
		);
		const userInfo = await getUserInfo();
		expect(userInfo?.email).toBeUndefined();
	});
	it("should say it's using an API token when one is set", async () => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "123456789");

		const userInfo = await getUserInfo();
		expect(userInfo).toEqual({
			authType: "API Token",
			apiToken: "123456789",
			email: "user@example.com",
			accounts: [
				{ name: "Account One", id: "account-1" },
				{ name: "Account Two", id: "account-2" },
				{ name: "Account Three", id: "account-3" },
			],
		});
	});

	it("should say it's using a Global API Key when one is set", async () => {
		vi.stubEnv("CLOUDFLARE_API_KEY", "123456789");
		vi.stubEnv("CLOUDFLARE_EMAIL", "user@example.com");

		const userInfo = await getUserInfo();
		expect(userInfo).toEqual({
			authType: "Global API Key",
			apiToken: "123456789",
			email: "user@example.com",
			accounts: [
				{ name: "Account One", id: "account-1" },
				{ name: "Account Two", id: "account-2" },
				{ name: "Account Three", id: "account-3" },
			],
		});
	});

	it("should use a Global API Key in preference to an API token", async () => {
		vi.stubEnv("CLOUDFLARE_API_KEY", "123456789");
		vi.stubEnv("CLOUDFLARE_EMAIL", "user@example.com");
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "123456789");

		const userInfo = await getUserInfo();
		expect(userInfo).toEqual({
			authType: "Global API Key",
			apiToken: "123456789",
			email: "user@example.com",
			accounts: [
				{ name: "Account One", id: "account-1" },
				{ name: "Account Two", id: "account-2" },
				{ name: "Account Three", id: "account-3" },
			],
		});
	});

	it("should return undefined only a Global API Key, but not Email, is set", async () => {
		vi.stubEnv("CLOUDFLARE_API_KEY", "123456789");
		const userInfo = await getUserInfo();
		expect(userInfo).toEqual(undefined);
	});

	it("should return the user's email and accounts if authenticated via config token", async () => {
		writeAuthConfigFile({ oauth_token: "some-oauth-token" });
		const userInfo = await getUserInfo();

		expect(userInfo).toEqual({
			authType: "OAuth Token",
			apiToken: "some-oauth-token",
			email: "user@example.com",
			accounts: [
				{ name: "Account One", id: "account-1" },
				{ name: "Account Two", id: "account-2" },
				{ name: "Account Three", id: "account-3" },
			],
		});
	});

	it("should display a warning message if the config file contains a legacy api_token field", async () => {
		writeAuthConfigFile({ api_token: "API_TOKEN" });
		await getUserInfo();

		expect(std.warn).toMatchInlineSnapshot(`""`);
	});
});

describe("whoami", () => {
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	beforeEach(() => {
		setIsTTY(true);
		msw.use(...mswSuccessOauthHandlers, ...mswSuccessUserHandlers);
	});

	it("should display membership roles if --account flag is given", async () => {
		writeAuthConfigFile({ oauth_token: "some-oauth-token" });
		msw.use(
			http.get(
				"*/memberships",
				() =>
					HttpResponse.json(
						createFetchResult([
							{ account: { id: "account-2" }, roles: ["Test role"] },
						])
					),
				{ once: true }
			)
		);
		await runWrangler(`whoami --account "account-2"`);
		expect(std.out).toMatchInlineSnapshot(`
			"Getting User settings...
			ℹ️  The API Token is read from the CLOUDFLARE_API_TOKEN in your environment.
			👋 You are logged in with an API Token, associated with the email user@example.com.
			┌───────────────┬────────────┐
			│ Account Name  │ Account ID │
			├───────────────┼────────────┤
			│ Account One   │ account-1  │
			├───────────────┼────────────┤
			│ Account Two   │ account-2  │
			├───────────────┼────────────┤
			│ Account Three │ account-3  │
			└───────────────┴────────────┘
			🔓 To see token permissions visit https://dash.cloudflare.com/profile/api-tokens.
			🎢 Membership roles in \\"Account Two\\": Contact account super admin to change your permissions.
			- Test role"
		`);
	});

	it("should display membership error on authentication error 10000", async () => {
		writeAuthConfigFile({ oauth_token: "some-oauth-token" });
		msw.use(
			http.get(
				"*/memberships",
				() =>
					HttpResponse.json(
						createFetchResult(undefined, false, [
							{ code: 10000, message: "Authentication error" },
						])
					),
				{ once: true }
			)
		);
		await runWrangler(`whoami --account "account-2"`);
		expect(std.out).toMatchInlineSnapshot(`
			"Getting User settings...
			ℹ️  The API Token is read from the CLOUDFLARE_API_TOKEN in your environment.
			👋 You are logged in with an API Token, associated with the email user@example.com.
			┌───────────────┬────────────┐
			│ Account Name  │ Account ID │
			├───────────────┼────────────┤
			│ Account One   │ account-1  │
			├───────────────┼────────────┤
			│ Account Two   │ account-2  │
			├───────────────┼────────────┤
			│ Account Three │ account-3  │
			└───────────────┴────────────┘
			🔓 To see token permissions visit https://dash.cloudflare.com/profile/api-tokens.
			🎢 Unable to get membership roles. Make sure you have permissions to read the account."
		`);
	});
});
