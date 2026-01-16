import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { getGlobalWranglerConfigPath } from "@cloudflare/workers-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	authConfigToProfile,
	checkCredentialsFilePermissions,
	clearGlobalCurrentProfile,
	clearProjectProfile,
	DEFAULT_PROFILE_NAME,
	deleteProfile,
	getCredentialsFilePath,
	getGlobalCurrentProfilePath,
	getProfile,
	getProfileFromEnv,
	getProjectProfilePath,
	isValidProfileName,
	isWranglerProject,
	listProfiles,
	migrateLegacyAuthConfig,
	profileToAuthConfig,
	readCredentialsFile,
	readGlobalCurrentProfile,
	readProjectProfile,
	resolveActiveProfile,
	saveProfile,
	writeCredentialsFile,
	writeGlobalCurrentProfile,
	writeProjectProfile,
} from "../user/profile";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";

describe("Profile", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	describe("isValidProfileName", () => {
		it("should accept valid profile names", () => {
			expect(isValidProfileName("default")).toBe(true);
			expect(isValidProfileName("my-profile")).toBe(true);
			expect(isValidProfileName("my_profile")).toBe(true);
			expect(isValidProfileName("profile123")).toBe(true);
			expect(isValidProfileName("MyProfile")).toBe(true);
			expect(isValidProfileName("a")).toBe(true);
			expect(isValidProfileName("ABC-123_xyz")).toBe(true);
		});

		it("should reject invalid profile names", () => {
			expect(isValidProfileName("")).toBe(false);
			expect(isValidProfileName("my profile")).toBe(false);
			expect(isValidProfileName("my.profile")).toBe(false);
			expect(isValidProfileName("my/profile")).toBe(false);
			expect(isValidProfileName("my@profile")).toBe(false);
			expect(isValidProfileName("my:profile")).toBe(false);
			expect(isValidProfileName("profile!")).toBe(false);
		});
	});

	describe("credentials file operations", () => {
		it("should return empty object when credentials file doesn't exist", () => {
			const credentials = readCredentialsFile();
			expect(credentials).toEqual({});
		});

		it("should write and read credentials file", () => {
			const credentials = {
				default: {
					oauth_token: "test-token",
					refresh_token: "test-refresh",
					expiration_time: "2025-01-01T00:00:00Z",
					scopes: ["account:read"],
				},
				work: {
					api_token: "work-api-token",
					account_id: "work-account-123",
				},
			};

			writeCredentialsFile(credentials);

			const readBack = readCredentialsFile();
			expect(readBack).toEqual(credentials);
		});

		it("should create credentials directory if it doesn't exist", () => {
			const credentialsPath = getCredentialsFilePath();
			const credentialsDir = path.dirname(credentialsPath);

			// Directory should not exist initially
			expect(existsSync(credentialsDir)).toBe(false);

			writeCredentialsFile({ default: { api_token: "test" } });

			// Now it should exist
			expect(existsSync(credentialsDir)).toBe(true);
			expect(existsSync(credentialsPath)).toBe(true);
		});
	});

	describe("getProfile and saveProfile", () => {
		it("should return undefined for non-existent profile", () => {
			expect(getProfile("non-existent")).toBeUndefined();
		});

		it("should save and retrieve a profile", () => {
			const profile = {
				oauth_token: "my-token",
				refresh_token: "my-refresh",
				scopes: ["account:read", "workers:write"],
			};

			saveProfile("my-profile", profile);

			const retrieved = getProfile("my-profile");
			expect(retrieved).toEqual(profile);
		});

		it("should update existing profile", () => {
			saveProfile("test", { api_token: "token-1" });
			saveProfile("test", { api_token: "token-2" });

			const profile = getProfile("test");
			expect(profile?.api_token).toBe("token-2");
		});
	});

	describe("deleteProfile", () => {
		it("should return false when deleting non-existent profile", () => {
			expect(deleteProfile("non-existent")).toBe(false);
		});

		it("should delete existing profile", () => {
			saveProfile("to-delete", { api_token: "token" });
			expect(getProfile("to-delete")).toBeDefined();

			const result = deleteProfile("to-delete");
			expect(result).toBe(true);
			expect(getProfile("to-delete")).toBeUndefined();
		});

		it("should not affect other profiles when deleting", () => {
			saveProfile("keep", { api_token: "keep-token" });
			saveProfile("delete", { api_token: "delete-token" });

			deleteProfile("delete");

			expect(getProfile("keep")).toEqual({ api_token: "keep-token" });
		});
	});

	describe("listProfiles", () => {
		it("should return empty array when no profiles exist", () => {
			expect(listProfiles()).toEqual([]);
		});

		it("should list all profile names", () => {
			saveProfile("default", { api_token: "token-1" });
			saveProfile("work", { api_token: "token-2" });
			saveProfile("personal", { api_token: "token-3" });

			const profiles = listProfiles();
			expect(profiles).toContain("default");
			expect(profiles).toContain("work");
			expect(profiles).toContain("personal");
			expect(profiles).toHaveLength(3);
		});
	});

	describe("global current profile", () => {
		it("should return undefined when no global profile is set", () => {
			expect(readGlobalCurrentProfile()).toBeUndefined();
		});

		it("should write and read global current profile", () => {
			writeGlobalCurrentProfile("my-profile");
			expect(readGlobalCurrentProfile()).toBe("my-profile");
		});

		it("should clear global current profile", () => {
			writeGlobalCurrentProfile("test");
			expect(readGlobalCurrentProfile()).toBe("test");

			clearGlobalCurrentProfile();
			expect(readGlobalCurrentProfile()).toBeUndefined();
		});
	});

	describe("project profile", () => {
		it("should return undefined when no project profile is set", () => {
			expect(readProjectProfile()).toBeUndefined();
		});

		it("should write and read project profile", () => {
			writeProjectProfile("my-project-profile");
			expect(readProjectProfile()).toBe("my-project-profile");
		});

		it("should clear project profile", () => {
			writeProjectProfile("test");
			expect(readProjectProfile()).toBe("test");

			const result = clearProjectProfile();
			expect(result).toBe(true);
			expect(readProjectProfile()).toBeUndefined();
		});

		it("should return false when clearing non-existent project profile", () => {
			expect(clearProjectProfile()).toBe(false);
		});
	});

	describe("resolveActiveProfile", () => {
		it("should return default profile when nothing is set", () => {
			const result = resolveActiveProfile();
			expect(result.name).toBe(DEFAULT_PROFILE_NAME);
			expect(result.source).toBe("default");
		});

		it("should prefer CLI flag over everything else", () => {
			writeGlobalCurrentProfile("global");
			writeProjectProfile("project");
			vi.stubEnv("WRANGLER_PROFILE", "env");

			const result = resolveActiveProfile("cli-profile");
			expect(result.name).toBe("cli-profile");
			expect(result.source).toBe("cli");

			vi.unstubAllEnvs();
		});

		it("should prefer env var over project and global", () => {
			writeGlobalCurrentProfile("global");
			writeProjectProfile("project");
			vi.stubEnv("WRANGLER_PROFILE", "env-profile");

			const result = resolveActiveProfile();
			expect(result.name).toBe("env-profile");
			expect(result.source).toBe("env");

			vi.unstubAllEnvs();
		});

		it("should prefer project profile over global", () => {
			writeGlobalCurrentProfile("global");
			writeProjectProfile("project-profile");

			const result = resolveActiveProfile();
			expect(result.name).toBe("project-profile");
			expect(result.source).toBe("project");
		});

		it("should use global profile when no project profile exists", () => {
			writeGlobalCurrentProfile("global-profile");

			const result = resolveActiveProfile();
			expect(result.name).toBe("global-profile");
			expect(result.source).toBe("global");
		});
	});

	describe("getProfileFromEnv", () => {
		it("should return undefined when env var is not set", () => {
			expect(getProfileFromEnv()).toBeUndefined();
		});

		it("should return env var value when set", () => {
			vi.stubEnv("WRANGLER_PROFILE", "test-profile");
			expect(getProfileFromEnv()).toBe("test-profile");
			vi.unstubAllEnvs();
		});
	});

	describe("migrateLegacyAuthConfig", () => {
		it("should return false when legacy file doesn't exist", () => {
			expect(migrateLegacyAuthConfig()).toBe(false);
		});

		it("should migrate legacy config to default profile", () => {
			// Create legacy config directory and file
			const legacyDir = path.join(getGlobalWranglerConfigPath(), "config");
			mkdirSync(legacyDir, { recursive: true });
			const legacyPath = path.join(legacyDir, "default.toml");

			writeFileSync(
				legacyPath,
				`oauth_token = "legacy-token"
refresh_token = "legacy-refresh"
expiration_time = "2025-01-01T00:00:00Z"
scopes = ["account:read"]
`
			);

			const result = migrateLegacyAuthConfig();
			expect(result).toBe(true);

			const profile = getProfile(DEFAULT_PROFILE_NAME);
			expect(profile?.oauth_token).toBe("legacy-token");
			expect(profile?.refresh_token).toBe("legacy-refresh");
			expect(profile?.scopes).toEqual(["account:read"]);

			// Should set global current profile
			expect(readGlobalCurrentProfile()).toBe(DEFAULT_PROFILE_NAME);
		});

		it("should not migrate if default profile already exists", () => {
			// First, create an existing default profile
			saveProfile(DEFAULT_PROFILE_NAME, { api_token: "existing-token" });

			// Create legacy config
			const legacyDir = path.join(getGlobalWranglerConfigPath(), "config");
			mkdirSync(legacyDir, { recursive: true });
			const legacyPath = path.join(legacyDir, "default.toml");

			writeFileSync(
				legacyPath,
				`oauth_token = "legacy-token"
`
			);

			const result = migrateLegacyAuthConfig();
			expect(result).toBe(false);

			// Should keep existing profile
			const profile = getProfile(DEFAULT_PROFILE_NAME);
			expect(profile?.api_token).toBe("existing-token");
			expect(profile?.oauth_token).toBeUndefined();
		});

		it("should not migrate if legacy file has no tokens", () => {
			const legacyDir = path.join(getGlobalWranglerConfigPath(), "config");
			mkdirSync(legacyDir, { recursive: true });
			const legacyPath = path.join(legacyDir, "default.toml");

			writeFileSync(legacyPath, "# empty config\n");

			const result = migrateLegacyAuthConfig();
			expect(result).toBe(false);
		});
	});

	describe("profileToAuthConfig and authConfigToProfile", () => {
		it("should convert profile to auth config", () => {
			const profile = {
				oauth_token: "token",
				refresh_token: "refresh",
				expiration_time: "2025-01-01T00:00:00Z",
				scopes: ["account:read"],
				api_token: undefined,
				account_id: "account-123",
			};

			const authConfig = profileToAuthConfig(profile);
			expect(authConfig.oauth_token).toBe("token");
			expect(authConfig.refresh_token).toBe("refresh");
			expect(authConfig.expiration_time).toBe("2025-01-01T00:00:00Z");
			expect(authConfig.scopes).toEqual(["account:read"]);
		});

		it("should convert auth config to profile", () => {
			const authConfig = {
				oauth_token: "token",
				refresh_token: "refresh",
				expiration_time: "2025-01-01T00:00:00Z",
				scopes: ["account:read" as const],
			};

			const profile = authConfigToProfile(authConfig, "account-123");
			expect(profile.oauth_token).toBe("token");
			expect(profile.refresh_token).toBe("refresh");
			expect(profile.expiration_time).toBe("2025-01-01T00:00:00Z");
			expect(profile.scopes).toEqual(["account:read"]);
			expect(profile.account_id).toBe("account-123");
		});
	});

	describe("isWranglerProject", () => {
		it("should return false when no wrangler config exists", () => {
			expect(isWranglerProject()).toBe(false);
		});

		it("should return true when wrangler.toml exists", () => {
			writeFileSync("wrangler.toml", 'name = "test"');
			expect(isWranglerProject()).toBe(true);
		});

		it("should return true when wrangler.json exists", () => {
			writeFileSync("wrangler.json", '{"name": "test"}');
			expect(isWranglerProject()).toBe(true);
		});

		it("should return true when wrangler.jsonc exists", () => {
			writeFileSync("wrangler.jsonc", '{"name": "test"}');
			expect(isWranglerProject()).toBe(true);
		});
	});

	describe("checkCredentialsFilePermissions", () => {
		it("should return true when credentials file doesn't exist", () => {
			expect(checkCredentialsFilePermissions()).toBe(true);
		});

		it("should return true for secure permissions", () => {
			// Write with secure permissions (mode 0o600)
			writeCredentialsFile({ default: { api_token: "test" } });
			expect(checkCredentialsFilePermissions()).toBe(true);
		});
	});
});
