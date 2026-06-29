import fs from "node:fs";
import path from "node:path";
import {
	resetCredentialStorageState,
	setKeyProviderFactoryForTesting,
} from "@cloudflare/workers-auth";
import { getGlobalWranglerConfigPath } from "@cloudflare/workers-utils";
import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, describe, it } from "vitest";
import { getAuthConfigFilePath, writeAuthCredentials } from "../user";
import { mockConsoleMethods } from "./helpers/mock-console";
import { msw } from "./helpers/msw";
import { runWrangler } from "./helpers/run-wrangler";

describe("logout", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	// Tear down the keyring test seam after every test so a failed
	// assertion mid-test does not leak the stubbed `KeyProvider` factory
	// or the session-level resolver warning latches into the next test.
	// No-op when the seam was never installed.
	afterEach(() => {
		setKeyProviderFactoryForTesting(undefined);
		resetCredentialStorageState();
	});

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
		writeAuthCredentials({
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
		writeAuthCredentials({
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
		writeAuthCredentials({
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
		writeAuthCredentials({
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

	it("should clear the keyring entry, the encrypted file, and any legacy TOML when keyring storage is active", async ({
		expect,
	}) => {
		const { getEncryptedAuthConfigFilePath } =
			await import("@cloudflare/workers-auth");
		const { updateUserPreferences } = await import("../user/preferences");

		const keyringStore = new Map<string, Uint8Array>();
		setKeyProviderFactoryForTesting((serviceName) => ({
			getKey: () => keyringStore.get(`${serviceName}::default`),
			setKey: (key) => {
				keyringStore.set(`${serviceName}::default`, key);
			},
			deleteKey: () => {
				keyringStore.delete(`${serviceName}::default`);
			},
			describe: () => "in-memory test keyring",
		}));
		updateUserPreferences({ keyring_enabled: true });

		// Pre-populate the encrypted file + keyring with credentials (as
		// `wrangler login --use-keyring` would).
		writeAuthCredentials({
			oauth_token: "kr-token",
			refresh_token: "kr-refresh",
		});

		// And pre-populate the legacy plaintext file (as a previous wrangler
		// install would have). Write directly to disk so we can prove
		// `logout()` removes it defensively.
		const legacyPath = getAuthConfigFilePath();
		fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
		fs.writeFileSync(legacyPath, 'oauth_token = "stale-leftover"');

		expect(keyringStore.size).toBe(1);
		expect(fs.existsSync(getEncryptedAuthConfigFilePath())).toBe(true);
		expect(fs.existsSync(legacyPath)).toBe(true);

		msw.use(
			http.post(
				"*/oauth2/revoke",
				() => HttpResponse.text("", { status: 200 }),
				{ once: true }
			)
		);

		await runWrangler("logout", { CLOUDFLARE_API_TOKEN: undefined });

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Successfully logged out."
		`);
		expect(keyringStore.size).toBe(0);
		expect(fs.existsSync(getEncryptedAuthConfigFilePath())).toBe(false);
		expect(fs.existsSync(legacyPath)).toBe(false);
	});
});
