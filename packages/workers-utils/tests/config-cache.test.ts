import { existsSync } from "node:fs";
import * as path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { createConfigCache } from "../src/config-cache";
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

describe("createConfigCache namespace isolation", () => {
	runInTempDir();

	it("defaults to the `.wrangler/cache` folder", ({ expect }) => {
		// No node_modules in the temp dir, so it falls back to `.<namespace>/cache`.
		const cache = createConfigCache(testLogger());
		expect(cache.getCacheFolder()).toBe(
			path.join(process.cwd(), ".wrangler", "cache")
		);
	});

	it("uses a namespaced folder when a namespace is given", ({ expect }) => {
		const cache = createConfigCache(testLogger(), { namespace: "cloudflare" });
		expect(cache.getCacheFolder()).toBe(
			path.join(process.cwd(), ".cloudflare", "cache")
		);
	});

	it("purging one namespace does not delete another's cache", ({ expect }) => {
		const wrangler = createConfigCache(testLogger());
		const cloudflare = createConfigCache(testLogger(), {
			namespace: "cloudflare",
		});

		wrangler.saveToConfigCache("account.json", { id: "w" });
		cloudflare.saveToConfigCache("account.json", { id: "c" });

		const wranglerFolder = wrangler.getCacheFolder();
		const cloudflareFolder = cloudflare.getCacheFolder();
		expect(wranglerFolder).not.toBe(cloudflareFolder);
		expect(existsSync(wranglerFolder)).toBe(true);
		expect(existsSync(cloudflareFolder)).toBe(true);

		// cf-style purge must leave wrangler's cache intact.
		cloudflare.purgeConfigCaches();
		expect(existsSync(cloudflareFolder)).toBe(false);
		expect(existsSync(wranglerFolder)).toBe(true);
		expect(wrangler.getConfigCache("account.json")).toEqual({ id: "w" });
	});

	it("ignores WRANGLER_CACHE_DIR for a non-wrangler namespace", ({
		expect,
	}) => {
		vi.stubEnv("WRANGLER_CACHE_DIR", path.join(process.cwd(), "custom-cache"));

		const wrangler = createConfigCache(testLogger());
		const cloudflare = createConfigCache(testLogger(), {
			namespace: "cloudflare",
		});

		// wrangler honours the override; cf does not (it's a wrangler-specific var).
		expect(wrangler.getCacheFolder()).toBe(
			path.join(process.cwd(), "custom-cache")
		);
		expect(cloudflare.getCacheFolder()).toBe(
			path.join(process.cwd(), ".cloudflare", "cache")
		);

		vi.unstubAllEnvs();
	});
});
