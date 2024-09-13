import fs from "node:fs";
import { http, HttpResponse } from "msw";
import { getAuthConfigFilePath, writeAuthConfigFile } from "../user";
import { mockConsoleMethods } from "./helpers/mock-console";
import { msw } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("logout", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	it("should exit with a message stating the user is not logged in", async () => {
		await runWrangler("logout", { CLOUDFLARE_API_TOKEN: undefined });
		expect(std.out).toMatchInlineSnapshot(`"Not logged in, exiting..."`);
	});

	it("should exit with a message stating the user logged in via API token", async () => {
		await runWrangler("logout", { CLOUDFLARE_API_TOKEN: "DUMMY_TOKEN" });
		expect(std.out).toMatchInlineSnapshot(
			`"You are logged in with an API Token. Unset the CLOUDFLARE_API_TOKEN in the environment to log out."`
		);
	});

	it("should logout user that has been properly logged in", async () => {
		writeAuthConfigFile({
			oauth_token: "some-oauth-tok",
			refresh_token: "some-refresh-tok",
		});
		// Make sure that logout removed the config file containing the auth tokens.
		const config = getAuthConfigFilePath();
		let counter = 0;
		msw.use(
			http.post(
				"*/oauth2/revoke",
				() => {
					// Make sure that we made the request to logout.
					counter += 1;
					return HttpResponse.text("", { status: 200 });
				},
				{ once: true }
			)
		);

		expect(fs.existsSync(config)).toBeTruthy();

		await runWrangler("logout", { CLOUDFLARE_API_TOKEN: undefined });

		expect(std.out).toMatchInlineSnapshot(`"Not logged in, exiting..."`);
		expect(fs.existsSync(config)).toBeFalsy();
		expect(counter).toBe(1);
	});
});
