import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
	getGlobalWranglerConfigPath,
	parseTOML,
	readFileSync,
} from "@cloudflare/workers-utils";
import TOML from "smol-toml";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearProfileOverride,
	deleteProfile,
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
import { msw, mswSuccessOauthHandlers } from "./helpers/msw";
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
		it("should accept valid profile names", () => {
			expect(() => validateProfileName("default")).not.toThrow();
			expect(() => validateProfileName("work")).not.toThrow();
			expect(() => validateProfileName("my-company")).not.toThrow();
			expect(() => validateProfileName("profile_1")).not.toThrow();
			expect(() => validateProfileName("Test123")).not.toThrow();
		});

		it("should reject empty names", () => {
			expect(() => validateProfileName("")).toThrow(
				"Profile name cannot be empty"
			);
		});

		it("should reject names with invalid characters", () => {
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

		it("should reject names that are too long", () => {
			const longName = "a".repeat(65);
			expect(() => validateProfileName(longName)).toThrow(
				"at most 64 characters"
			);
		});
	});

	describe("getAuthConfigFilePath", () => {
		it("should return default.toml for the default profile", () => {
			const filePath = getAuthConfigFilePath("default");
			expect(filePath).toContain("default.toml");
			expect(filePath).not.toContain("profiles");
		});

		it("should return profiles/<name>.toml for named profiles", () => {
			const filePath = getAuthConfigFilePath("work");
			expect(filePath).toContain(path.join("profiles", "work.toml"));
		});
	});

	describe("writeAuthConfigFile / readAuthConfigFile", () => {
		it("should write and read auth config for the default profile", () => {
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

		it("should write and read auth config for a named profile", () => {
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

		it("should keep profiles isolated from each other", () => {
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
		it("should always return true for default", () => {
			expect(profileExists("default")).toBe(true);
		});

		it("should return false for non-existent profiles", () => {
			expect(profileExists("nonexistent")).toBe(false);
		});

		it("should return true after writing a profile config", () => {
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
		it("should return only default when no profiles exist", () => {
			expect(listProfiles()).toEqual(["default"]);
		});

		it("should include named profiles", () => {
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
		it("should return default when nothing is configured", () => {
			expect(getActiveProfile()).toBe("default");
		});

		it("should respect WRANGLER_PROFILE env var", () => {
			vi.stubEnv("WRANGLER_PROFILE", "work");
			expect(getActiveProfile()).toBe("work");
			vi.unstubAllEnvs();
		});

		it("should respect setProfileOverride", () => {
			setProfileOverride("custom");
			expect(getActiveProfile()).toBe("custom");
		});

		it("should respect profiles.toml active_profile", () => {
			setActiveProfile("work");
			// Reset any override so profiles.toml is checked
			clearProfileOverride();
			expect(getActiveProfile()).toBe("work");
		});

		it("should reject invalid WRANGLER_PROFILE values", () => {
			vi.stubEnv("WRANGLER_PROFILE", "../../../etc/passwd");
			expect(() => getActiveProfile()).toThrow(
				"Only letters, numbers, hyphens, and underscores"
			);
			vi.unstubAllEnvs();
		});

		it("should reject invalid active_profile in profiles.toml", () => {
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
		it("should write profiles.toml", () => {
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
		it("should throw when trying to delete default", () => {
			expect(() => deleteProfile("default")).toThrow(
				"Cannot delete the default profile"
			);
		});

		it("should throw when profile doesn't exist", () => {
			expect(() => deleteProfile("nonexistent")).toThrow(
				'does not exist'
			);
		});

		it("should delete an existing profile", () => {
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
	});

	describe("staging environment", () => {
		it("profileExists should find staging profile in staging env", () => {
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

		it("profileExists should not find production profile in staging env", () => {
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

		it("listProfiles should list staging profiles by correct name", () => {
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

		it("listProfiles should not list production profiles in staging env", () => {
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

		it("deleteProfile should delete staging profile in staging env", () => {
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

		it("deleteProfile should not find production profile in staging env", () => {
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
			it("should list default profile when no others exist", async () => {
				await runWrangler("profile list");
				expect(std.out).toContain("default");
			});

			it("should show (active) marker", async () => {
				await runWrangler("profile list");
				expect(std.out).toContain("default (active)");
			});
		});

		describe("wrangler profile use", () => {
			it("should fail when profile doesn't exist", async () => {
				await expect(
					runWrangler("profile use nonexistent")
				).rejects.toThrow(/does not exist/);
			});

			it("should switch to an existing profile", async () => {
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
			it("should fail when trying to delete default", async () => {
				await expect(
					runWrangler("profile delete default")
				).rejects.toThrow(/Cannot delete the default profile/);
			});

			it("should delete an existing profile", async () => {
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
});
