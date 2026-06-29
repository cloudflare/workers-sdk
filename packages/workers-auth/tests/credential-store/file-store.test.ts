import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import {
	FileCredentialStore,
	getAuthConfigFilePath,
} from "../../src/credential-store/file-store";
import type { UserAuthConfig } from "../../src/config-file/auth";

const SAMPLE_CONFIG: UserAuthConfig = {
	oauth_token: "test-oauth-token",
	refresh_token: "test-refresh-token",
	expiration_time: "2099-01-01T00:00:00.000Z",
	scopes: ["account:read"],
};

describe("FileCredentialStore", () => {
	runInTempDir();

	it("round-trips a UserAuthConfig through the plaintext TOML file", ({
		expect,
	}) => {
		const store = new FileCredentialStore();
		store.write(SAMPLE_CONFIG);
		expect(store.read()).toEqual(SAMPLE_CONFIG);
	});

	it("write persists to the path returned by getAuthConfigFilePath()", ({
		expect,
	}) => {
		new FileCredentialStore().write(SAMPLE_CONFIG);
		expect(existsSync(getAuthConfigFilePath())).toBe(true);
		const raw = readFileSync(getAuthConfigFilePath(), "utf8");
		expect(raw).toContain('oauth_token = "test-oauth-token"');
	});

	it("read returns undefined when no file exists", ({ expect }) => {
		// Per the `ConfigStorage<T>.read()` contract, "nothing stored
		// yet" is the empty state and surfaces as `undefined` — not a
		// thrown exception.
		expect(new FileCredentialStore().read()).toBeUndefined();
	});

	it("read throws when the file is corrupted", ({ expect }) => {
		const store = new FileCredentialStore();
		store.write(SAMPLE_CONFIG);
		// A file that exists but is unparseable is a genuine error
		// (the user benefits from seeing the corruption rather than
		// silently being treated as "not logged in"), so `read()`
		// throws — distinct from the missing-file path above.
		writeFileSync(getAuthConfigFilePath(), "this is not toml = = =");
		expect(() => store.read()).toThrow();
	});

	it("clear is a no-op when no file exists", ({ expect }) => {
		const store = new FileCredentialStore();
		expect(store.clear()).toBe(false);
	});

	it("clear removes the TOML file and returns whether it existed", ({
		expect,
	}) => {
		const store = new FileCredentialStore();
		store.write(SAMPLE_CONFIG);
		expect(existsSync(getAuthConfigFilePath())).toBe(true);
		expect(store.clear()).toBe(true);
		expect(existsSync(getAuthConfigFilePath())).toBe(false);
	});

	it("path() returns the TOML file path", ({ expect }) => {
		expect(new FileCredentialStore().path()).toBe(getAuthConfigFilePath());
	});

	it("describe() returns the TOML file path", ({ expect }) => {
		expect(new FileCredentialStore().describe()).toBe(getAuthConfigFilePath());
	});

	it("kind is 'file'", ({ expect }) => {
		expect(new FileCredentialStore().kind).toBe("file");
	});

	it("WRANGLER_API_ENVIRONMENT changes the filename", ({ expect }) => {
		vi.stubEnv("WRANGLER_API_ENVIRONMENT", "staging");
		expect(getAuthConfigFilePath()).toMatch(/staging\.toml$/);
	});
});
