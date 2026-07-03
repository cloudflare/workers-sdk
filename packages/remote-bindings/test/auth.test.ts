import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { createEnvAuthResolver } from "../src/auth";
import type { AuthConfigStorage } from "@cloudflare/workers-auth";

/**
 * An in-memory auth-config storage, so tests never read the developer's real
 * `~/.wrangler` auth config. Token resolution itself is covered by
 * `@cloudflare/workers-auth`; these tests focus on the account-id assembly
 * layered on top.
 */
function emptyStorage(): AuthConfigStorage {
	const file = path.join(mkdtempSync(path.join(tmpdir(), "rb-auth-")), "auth");
	return {
		read: () => undefined,
		write: () => {},
		clear: () => false,
		path: () => file,
	};
}

describe("createEnvAuthResolver", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("assembles accountId + apiToken from the environment", async ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "env-token");
		vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "env-account");

		const resolve = createEnvAuthResolver({
			storage: emptyStorage(),
			logger: console,
		});

		expect(await resolve()).toEqual({
			accountId: "env-account",
			apiToken: { apiToken: "env-token" },
		});
	});

	it("uses an explicit accountId over the env var", async ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "env-token");
		vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "env-account");

		const resolve = createEnvAuthResolver({
			accountId: "explicit-account",
			storage: emptyStorage(),
			logger: console,
		});

		expect((await resolve()).accountId).toBe("explicit-account");
	});

	it("throws when the account ID cannot be determined", async ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "env-token");
		vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");

		const resolve = createEnvAuthResolver({
			storage: emptyStorage(),
			logger: console,
		});

		await expect(resolve()).rejects.toThrow(
			"Unable to determine the Cloudflare account ID"
		);
	});

	it("surfaces the not-authenticated error when there are no credentials", async ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
		vi.stubEnv("CLOUDFLARE_API_KEY", "");
		vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "env-account");

		const resolve = createEnvAuthResolver({
			storage: emptyStorage(),
			logger: console,
		});

		await expect(resolve()).rejects.toThrow("Not authenticated");
	});
});
