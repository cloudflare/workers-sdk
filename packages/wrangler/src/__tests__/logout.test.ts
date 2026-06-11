import fs from "node:fs";
import path from "node:path";
import { getGlobalWranglerConfigPath } from "@cloudflare/workers-utils";
import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { describe, it } from "vitest";
import { getAuthConfigFilePath, writeAuthConfigFile } from "../user";
import { mockConsoleMethods } from "./helpers/mock-console";
import { msw } from "./helpers/msw";
import { runWrangler } from "./helpers/run-wrangler";

describe("logout", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	it("should exit with a message stating the user is not logged in", async ({
		expect,
	}) => {
		await runWrangler("logout", { CLOUDFLARE_API_TOKEN: undefined });
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Not logged in, exiting..."
		`);
	});

	it("should clear a cached temporary preview account when not logged in via OAuth", async ({
		expect,
	}) => {
		const temporaryAccountConfigPath = path.join(
			getGlobalWranglerConfigPath(),
			"wrangler-temporary-account.toml"
		);
		fs.mkdirSync(path.dirname(temporaryAccountConfigPath), { recursive: true });
		fs.writeFileSync(
			temporaryAccountConfigPath,
			JSON.stringify({ temporaryPreviewAccount: { account: {}, claim: {} } })
		);

		await runWrangler("logout", { CLOUDFLARE_API_TOKEN: undefined });

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Cleared temporary preview account."
		`);
		expect(fs.existsSync(temporaryAccountConfigPath)).toBeFalsy();
	});

	it("should exit with a message stating the user logged in via API token", async ({
		expect,
	}) => {
		await runWrangler("logout", { CLOUDFLARE_API_TOKEN: "DUMMY_TOKEN" });
		expect(std.out).toMatchInlineSnapshot(
			`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			You are logged in with an API Token. Unset the CLOUDFLARE_API_TOKEN in the environment to log out."
		`
		);
	});

	it("should logout user that has been properly logged in", async ({
		expect,
	}) => {
		const temporaryAccountConfigPath = path.join(
			getGlobalWranglerConfigPath(),
			"wrangler-temporary-account.toml"
		);
		writeAuthConfigFile({
			oauth_token: "some-oauth-tok",
			refresh_token: "some-refresh-tok",
		});
		fs.mkdirSync(path.dirname(temporaryAccountConfigPath), { recursive: true });
		fs.writeFileSync(
			temporaryAccountConfigPath,
			JSON.stringify({ temporaryPreviewAccount: { account: {}, claim: {} } })
		);
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
		expect(fs.existsSync(temporaryAccountConfigPath)).toBeTruthy();

		await runWrangler("logout", { CLOUDFLARE_API_TOKEN: undefined });

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Successfully logged out."
		`);
		expect(fs.existsSync(config)).toBeFalsy();
		expect(fs.existsSync(temporaryAccountConfigPath)).toBeFalsy();
		expect(counter).toBe(1);
	});

	it("should not display warnings from wrangler configuration parsing when logging out", async ({
		expect,
	}) => {
		writeAuthConfigFile({
			oauth_token: "some-oauth-tok",
			refresh_token: "some-refresh-tok",
		});
		const config = getAuthConfigFilePath();

		msw.use(
			http.post(
				"*/oauth2/revoke",
				async () => {
					return HttpResponse.text("");
				},
				{ once: true }
			)
		);

		expect(fs.existsSync(config)).toBeTruthy();

		// @ts-expect-error - intentionally invalid
		writeWranglerConfig({ invalid: true });

		await runWrangler("logout");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Successfully logged out."
		`);
		expect(std.warn).toMatchInlineSnapshot(`""`);
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(fs.existsSync(config)).toBeFalsy();
	});

	it("should still log out when wrangler configuration is unparsable", async ({
		expect,
	}) => {
		writeAuthConfigFile({
			oauth_token: "some-oauth-tok",
			refresh_token: "some-refresh-tok",
		});
		const config = getAuthConfigFilePath();

		msw.use(
			http.post(
				"*/oauth2/revoke",
				async () => {
					return HttpResponse.text("");
				},
				{ once: true }
			)
		);

		expect(fs.existsSync(config)).toBeTruthy();

		fs.writeFileSync("./wrangler.jsonc", "this is not valid JSON");

		await runWrangler("logout");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Successfully logged out."
		`);
		expect(std.warn).toMatchInlineSnapshot(`""`);
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(fs.existsSync(config)).toBeFalsy();
	});

	it("should still log out when wrangler configuration contains an error", async ({
		expect,
	}) => {
		writeAuthConfigFile({
			oauth_token: "some-oauth-tok",
			refresh_token: "some-refresh-tok",
		});
		const config = getAuthConfigFilePath();

		msw.use(
			http.post(
				"*/oauth2/revoke",
				async () => {
					return HttpResponse.text("");
				},
				{ once: true }
			)
		);

		expect(fs.existsSync(config)).toBeTruthy();

		writeWranglerConfig({
			// @ts-expect-error - intentionally invalid
			name: 1000, // should be a string
		});

		await runWrangler("logout");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Successfully logged out."
		`);
		expect(std.warn).toMatchInlineSnapshot(`""`);
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(fs.existsSync(config)).toBeFalsy();
	});
});
