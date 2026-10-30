import assert from "node:assert";
import {
	createCfProfileStore,
	writeAuthConfigFile,
} from "@cloudflare/workers-auth/cf";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { createLogger as createViteLogger } from "vite";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { createLogger, getRemoteBindingsAuth } from "../auth";
import type { AsyncHook, CfAccount } from "@cloudflare/workers-utils";

describe("remote bindings auth profiles", () => {
	runInTempDir();
	const logger = createLogger(createViteLogger("silent"));
	const accountId = "0123456789abcdef0123456789abcdef";

	beforeEach(() => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", undefined);
		vi.stubEnv("CF_API_TOKEN", undefined);
		vi.stubEnv("CLOUDFLARE_AUTH_USE_KEYRING", "false");
		for (const profile of ["work", "personal", "default"]) {
			writeAuthConfigFile(
				{
					oauth_token: `${profile}-token`,
					expiration_time: "2999-01-01T00:00:00.000Z",
				},
				profile
			);
		}
		createCfProfileStore({ logger }).bindings.activate(
			"personal",
			process.cwd()
		);
	});

	afterEach(() => vi.unstubAllEnvs());

	it.for(["personal", "default", undefined])(
		"should replace cached authentication when the environment profile changes to %s",
		async (profile, { expect }) => {
			const hooks = new Map<string, AsyncHook<CfAccount>>();
			vi.stubEnv("CLOUDFLARE_AUTH_PROFILE", "work");
			const workAuth = getRemoteBindingsAuth(
				hooks,
				process.cwd(),
				accountId,
				logger
			);
			assert(typeof workAuth === "function");
			await expect(workAuth()).resolves.toEqual({
				accountId,
				apiToken: { apiToken: "work-token" },
			});

			vi.stubEnv("CLOUDFLARE_AUTH_PROFILE", profile);
			const nextAuth = getRemoteBindingsAuth(
				hooks,
				process.cwd(),
				accountId,
				logger
			);
			assert(typeof nextAuth === "function");
			expect(nextAuth).not.toBe(workAuth);
			await expect(nextAuth()).resolves.toEqual({
				accountId,
				apiToken: { apiToken: `${profile ?? "personal"}-token` },
			});
			expect(
				getRemoteBindingsAuth(hooks, process.cwd(), accountId, logger)
			).toBe(nextAuth);
		}
	);

	it("should use each hook's original profile when loading credentials lazily", async ({
		expect,
	}) => {
		const hooks = new Map<string, AsyncHook<CfAccount>>();
		vi.stubEnv("CLOUDFLARE_AUTH_PROFILE", "work");
		const workAuth = getRemoteBindingsAuth(
			hooks,
			process.cwd(),
			accountId,
			logger
		);
		vi.stubEnv("CLOUDFLARE_AUTH_PROFILE", "personal");
		const personalAuth = getRemoteBindingsAuth(
			hooks,
			process.cwd(),
			accountId,
			logger
		);
		assert(
			typeof workAuth === "function" && typeof personalAuth === "function"
		);

		await expect(workAuth()).resolves.toEqual({
			accountId,
			apiToken: { apiToken: "work-token" },
		});
		await expect(personalAuth()).resolves.toEqual({
			accountId,
			apiToken: { apiToken: "personal-token" },
		});
	});
});
