import { rest } from "msw";
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

describe("getUserInfo()", () => {
	const ENV_COPY = process.env;

	runInTempDir();
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		msw.use(...mswSuccessOauthHandlers, ...mswSuccessUserHandlers);
		setIsTTY(true);
	});

	afterEach(() => {
		process.env = ENV_COPY;
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
		process.env = {
			CLOUDFLARE_API_TOKEN: "123456789",
		};
		msw.use(
			rest.get("*/user", (_, res, ctx) => {
				return res.once(
					ctx.json(
						createFetchResult({}, false, [
							{
								code: 9109,
								message: "Uauthorized to access requested resource",
							},
						])
					)
				);
			}),
			rest.get("*/accounts", (request, res, ctx) => {
				const headersObject = request.headers.all();
				delete headersObject["user-agent"];

				expect(headersObject).toMatchInlineSnapshot(`
			Object {
			  "accept": "*/*",
			  "accept-encoding": "gzip,deflate",
			  "authorization": "Bearer 123456789",
			  "connection": "close",
			  "host": "api.cloudflare.com",
			}
		`);
				return res.once(ctx.json(createFetchResult([])));
			})
		);
		const userInfo = await getUserInfo();
		expect(userInfo?.email).toBeUndefined();
	});
	it("should say it's using an API token when one is set", async () => {
		process.env = {
			CLOUDFLARE_API_TOKEN: "123456789",
		};

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
		process.env = {
			CLOUDFLARE_API_KEY: "123456789",
			CLOUDFLARE_EMAIL: "user@example.com",
		};

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
		process.env = {
			CLOUDFLARE_API_KEY: "123456789",
			CLOUDFLARE_EMAIL: "user@example.com",
			CLOUDFLARE_API_TOKEN: "123456789",
		};

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
		process.env = {
			CLOUDFLARE_API_KEY: "123456789",
		};
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

		expect(std.warn).toMatchInlineSnapshot(`
		      "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mIt looks like you have used Wrangler v1's \`config\` command to login with an API token.[0m

		        This is no longer supported in the current version of Wrangler.
		        If you wish to authenticate via an API token then please set the \`CLOUDFLARE_API_TOKEN\`
		        environment variable.

		      "
	    `);
	});
});
