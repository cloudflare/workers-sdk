import { chmodSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import {
	getAuthConfigFilePath,
	readAuthCredentials,
	writeAuthCredentials,
} from "../user";
import { createTomlFileStorage } from "../user/auth-config-file";
import type { UserAuthConfig } from "../user";

const SAMPLE_CONFIG: UserAuthConfig = {
	oauth_token: "test-oauth-token",
	refresh_token: "test-refresh-token",
	expiration_time: "2099-01-01T00:00:00.000Z",
	scopes: ["account:read"],
};

describe("writeAuthCredentials", () => {
	runInTempDir();

	it("round-trips a UserAuthConfig through the TOML file", ({ expect }) => {
		writeAuthCredentials(SAMPLE_CONFIG);
		expect(readAuthCredentials()).toEqual(SAMPLE_CONFIG);
	});

	// POSIX-only: Windows doesn't honour POSIX mode bits — `chmodSync` only
	// touches the read-only flag there, so the `& 0o777 === 0o600` assertion
	// would be meaningless. The hardening still runs unconditionally; we
	// just skip the assertion that wouldn't hold cross-platform.
	it.skipIf(process.platform === "win32")(
		"writes a new auth config file with mode 0o600",
		({ expect }) => {
			writeAuthCredentials(SAMPLE_CONFIG);
			const mode = statSync(getAuthConfigFilePath()).mode & 0o777;
			expect(mode).toBe(0o600);
		}
	);

	it.skipIf(process.platform === "win32")(
		"tightens permissions on a pre-existing auth config file with looser mode",
		({ expect }) => {
			// Simulate a file left behind by an older Wrangler version that
			// wrote with the process umask (typically 0o644).
			writeAuthCredentials(SAMPLE_CONFIG);
			chmodSync(getAuthConfigFilePath(), 0o644);
			expect(statSync(getAuthConfigFilePath()).mode & 0o777).toBe(0o644);

			// Re-saving must restore the tight 0o600 permissions even though
			// `writeFileSync`'s `mode` option is ignored for existing files.
			writeAuthCredentials(SAMPLE_CONFIG);
			expect(statSync(getAuthConfigFilePath()).mode & 0o777).toBe(0o600);
		}
	);
});

describe("createTomlFileStorage read() contract", () => {
	runInTempDir();

	it("returns undefined when the file does not exist", ({ expect }) => {
		const storage = createTomlFileStorage(() => path.resolve("missing.toml"));
		expect(storage.read()).toBeUndefined();
	});

	it("returns undefined for an unparseable file rather than throwing", ({
		expect,
	}) => {
		// The generic TOML helper backs the temporary-account cache, where a
		// corrupt file must be a cache miss (re-mint) rather than a hard
		// error — per the `ConfigStorage<T>` contract. (The auth
		// `FileCredentialStore` in `@cloudflare/workers-auth` deliberately
		// throws instead; that's a separate, user-inspectable store.)
		const filePath = path.resolve("corrupt.toml");
		writeFileSync(filePath, "this is [not valid toml");
		const storage = createTomlFileStorage(() => filePath);
		expect(storage.read()).toBeUndefined();
	});

	it("propagates genuine I/O errors (e.g. when the path is a directory)", ({
		expect,
	}) => {
		// An `EISDIR` from `readFileSync` is a genuine error, not the empty
		// state, so it must propagate rather than be swallowed as undefined.
		const dirPath = path.resolve("a-directory");
		mkdirSync(dirPath, { recursive: true });
		const storage = createTomlFileStorage(() => dirPath);
		expect(() => storage.read()).toThrow();
	});
});
