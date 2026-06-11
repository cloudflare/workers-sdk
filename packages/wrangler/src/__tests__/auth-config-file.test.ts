import { chmodSync, statSync } from "node:fs";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import {
	getAuthConfigFilePath,
	readAuthConfigFile,
	writeAuthConfigFile,
} from "../user";
import type { UserAuthConfig } from "../user";

const SAMPLE_CONFIG: UserAuthConfig = {
	oauth_token: "test-oauth-token",
	refresh_token: "test-refresh-token",
	expiration_time: "2099-01-01T00:00:00.000Z",
	scopes: ["account:read"],
};

describe("writeAuthConfigFile", () => {
	runInTempDir();

	it("round-trips a UserAuthConfig through the TOML file", ({ expect }) => {
		writeAuthConfigFile(SAMPLE_CONFIG);
		expect(readAuthConfigFile()).toEqual(SAMPLE_CONFIG);
	});

	// POSIX-only: Windows doesn't honour POSIX mode bits — `chmodSync` only
	// touches the read-only flag there, so the `& 0o777 === 0o600` assertion
	// would be meaningless. The hardening still runs unconditionally; we
	// just skip the assertion that wouldn't hold cross-platform.
	it.skipIf(process.platform === "win32")(
		"writes a new auth config file with mode 0o600",
		({ expect }) => {
			writeAuthConfigFile(SAMPLE_CONFIG);
			const mode = statSync(getAuthConfigFilePath()).mode & 0o777;
			expect(mode).toBe(0o600);
		}
	);

	it.skipIf(process.platform === "win32")(
		"tightens permissions on a pre-existing auth config file with looser mode",
		({ expect }) => {
			// Simulate a file left behind by an older Wrangler version that
			// wrote with the process umask (typically 0o644).
			writeAuthConfigFile(SAMPLE_CONFIG);
			chmodSync(getAuthConfigFilePath(), 0o644);
			expect(statSync(getAuthConfigFilePath()).mode & 0o777).toBe(0o644);

			// Re-saving must restore the tight 0o600 permissions even though
			// `writeFileSync`'s `mode` option is ignored for existing files.
			writeAuthConfigFile(SAMPLE_CONFIG);
			expect(statSync(getAuthConfigFilePath()).mode & 0o777).toBe(0o600);
		}
	);
});
