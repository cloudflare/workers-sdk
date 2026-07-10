import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, describe, it, vi } from "vitest";
import {
	createCfAuth,
	createCfProfileStore,
	getAuthConfigFilePath,
	getCfConfigPath,
	readAuthConfigFile,
	writeAuthConfigFile,
} from "../../src/cf";
import type { AuthContext } from "../../src/cf";
import type { UserAuthConfig } from "../../src/config-file/auth";

const SAMPLE_CONFIG: UserAuthConfig = {
	oauth_token: "cf-oauth-token",
	refresh_token: "cf-refresh-token",
	expiration_time: "2099-01-01T00:00:00.000Z",
	scopes: ["account:read"],
};

function createTestContext(): AuthContext {
	return {
		logger: {
			debug: vi.fn(),
			log: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		},
		userAgent: "cf/0.0.0",
		prompt: vi.fn(async () => ""),
		select: vi.fn(async () => ""),
		isNoDefaultValueProvidedError: () => false,
	};
}

describe("cf auth layer", () => {
	runInTempDir();

	it("resolves its config directory to `cloudflare` (no leading dot, not `.wrangler`)", ({
		expect,
	}) => {
		const configPath = getCfConfigPath();
		// The basename must be exactly `cloudflare` — no leading dot (unlike
		// wrangler's `.wrangler`).
		expect(path.basename(configPath)).toBe("cloudflare");
		expect(configPath).not.toContain(".cloudflare");
		expect(configPath).not.toContain(".wrangler");
	});

	it("stores the auth credential file as JSON with a `.json` extension", ({
		expect,
	}) => {
		const filePath = getAuthConfigFilePath();
		expect(filePath.endsWith(".json")).toBe(true);
		expect(filePath.startsWith(getCfConfigPath())).toBe(true);

		writeAuthConfigFile(SAMPLE_CONFIG);
		expect(existsSync(filePath)).toBe(true);

		const raw = readFileSync(filePath, "utf8");
		// JSON, not TOML: the body must parse as JSON and round-trip.
		expect(JSON.parse(raw)).toEqual(SAMPLE_CONFIG);
		expect(raw).not.toContain('oauth_token = "');
		expect(readAuthConfigFile()).toEqual(SAMPLE_CONFIG);
	});

	it("writeAuthCredentials via createCfAuth persists JSON to the cf path", ({
		expect,
	}) => {
		const auth = createCfAuth(createTestContext());
		auth.writeAuthCredentials(SAMPLE_CONFIG);

		const filePath = getAuthConfigFilePath();
		expect(existsSync(filePath)).toBe(true);
		expect(JSON.parse(readFileSync(filePath, "utf8"))).toEqual(SAMPLE_CONFIG);
		expect(auth.readAuthCredentials()).toEqual(SAMPLE_CONFIG);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("does not treat a global API key + email as env credentials (cf is scoped-token-only)", async ({
		expect,
	}) => {
		// cf sets `allowGlobalAuthKey: false`, so a bare CLOUDFLARE_API_KEY +
		// CLOUDFLARE_EMAIL pair (with no CLOUDFLARE_API_TOKEN) must NOT count as
		// "logged in via env". Otherwise logout/login would wrongly bail with
		// "You are logged in with an API Token" even though cf ignores those creds.
		vi.stubEnv("CLOUDFLARE_API_KEY", "deadbeef");
		vi.stubEnv("CLOUDFLARE_EMAIL", "user@example.com");
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "");

		const ctx = createTestContext();
		const auth = createCfAuth(ctx);

		// No stored token and no honoured env creds → logout falls through to the
		// "not logged in" path rather than the env-credential short-circuit.
		await auth.logout();

		const logged = vi.mocked(ctx.logger.log).mock.calls.flat().join("\n");
		expect(logged).not.toContain("You are logged in with an API Token");
		expect(logged).toContain("Not logged in, exiting...");
	});

	it("lists named profiles by their `.json` files", ({ expect }) => {
		const profileDir = path.dirname(getAuthConfigFilePath("default"));
		mkdirSync(profileDir, { recursive: true });
		writeFileSync(
			path.join(profileDir, "work.json"),
			JSON.stringify(SAMPLE_CONFIG)
		);

		const store = createCfProfileStore({ logger: createTestContext().logger });
		expect(store.configs.list()).toContain("work");
		expect(store.configs.exists("work")).toBe(true);
	});
});
