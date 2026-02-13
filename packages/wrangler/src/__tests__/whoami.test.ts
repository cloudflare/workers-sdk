import { COMPLIANCE_REGION_CONFIG_UNKNOWN } from "@cloudflare/workers-utils";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, it, vi } from "vitest";
import { writeAuthConfigFile } from "../user";
import { getUserInfo } from "../user/whoami";
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

describe("getUserInfo(COMPLIANCE_REGION_CONFIG_UNKNOWN)", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		msw.use(...mswSuccessOauthHandlers, ...mswSuccessUserHandlers);
		setIsTTY(true);
	});

	it("should return undefined if there is no config file", async ({
		expect,
	}) => {
		const userInfo = await getUserInfo(COMPLIANCE_REGION_CONFIG_UNKNOWN);
		expect(userInfo).toBeUndefined();
	});

	it("should return undefined if there is an empty config file", async ({
		expect,
	}) => {
		writeAuthConfigFile({});
		const userInfo = await getUserInfo(COMPLIANCE_REGION_CONFIG_UNKNOWN);
		expect(userInfo).toBeUndefined();
	});

	it("should return undefined for email if the user settings API request fails with 9109", async ({
		expect,
	}) => {
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
				"*/user/tokens/verify",
				() => {
					return HttpResponse.json(createFetchResult([]));
				},
				{ once: true }
			),
			http.get(
				"*/accounts",
				({ request }) => {
					const headersObject = Object.fromEntries(request.headers.entries());
					delete headersObject["user-agent"];

					expect(headersObject).toMatchInlineSnapshot(`
						{
						  "authorization": "Bearer 123456789",
						}
					`);
					return HttpResponse.json(createFetchResult([]));
				},
				{ once: true }
			)
		);
		const userInfo = await getUserInfo(COMPLIANCE_REGION_CONFIG_UNKNOWN);
		expect(userInfo?.email).toBeUndefined();
	});
	it("should say it's using a user API token when one is set", async ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "123456789");

		msw.use(
			http.get(
				"*/user/tokens/verify",
				() => {
					return HttpResponse.json(createFetchResult([]));
				},
				{ once: true }
			)
		);

		const userInfo = await getUserInfo(COMPLIANCE_REGION_CONFIG_UNKNOWN);
		expect(userInfo).toEqual({
			authType: "User API Token",
			apiToken: "123456789",
			email: "user@example.com",
			accounts: [
				{ name: "Account One", id: "account-1" },
				{ name: "Account Two", id: "account-2" },
				{ name: "Account Three", id: "account-3" },
			],
		});
	});

	it("should say it's using an account API token when one is set", async ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "123456789");

		msw.use(
			http.get(
				"*/user/tokens/verify",
				() => {
					return HttpResponse.json(
						createFetchResult({}, false, [
							{
								code: 1000,
								message: "Invalid API Token",
							},
						])
					);
				},
				{ once: true }
			)
		);

		const userInfo = await getUserInfo(COMPLIANCE_REGION_CONFIG_UNKNOWN);
		expect(userInfo).toEqual({
			authType: "Account API Token",
			apiToken: "123456789",
			email: "user@example.com",
			accounts: [
				{ name: "Account One", id: "account-1" },
				{ name: "Account Two", id: "account-2" },
				{ name: "Account Three", id: "account-3" },
			],
		});
	});

	it("should say it's using a Global API Key when one is set", async ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_API_KEY", "123456789");
		vi.stubEnv("CLOUDFLARE_EMAIL", "user@example.com");

		const userInfo = await getUserInfo(COMPLIANCE_REGION_CONFIG_UNKNOWN);
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

	it("should use a Global API Key in preference to an API token", async ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_API_KEY", "123456789");
		vi.stubEnv("CLOUDFLARE_EMAIL", "user@example.com");
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "123456789");

		const userInfo = await getUserInfo(COMPLIANCE_REGION_CONFIG_UNKNOWN);
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

	it("should return undefined only a Global API Key, but not Email, is set", async ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_API_KEY", "123456789");
		const userInfo = await getUserInfo(COMPLIANCE_REGION_CONFIG_UNKNOWN);
		expect(userInfo).toEqual(undefined);
	});

	it("should return the user's email and accounts if authenticated via config token", async ({
		expect,
	}) => {
		writeAuthConfigFile({ oauth_token: "some-oauth-token" });
		const userInfo = await getUserInfo(COMPLIANCE_REGION_CONFIG_UNKNOWN);

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

	it("should display a warning message if the config file contains a legacy api_token field", async ({
		expect,
	}) => {
		writeAuthConfigFile({ api_token: "API_TOKEN" });
		await getUserInfo(COMPLIANCE_REGION_CONFIG_UNKNOWN);

		// The current working directory is replaced with `<cwd>` to make the snapshot consistent across environments
		// But since the actual working directory could be a long string on some operating systems it is possible that the string gets wrapped to a new line.
		// To avoid failures across different environments, we remove any newline before `<cwd>` in the snapshot.
		expect(std.warn.replaceAll(/from[ \r\n]+<cwd>/g, "from <cwd>"))
			.toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mIt looks like you have used Wrangler v1's \`config\` command to login with an API token[0m

			  from <cwd>/home/.config/.wrangler/config/default.toml.
			  This is no longer supported in the current version of Wrangler.
			  If you wish to authenticate via an API token then please set the \`CLOUDFLARE_API_TOKEN\`
			  environment variable.

			"
		`);
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

	it("should display a warning when account_id in config does not match authenticated accounts", async ({
		expect,
	}) => {
		writeAuthConfigFile({ oauth_token: "some-oauth-token" });
		const { whoami } = await import("../user/whoami");
		await whoami(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			"unknownaccountid",
			"unknownaccountid"
		);
		expect(std.out).toContain(
			"The `account_id` in your Wrangler configuration (unknownaccountid) does not match any of your authenticated accounts."
		);
		expect(std.out).toContain("This may be causing the authentication error.");
	});

	it("should not display a warning when account_id matches an authenticated account", async ({
		expect,
	}) => {
		writeAuthConfigFile({ oauth_token: "some-oauth-token" });
		const { whoami } = await import("../user/whoami");
		await whoami(COMPLIANCE_REGION_CONFIG_UNKNOWN, "account-1", "account-1");
		expect(std.out).not.toContain(
			"does not match any of your authenticated accounts"
		);
	});

	it("should not display a warning when accountFilter and configAccountId don't match", async ({
		expect,
	}) => {
		writeAuthConfigFile({ oauth_token: "some-oauth-token" });
		const { whoami } = await import("../user/whoami");
		await whoami(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			"differentaccountid",
			"unknownaccountid"
		);
		expect(std.out).not.toContain(
			"does not match any of your authenticated accounts"
		);
	});

	it("should display membership roles if --account flag is given", async ({
		expect,
	}) => {
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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Getting User settings...
			👋 You are logged in with an OAuth Token, associated with the email user@example.com.
			┌─┬─┐
			│ Account Name │ Account ID │
			├─┼─┤
			│ Account One │ account-1 │
			├─┼─┤
			│ Account Two │ account-2 │
			├─┼─┤
			│ Account Three │ account-3 │
			└─┴─┘
			🔓 Token Permissions:
			Scope (Access)

			[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mWrangler is missing some expected Oauth scopes. To fix this, run \`wrangler login\` to refresh your token. The missing scopes are:[0m

			  - account:read
			  - user:read
			  - workers:write
			  - workers_kv:write
			  - workers_routes:write
			  - workers_scripts:write
			  - workers_tail:read
			  - d1:write
			  - pages:write
			  - zone:read
			  - ssl_certs:write
			  - ai:write
			  - ai-search:write
			  - ai-search:run
			  - queues:write
			  - pipelines:write
			  - secrets_store:write
			  - containers:write
			  - cloudchamber:write
			  - connectivity:admin


			🎢 Membership roles in "Account Two": Contact account super admin to change your permissions.
			- Test role"
		`);
	});

	it("should redact email and account names in non-interactive mode", async ({
		expect,
	}) => {
		setIsTTY(false);
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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Getting User settings...
			👋 You are logged in with an OAuth Token, associated with the email (redacted).
			┌─┬─┐
			│ Account Name │ Account ID │
			├─┼─┤
			│ (redacted) │ account-1 │
			├─┼─┤
			│ (redacted) │ account-2 │
			├─┼─┤
			│ (redacted) │ account-3 │
			└─┴─┘
			🔓 Token Permissions:
			Scope (Access)

			[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mWrangler is missing some expected Oauth scopes. To fix this, run \`wrangler login\` to refresh your token. The missing scopes are:[0m

			  - account:read
			  - user:read
			  - workers:write
			  - workers_kv:write
			  - workers_routes:write
			  - workers_scripts:write
			  - workers_tail:read
			  - d1:write
			  - pages:write
			  - zone:read
			  - ssl_certs:write
			  - ai:write
			  - ai-search:write
			  - ai-search:run
			  - queues:write
			  - pipelines:write
			  - secrets_store:write
			  - containers:write
			  - cloudchamber:write
			  - connectivity:admin


			🎢 Membership roles in "(redacted)": Contact account super admin to change your permissions.
			- Test role"
		`);
	});

	it("should output JSON with user info when --json flag is used and authenticated", async ({
		expect,
	}) => {
		writeAuthConfigFile({ oauth_token: "some-oauth-token" });
		await runWrangler("whoami --json");
		let output;
		expect(() => (output = JSON.parse(std.out))).not.toThrow();
		expect(output).toEqual({
			loggedIn: true,
			authType: "OAuth Token",
			email: "user@example.com",
			accounts: [
				{ name: "Account One", id: "account-1" },
				{ name: "Account Two", id: "account-2" },
				{ name: "Account Three", id: "account-3" },
			],
		});
	});

	it("should output JSON with loggedIn:false and exit with non-zero when --json flag is used and not authenticated", async ({
		expect,
	}) => {
		await expect(runWrangler("whoami --json")).rejects.toThrow();
		const output = JSON.parse(std.out);
		expect(output).toEqual({ loggedIn: false });
	});

	it("should output JSON with API token auth type", async ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "123456789");
		msw.use(
			http.get(
				"*/user/tokens/verify",
				() => {
					return HttpResponse.json(createFetchResult([]));
				},
				{ once: true }
			)
		);
		await runWrangler("whoami --json");
		const output = JSON.parse(std.out);
		expect(output.loggedIn).toBe(true);
		expect(output.authType).toBe("User API Token");
		expect(output.email).toBe("user@example.com");
	});

	it("should display membership error on authentication error 10000", async ({
		expect,
	}) => {
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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Getting User settings...
			👋 You are logged in with an OAuth Token, associated with the email user@example.com.
			┌─┬─┐
			│ Account Name │ Account ID │
			├─┼─┤
			│ Account One │ account-1 │
			├─┼─┤
			│ Account Two │ account-2 │
			├─┼─┤
			│ Account Three │ account-3 │
			└─┴─┘
			🔓 Token Permissions:
			Scope (Access)

			[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mWrangler is missing some expected Oauth scopes. To fix this, run \`wrangler login\` to refresh your token. The missing scopes are:[0m

			  - account:read
			  - user:read
			  - workers:write
			  - workers_kv:write
			  - workers_routes:write
			  - workers_scripts:write
			  - workers_tail:read
			  - d1:write
			  - pages:write
			  - zone:read
			  - ssl_certs:write
			  - ai:write
			  - ai-search:write
			  - ai-search:run
			  - queues:write
			  - pipelines:write
			  - secrets_store:write
			  - containers:write
			  - cloudchamber:write
			  - connectivity:admin


			🎢 Unable to get membership roles. Make sure you have permissions to read the account. Are you missing the \`User->Memberships->Read\` permission?"
		`);
	});
});
