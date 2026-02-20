import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
	COMPLIANCE_REGION_CONFIG_UNKNOWN,
	getGlobalWranglerConfigPath,
	parseTOML,
	readFileSync,
} from "@cloudflare/workers-utils";
import { http, HttpResponse } from "msw";
import TOML from "smol-toml";
import { beforeEach, describe, it, vi } from "vitest";
import {
	clearProfileOverride,
	deleteProfile,
	fetchAllAccounts,
	getActiveProfile,
	getAuthConfigFilePath,
	listProfiles,
	profileExists,
	readAuthConfigFile,
	setActiveProfile,
	setProfileOverride,
	validateProfileName,
	writeAuthConfigFile,
} from "../user";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { mockOAuthFlow } from "./helpers/mock-oauth-flow";
import {
	createFetchResult,
	msw,
	mswSuccessOauthHandlers,
	mswSuccessUserHandlers,
} from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { UserAuthConfig } from "../user";

describe("Profile", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		msw.use(...mswSuccessOauthHandlers);
		setIsTTY(true);
	});

	describe("validateProfileName", () => {
		it("should accept valid profile names", ({ expect }) => {
			expect(() => validateProfileName("default")).not.toThrow();
			expect(() => validateProfileName("work")).not.toThrow();
			expect(() => validateProfileName("my-company")).not.toThrow();
			expect(() => validateProfileName("profile_1")).not.toThrow();
			expect(() => validateProfileName("Test123")).not.toThrow();
		});

		it("should reject empty names", ({ expect }) => {
			expect(() => validateProfileName("")).toThrow(
				"Profile name cannot be empty"
			);
		});

		it("should reject names with invalid characters", ({ expect }) => {
			expect(() => validateProfileName("my profile")).toThrow(
				"Only letters, numbers, hyphens, and underscores"
			);
			expect(() => validateProfileName("foo/bar")).toThrow(
				"Only letters, numbers, hyphens, and underscores"
			);
			expect(() => validateProfileName("foo.bar")).toThrow(
				"Only letters, numbers, hyphens, and underscores"
			);
		});

		it("should reject names that are too long", ({ expect }) => {
			const longName = "a".repeat(65);
			expect(() => validateProfileName(longName)).toThrow(
				"at most 64 characters"
			);
		});
	});

	describe("getAuthConfigFilePath", () => {
		it("should return default.toml for the default profile", ({ expect }) => {
			const filePath = getAuthConfigFilePath("default");
			expect(filePath).toContain("default.toml");
			expect(filePath).not.toContain("profiles");
		});

		it("should return profiles/<name>.toml for named profiles", ({ expect }) => {
			const filePath = getAuthConfigFilePath("work");
			expect(filePath).toContain(path.join("profiles", "work.toml"));
		});
	});

	describe("writeAuthConfigFile / readAuthConfigFile", () => {
		it("should write and read auth config for the default profile", ({ expect }) => {
			const config: UserAuthConfig = {
				oauth_token: "test-token",
				refresh_token: "test-refresh",
				expiration_time: "2030-01-01T00:00:00Z",
				scopes: ["account:read"],
			};
			writeAuthConfigFile(config, "default");
			const read = readAuthConfigFile("default");
			expect(read.oauth_token).toBe("test-token");
			expect(read.refresh_token).toBe("test-refresh");
		});

		it("should write and read auth config for a named profile", ({ expect }) => {
			const config: UserAuthConfig = {
				oauth_token: "work-token",
				refresh_token: "work-refresh",
				expiration_time: "2030-01-01T00:00:00Z",
				scopes: ["account:read"],
			};
			writeAuthConfigFile(config, "work");
			const read = readAuthConfigFile("work");
			expect(read.oauth_token).toBe("work-token");
			expect(read.refresh_token).toBe("work-refresh");
		});

		it("should keep profiles isolated from each other", ({ expect }) => {
			writeAuthConfigFile(
				{
					oauth_token: "default-token",
					refresh_token: "default-refresh",
					expiration_time: "2030-01-01T00:00:00Z",
				},
				"default"
			);
			writeAuthConfigFile(
				{
					oauth_token: "work-token",
					refresh_token: "work-refresh",
					expiration_time: "2030-01-01T00:00:00Z",
				},
				"work"
			);

			expect(readAuthConfigFile("default").oauth_token).toBe("default-token");
			expect(readAuthConfigFile("work").oauth_token).toBe("work-token");
		});
	});

	describe("profileExists", () => {
		it("should always return true for default", ({ expect }) => {
			expect(profileExists("default")).toBe(true);
		});

		it("should return false for non-existent profiles", ({ expect }) => {
			expect(profileExists("nonexistent")).toBe(false);
		});

		it("should return true after writing a profile config", ({ expect }) => {
			writeAuthConfigFile(
				{
					oauth_token: "token",
					refresh_token: "refresh",
					expiration_time: "2030-01-01T00:00:00Z",
				},
				"work"
			);
			expect(profileExists("work")).toBe(true);
		});
	});

	describe("listProfiles", () => {
		it("should return only default when no profiles exist", ({ expect }) => {
			expect(listProfiles()).toEqual(["default"]);
		});

		it("should include named profiles", ({ expect }) => {
			writeAuthConfigFile(
				{
					oauth_token: "token1",
					refresh_token: "refresh1",
					expiration_time: "2030-01-01T00:00:00Z",
				},
				"work"
			);
			writeAuthConfigFile(
				{
					oauth_token: "token2",
					refresh_token: "refresh2",
					expiration_time: "2030-01-01T00:00:00Z",
				},
				"personal"
			);

			const profiles = listProfiles();
			expect(profiles).toContain("default");
			expect(profiles).toContain("work");
			expect(profiles).toContain("personal");
		});
	});

	describe("getActiveProfile", () => {
		it("should return default when nothing is configured", ({ expect }) => {
			expect(getActiveProfile()).toBe("default");
		});

		it("should respect WRANGLER_PROFILE env var", ({ expect }) => {
			vi.stubEnv("WRANGLER_PROFILE", "work");
			expect(getActiveProfile()).toBe("work");
			vi.unstubAllEnvs();
		});

		it("should respect setProfileOverride", ({ expect }) => {
			setProfileOverride("custom");
			expect(getActiveProfile()).toBe("custom");
		});

		it("should respect profiles.toml active_profile", ({ expect }) => {
			setActiveProfile("work");
			// Reset any override so profiles.toml is checked
			clearProfileOverride();
			expect(getActiveProfile()).toBe("work");
		});

		it("should reject invalid WRANGLER_PROFILE values", ({ expect }) => {
			vi.stubEnv("WRANGLER_PROFILE", "../../../etc/passwd");
			expect(() => getActiveProfile()).toThrow(
				"Only letters, numbers, hyphens, and underscores"
			);
			vi.unstubAllEnvs();
		});

		it("should reject invalid active_profile in profiles.toml", ({ expect }) => {
			const configDir = path.join(
				getGlobalWranglerConfigPath(),
				"config"
			);
			mkdirSync(configDir, { recursive: true });
			writeFileSync(
				path.join(configDir, "profiles.toml"),
				TOML.stringify({ active_profile: "foo/bar" })
			);
			expect(() => getActiveProfile()).toThrow(
				"Only letters, numbers, hyphens, and underscores"
			);
		});
	});

	describe("setActiveProfile", () => {
		it("should write profiles.toml", ({ expect }) => {
			setActiveProfile("work");
			const profilesConfigPath = path.join(
				getGlobalWranglerConfigPath(),
				"config",
				"profiles.toml"
			);
			const content = parseTOML(readFileSync(profilesConfigPath)) as {
				active_profile?: string;
			};
			expect(content.active_profile).toBe("work");
		});
	});

	describe("deleteProfile", () => {
		it("should throw when trying to delete default", ({ expect }) => {
			expect(() => deleteProfile("default")).toThrow(
				"Cannot delete the default profile"
			);
		});

		it("should throw when profile doesn't exist", ({ expect }) => {
			expect(() => deleteProfile("nonexistent")).toThrow(
				'does not exist'
			);
		});

		it("should delete an existing profile", ({ expect }) => {
			writeAuthConfigFile(
				{
					oauth_token: "token",
					refresh_token: "refresh",
					expiration_time: "2030-01-01T00:00:00Z",
				},
				"work"
			);
			expect(profileExists("work")).toBe(true);
			deleteProfile("work");
			expect(profileExists("work")).toBe(false);
		});

		it("should reset profiles.toml when deleting active profile while a different override is set", ({ expect }) => {
			writeAuthConfigFile(
				{
					oauth_token: "token",
					refresh_token: "refresh",
					expiration_time: "2030-01-01T00:00:00Z",
				},
				"work"
			);
			// Mark "work" as the active profile in profiles.toml
			setActiveProfile("work");
			expect(getActiveProfile()).toBe("work");

			// Set a CLI override to a different profile so getActiveProfile()
			// would return "personal" instead of "work"
			writeAuthConfigFile(
				{
					oauth_token: "token2",
					refresh_token: "refresh2",
					expiration_time: "2030-01-01T00:00:00Z",
				},
				"personal"
			);
			setProfileOverride("personal");
			expect(getActiveProfile()).toBe("personal");

			// Delete "work" — profiles.toml should be reset to "default"
			// even though the override points elsewhere
			deleteProfile("work");
			clearProfileOverride();
			expect(getActiveProfile()).toBe("default");
		});
	});

	describe("staging environment", () => {
		it("profileExists should find staging profile in staging env", ({ expect }) => {
			vi.stubEnv("WRANGLER_API_ENVIRONMENT", "staging");
			writeAuthConfigFile(
				{
					oauth_token: "token",
					refresh_token: "refresh",
					expiration_time: "2030-01-01T00:00:00Z",
				},
				"work"
			);
			expect(profileExists("work")).toBe(true);
			vi.unstubAllEnvs();
		});

		it("profileExists should not find production profile in staging env", ({ expect }) => {
			writeAuthConfigFile(
				{
					oauth_token: "token",
					refresh_token: "refresh",
					expiration_time: "2030-01-01T00:00:00Z",
				},
				"work"
			);
			vi.stubEnv("WRANGLER_API_ENVIRONMENT", "staging");
			expect(profileExists("work")).toBe(false);
			vi.unstubAllEnvs();
		});

		it("listProfiles should list staging profiles by correct name", ({ expect }) => {
			vi.stubEnv("WRANGLER_API_ENVIRONMENT", "staging");
			writeAuthConfigFile(
				{
					oauth_token: "token",
					refresh_token: "refresh",
					expiration_time: "2030-01-01T00:00:00Z",
				},
				"work"
			);
			const profiles = listProfiles();
			expect(profiles).toContain("default");
			expect(profiles).toContain("work");
			vi.unstubAllEnvs();
		});

		it("listProfiles should not list production profiles in staging env", ({ expect }) => {
			writeAuthConfigFile(
				{
					oauth_token: "token",
					refresh_token: "refresh",
					expiration_time: "2030-01-01T00:00:00Z",
				},
				"work"
			);
			vi.stubEnv("WRANGLER_API_ENVIRONMENT", "staging");
			const profiles = listProfiles();
			expect(profiles).toEqual(["default"]);
			vi.unstubAllEnvs();
		});

		it("deleteProfile should delete staging profile in staging env", ({ expect }) => {
			vi.stubEnv("WRANGLER_API_ENVIRONMENT", "staging");
			writeAuthConfigFile(
				{
					oauth_token: "token",
					refresh_token: "refresh",
					expiration_time: "2030-01-01T00:00:00Z",
				},
				"work"
			);
			expect(profileExists("work")).toBe(true);
			deleteProfile("work");
			expect(profileExists("work")).toBe(false);
			vi.unstubAllEnvs();
		});

		it("deleteProfile should not find production profile in staging env", ({ expect }) => {
			writeAuthConfigFile(
				{
					oauth_token: "token",
					refresh_token: "refresh",
					expiration_time: "2030-01-01T00:00:00Z",
				},
				"work"
			);
			vi.stubEnv("WRANGLER_API_ENVIRONMENT", "staging");
			expect(() => deleteProfile("work")).toThrow("does not exist");
			vi.unstubAllEnvs();
		});
	});

	describe("CLI commands", () => {
		describe("wrangler profile list", () => {
			it("should list default profile when no others exist", async ({ expect }) => {
				await runWrangler("profile list");
				expect(std.out).toContain("default");
			});

			it("should show (active) marker", async ({ expect }) => {
				await runWrangler("profile list");
				expect(std.out).toContain("default (active)");
			});
		});

		describe("wrangler profile use", () => {
			it("should fail when profile doesn't exist", async ({ expect }) => {
				await expect(
					runWrangler("profile use nonexistent")
				).rejects.toThrow(/does not exist/);
			});

			it("should switch to an existing profile", async ({ expect }) => {
				writeAuthConfigFile(
					{
						oauth_token: "token",
						refresh_token: "refresh",
						expiration_time: "2030-01-01T00:00:00Z",
					},
					"work"
				);
				await runWrangler("profile use work");
				expect(std.out).toContain('Switched to profile "work"');
			});
		});

		describe("wrangler profile delete", () => {
			it("should fail when trying to delete default", async ({ expect }) => {
				await expect(
					runWrangler("profile delete default")
				).rejects.toThrow(/Cannot delete the default profile/);
			});

			it("should delete an existing profile", async ({ expect }) => {
				writeAuthConfigFile(
					{
						oauth_token: "token",
						refresh_token: "refresh",
						expiration_time: "2030-01-01T00:00:00Z",
					},
					"work"
				);
				await runWrangler("profile delete work");
				expect(std.out).toContain('Deleted profile "work"');
				expect(profileExists("work")).toBe(false);
			});
		});
	});

	describe("memberships persistence", () => {
		const { mockOAuthServerCallback } = mockOAuthFlow();

		beforeEach(() => {
			msw.use(...mswSuccessUserHandlers);
		});

		it("should persist accounts to the auth config when logging in", async ({
			expect,
		}) => {
			mockOAuthServerCallback("success");
			await runWrangler("login");
			expect(readAuthConfigFile()).toEqual<UserAuthConfig>({
				api_token: undefined,
				oauth_token: "test-access-token",
				refresh_token: "test-refresh-token",
				expiration_time: expect.any(String),
				scopes: ["account:read"],
				accounts: [
					{
						id: "account-1",
						name: "Account One",
						roles: ["Super Administrator - All Privileges"],
					},
					{
						id: "account-2",
						name: "Account Two",
						roles: ["Super Administrator - All Privileges"],
					},
					{
						id: "account-3",
						name: "Account Three",
						roles: ["Super Administrator - All Privileges"],
					},
				],
			});
		});

		it("should still log in successfully when /memberships fails", async ({
			expect,
		}) => {
			mockOAuthServerCallback("success");
			msw.use(
				http.get("*/memberships", () =>
					HttpResponse.json(createFetchResult(null, false, [
						{ code: 9106, message: "Authentication failed" },
					]))
				)
			);
			await runWrangler("login");
			expect(readAuthConfigFile()).toEqual<UserAuthConfig>({
				api_token: undefined,
				oauth_token: "test-access-token",
				refresh_token: "test-refresh-token",
				expiration_time: expect.any(String),
				scopes: ["account:read"],
			});
		});

		it("should write accounts to the per-profile auth config when logging in with --profile", async ({
			expect,
		}) => {
			mockOAuthServerCallback("success");
			await runWrangler("login --profile work");

			const workConfig = readAuthConfigFile("work");
			expect(workConfig.oauth_token).toBe("test-access-token");
			expect(workConfig.accounts).toEqual([
				{
					id: "account-1",
					name: "Account One",
					roles: ["Super Administrator - All Privileges"],
				},
				{
					id: "account-2",
					name: "Account Two",
					roles: ["Super Administrator - All Privileges"],
				},
				{
					id: "account-3",
					name: "Account Three",
					roles: ["Super Administrator - All Privileges"],
				},
			]);

			// Default profile should not have been touched.
			expect(() => readAuthConfigFile("default")).toThrow();
		});

		it("should backfill the accounts field on fetchAllAccounts when missing", async ({
			expect,
		}) => {
			// Simulate a pre-existing profile that does not yet have `accounts`.
			writeAuthConfigFile({
				oauth_token: "existing-token",
				refresh_token: "existing-refresh",
				expiration_time: "2030-01-01T00:00:00Z",
				scopes: ["account:read"],
			});

			expect(readAuthConfigFile().accounts).toBeUndefined();

			await fetchAllAccounts(COMPLIANCE_REGION_CONFIG_UNKNOWN);

			expect(readAuthConfigFile().accounts).toEqual([
				{
					id: "account-1",
					name: "Account One",
					roles: ["Super Administrator - All Privileges"],
				},
				{
					id: "account-2",
					name: "Account Two",
					roles: ["Super Administrator - All Privileges"],
				},
				{
					id: "account-3",
					name: "Account Three",
					roles: ["Super Administrator - All Privileges"],
				},
			]);
		});

		it("should not overwrite an existing accounts field on fetchAllAccounts", async ({
			expect,
		}) => {
			const preExisting = [
				{ id: "old-account", name: "Old", roles: ["Old role"] },
			];
			writeAuthConfigFile({
				oauth_token: "existing-token",
				refresh_token: "existing-refresh",
				expiration_time: "2030-01-01T00:00:00Z",
				scopes: ["account:read"],
				accounts: preExisting,
			});

			await fetchAllAccounts(COMPLIANCE_REGION_CONFIG_UNKNOWN);

			expect(readAuthConfigFile().accounts).toEqual(preExisting);
		});

		it("should not backfill when the auth config has no oauth_token", async ({
			expect,
		}) => {
			// API-token style config — no oauth_token. Backfill should skip.
			writeAuthConfigFile({ api_token: "legacy-token" });

			await fetchAllAccounts(COMPLIANCE_REGION_CONFIG_UNKNOWN);

			expect(readAuthConfigFile().accounts).toBeUndefined();
		});
	});
});
