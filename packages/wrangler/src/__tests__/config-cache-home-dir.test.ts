import * as fs from "node:fs";
import * as path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, it, vi } from "vitest";
import { writeAuthCredentials } from "../user";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw, mswSuccessOauthHandlers } from "./helpers/msw";
import { getMswSuccessMembershipHandlers } from "./helpers/msw/handlers/user";
import { runWrangler } from "./helpers/run-wrangler";

// Regression tests for https://github.com/cloudflare/workers-sdk/issues/17127
//
// A command that needs an account ID is run with the home directory as the
// working directory, and with no `node_modules` in it or any parent directory.
// Wrangler must keep using the OAuth token that `wrangler login` saved at the
// XDG config path, both in that command and in every later one.
describe("running a command that needs an account ID from the home directory", () => {
	// Make the working directory the home directory itself.
	runInTempDir({ homedir: "." });
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();
	let r2Requests: { accountId: string; authorization: string | null }[];

	beforeEach(({ expect }) => {
		setIsTTY(false);
		vi.stubEnv("CLOUDFLARE_AUTH_USE_KEYRING", "false");
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
		vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
		vi.stubEnv("WRANGLER_CACHE_DIR", "");
		r2Requests = [];

		// A user who logged in with `wrangler login` while no `~/.wrangler`
		// existed, so the OAuth token is stored at the XDG config path.
		writeAuthCredentials({
			oauth_token: "some-oauth-token",
			refresh_token: "some-refresh-token",
			expiration_time: "2099-01-01T00:00:00.000Z",
			scopes: ["account:read", "user:read"],
		});
		expect(
			fs.existsSync(
				path.join(
					process.env.XDG_CONFIG_HOME as string,
					".wrangler",
					"config",
					"default.toml"
				)
			)
		).toBe(true);
		expect(fs.existsSync(path.join(process.cwd(), ".wrangler"))).toBe(false);

		msw.use(
			...mswSuccessOauthHandlers,
			// A user with access to exactly one account, so it is selected (and
			// remembered) without a prompt.
			...getMswSuccessMembershipHandlers([
				{ name: "Account One", id: "account-1" },
			]),
			http.get("*/user", () =>
				HttpResponse.json(
					createFetchResult({ id: "user-id", email: "user@example.com" })
				)
			),
			http.get("*/accounts/:accountId/r2/buckets", ({ request, params }) => {
				r2Requests.push({
					accountId: String(params.accountId),
					authorization: request.headers.get("authorization"),
				});
				return HttpResponse.json(
					createFetchResult({
						buckets: [{ name: "my-bucket", creation_date: "01-01-2001" }],
					})
				);
			})
		);
	});

	it("lists the buckets with the logged-in user's OAuth token", async ({
		expect,
	}) => {
		await runWrangler("r2 bucket list");

		expect(r2Requests).toEqual([
			{ accountId: "account-1", authorization: "Bearer some-oauth-token" },
		]);
		expect(std.out).toContain("name:           my-bucket");
	});

	it("keeps the user logged in for later commands, in any directory", async ({
		expect,
	}) => {
		// Whether this first command itself succeeds is covered by the test
		// above; here only the state it leaves behind matters.
		await runWrangler("r2 bucket list").catch(() => {});
		std.getAndClearOut();

		fs.mkdirSync("project");
		process.chdir("project");
		await runWrangler("whoami");

		expect(std.out).not.toContain("You are not authenticated");
		expect(std.out).toContain(
			"You are logged in with an OAuth Token, associated with the email user@example.com."
		);
	});
});
