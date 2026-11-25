import os from "node:os";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { createConfigCache } from "../src/config-cache";
import { getGlobalConfigPath } from "../src/global-wrangler-config-path";
import type { Logger } from "../src/logger";

function testLogger(): Logger {
	return {
		debug: vi.fn(),
		log: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	};
}

/**
 * Running an account-scoped command with the home directory as the working
 * directory used to create `<home>/.wrangler/cache`, because the config cache
 * falls back to `<cwd>/.wrangler/cache` when no `node_modules` is found.
 * `<home>/.wrangler` then exists, so `getGlobalConfigPath()` resolves it as the
 * legacy global config directory and the credential store stops finding the
 * token stored at the XDG path.
 */
describe("config cache in the home directory", () => {
	runInTempDir();

	it("does not turn the home directory into the legacy global config directory", ({
		expect,
	}) => {
		// Work from the home directory, as `cd ~ && wrangler r2 bucket list` does.
		process.chdir(os.homedir());

		// With no `~/.wrangler`, the token lives at the XDG config path.
		const configPathBefore = getGlobalConfigPath();
		expect(configPathBefore).toBe(
			path.join(os.homedir(), ".config", ".wrangler")
		);

		// Caching the selected account is what creates `<home>/.wrangler`.
		const cache = createConfigCache(testLogger());
		cache.saveToConfigCache("wrangler-account.json", {
			account: { id: "0123456789abcdef0123456789abcdef", name: "Mock" },
		});

		expect(getGlobalConfigPath()).toBe(configPathBefore);
	});
});
