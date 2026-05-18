import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
	getGlobalWranglerConfigPath,
	readFileSync,
} from "@cloudflare/workers-utils";
import { beforeEach, describe, it, vi } from "vitest";
import {
	deleteProfile,
	getActiveProfile,
	getAuthConfigFilePath,
	getProfileForDirectory,
	listProfiles,
	profileExists,
	readAuthConfigFile,
	readDirectoryBindings,
	setActiveProfile,
	validateProfileName,
	writeAuthConfigFile,
	writeDirectoryBindings,
} from "../user";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { mockOAuthFlow } from "./helpers/mock-oauth-flow";
import {
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

		it("should return profiles/<name>.toml for named profiles", ({
			expect,
		}) => {
			const filePath = getAuthConfigFilePath("work");
			expect(filePath).toContain(path.join("profiles", "work.toml"));
		});
	});

	describe("writeAuthConfigFile / readAuthConfigFile", () => {
		it("should write and read auth config for the default profile", ({
			expect,
		}) => {
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

		it("should write and read auth config for a named profile", ({
			expect,
		}) => {
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

		it("should respect active.json active_profile", ({ expect }) => {
			setActiveProfile("work");
			expect(getActiveProfile()).toBe("work");
		});

		it("should reject invalid WRANGLER_PROFILE values", ({ expect }) => {
			vi.stubEnv("WRANGLER_PROFILE", "../../../etc/passwd");
			expect(() => getActiveProfile()).toThrow(
				"Only letters, numbers, hyphens, and underscores"
			);
			vi.unstubAllEnvs();
		});

		it("should reject invalid active_profile in active.json", ({ expect }) => {
			const configDir = path.join(getGlobalWranglerConfigPath(), "config");
			mkdirSync(configDir, { recursive: true });
			writeFileSync(
				path.join(configDir, "active.json"),
				JSON.stringify({ active_profile: "foo/bar" })
			);
			expect(() => getActiveProfile()).toThrow(
				"Only letters, numbers, hyphens, and underscores"
			);
		});

		it("should resolve profile from directory binding", ({ expect }) => {
			const dir = process.cwd();
			writeDirectoryBindings({ [dir]: "work" });
			expect(getActiveProfile()).toBe("work");
		});

		it("should walk up directories to find a binding", ({ expect }) => {
			const parentDir = path.dirname(process.cwd());
			writeDirectoryBindings({ [parentDir]: "work" });
			expect(getActiveProfile()).toBe("work");
		});

		it("should prioritize WRANGLER_PROFILE over directory binding", ({
			expect,
		}) => {
			const dir = process.cwd();
			writeDirectoryBindings({ [dir]: "dir-profile" });
			vi.stubEnv("WRANGLER_PROFILE", "env-profile");
			expect(getActiveProfile()).toBe("env-profile");
			vi.unstubAllEnvs();
		});

		it("should prioritize directory binding over active.json", ({ expect }) => {
			setActiveProfile("active-profile");
			const dir = process.cwd();
			writeDirectoryBindings({ [dir]: "dir-profile" });
			expect(getActiveProfile()).toBe("dir-profile");
		});
	});

	describe("directory bindings", () => {
		it("should return undefined when no bindings exist", ({ expect }) => {
			expect(getProfileForDirectory()).toBeUndefined();
		});

		it("should match exact directory", ({ expect }) => {
			const dir = process.cwd();
			writeDirectoryBindings({ [dir]: "work" });
			expect(getProfileForDirectory(dir)).toBe("work");
		});

		it("should walk up to parent directories", ({ expect }) => {
			const parentDir = path.dirname(process.cwd());
			writeDirectoryBindings({ [parentDir]: "parent-profile" });
			expect(getProfileForDirectory(process.cwd())).toBe("parent-profile");
		});

		it("should return undefined when no ancestor matches", ({ expect }) => {
			writeDirectoryBindings({ "/some/other/path": "work" });
			expect(getProfileForDirectory(process.cwd())).toBeUndefined();
		});

		it("should prefer the nearest ancestor binding", ({ expect }) => {
			const dir = process.cwd();
			const parentDir = path.dirname(dir);
			writeDirectoryBindings({
				[parentDir]: "parent-profile",
				[dir]: "child-profile",
			});
			expect(getProfileForDirectory(dir)).toBe("child-profile");
		});

		it("should read and write bindings correctly", ({ expect }) => {
			expect(readDirectoryBindings()).toEqual({});
			writeDirectoryBindings({ "/foo": "bar", "/baz": "qux" });
			expect(readDirectoryBindings()).toEqual({ "/foo": "bar", "/baz": "qux" });
		});
	});

	describe("setActiveProfile", () => {
		it("should write active.json", ({ expect }) => {
			setActiveProfile("work");
			const filePath = path.join(
				getGlobalWranglerConfigPath(),
				"config",
				"active.json"
			);
			const content = JSON.parse(readFileSync(filePath)) as {
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
			expect(() => deleteProfile("nonexistent")).toThrow("does not exist");
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

		it("should reset active.json when deleting active profile", ({
			expect,
		}) => {
			writeAuthConfigFile(
				{
					oauth_token: "token",
					refresh_token: "refresh",
					expiration_time: "2030-01-01T00:00:00Z",
				},
				"work"
			);
			setActiveProfile("work");
			expect(getActiveProfile()).toBe("work");

			deleteProfile("work");
			expect(getActiveProfile()).toBe("default");
		});

		it("should remove directory bindings for the deleted profile", ({
			expect,
		}) => {
			writeAuthConfigFile(
				{
					oauth_token: "token",
					refresh_token: "refresh",
					expiration_time: "2030-01-01T00:00:00Z",
				},
				"work"
			);
			writeDirectoryBindings({
				"/project-a": "work",
				"/project-b": "personal",
				"/project-c": "work",
			});

			deleteProfile("work");

			expect(readDirectoryBindings()).toEqual({
				"/project-b": "personal",
			});
		});
	});

	describe("staging environment", () => {
		it("profileExists should find staging profile in staging env", ({
			expect,
		}) => {
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

		it("profileExists should not find production profile in staging env", ({
			expect,
		}) => {
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

		it("listProfiles should list staging profiles by correct name", ({
			expect,
		}) => {
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

		it("listProfiles should not list production profiles in staging env", ({
			expect,
		}) => {
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

		it("deleteProfile should delete staging profile in staging env", ({
			expect,
		}) => {
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

		it("deleteProfile should not find production profile in staging env", ({
			expect,
		}) => {
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
			it("should list default profile when no others exist", async ({
				expect,
			}) => {
				await runWrangler("profile list");
				expect(std.out).toContain("default");
			});

			it("should show (active) marker", async ({ expect }) => {
				await runWrangler("profile list");
				expect(std.out).toContain("default (active)");
			});
		});

		describe("wrangler profile set", () => {
			it("should fail when profile doesn't exist", async ({ expect }) => {
				await expect(runWrangler("profile set nonexistent")).rejects.toThrow(
					/does not exist/
				);
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
				await runWrangler("profile set work");
				expect(std.out).toContain('Switched to profile "work"');
			});

			it("should bind a directory when --dir is provided", async ({
				expect,
			}) => {
				writeAuthConfigFile(
					{
						oauth_token: "token",
						refresh_token: "refresh",
						expiration_time: "2030-01-01T00:00:00Z",
					},
					"work"
				);
				const dir = process.cwd();
				await runWrangler(`profile set work --dir ${dir}`);
				expect(std.out).toContain("Bound directory");
				expect(std.out).toContain('"work"');
				expect(readDirectoryBindings()[dir]).toBe("work");
			});
		});

		describe("wrangler profile delete", () => {
			it("should fail when trying to delete default", async ({ expect }) => {
				await expect(runWrangler("profile delete default")).rejects.toThrow(
					/Cannot delete the default profile/
				);
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

		describe("wrangler profile unset", () => {
			it("should remove a directory binding", async ({ expect }) => {
				const dir = process.cwd();
				writeDirectoryBindings({ [dir]: "work" });
				await runWrangler(`profile unset --dir ${dir}`);
				expect(std.out).toContain("Removed profile binding");
				expect(readDirectoryBindings()[dir]).toBeUndefined();
			});

			it("should default to cwd when --dir is not provided", async ({
				expect,
			}) => {
				const dir = process.cwd();
				writeDirectoryBindings({ [dir]: "work" });
				await runWrangler("profile unset");
				expect(std.out).toContain("Removed profile binding");
				expect(readDirectoryBindings()[dir]).toBeUndefined();
			});

			it("should fail when no binding exists", async ({ expect }) => {
				await expect(runWrangler("profile unset")).rejects.toThrow(
					/No profile binding exists/
				);
			});
		});
	});

	describe("login with --profile", () => {
		const { mockOAuthServerCallback } = mockOAuthFlow();

		beforeEach(() => {
			msw.use(...mswSuccessUserHandlers);
		});

		it("should write auth config to the named profile", async ({ expect }) => {
			mockOAuthServerCallback("success");
			await runWrangler("login --profile work");

			const workConfig = readAuthConfigFile("work");
			expect(workConfig.oauth_token).toBe("test-access-token");
			expect(workConfig.refresh_token).toBe("test-refresh-token");

			// Default profile should not have been touched.
			expect(() => readAuthConfigFile("default")).toThrow();
		});

		it("should write auth config via profile create alias", async ({
			expect,
		}) => {
			mockOAuthServerCallback("success");
			await runWrangler("profile create work");

			const workConfig = readAuthConfigFile("work");
			expect(workConfig.oauth_token).toBe("test-access-token");
			expect(workConfig.refresh_token).toBe("test-refresh-token");

			// Default profile should not have been touched.
			expect(() => readAuthConfigFile("default")).toThrow();
		});

		it("should write auth config to default profile when no --profile is given", async ({
			expect,
		}) => {
			mockOAuthServerCallback("success");
			await runWrangler("login");

			const config = readAuthConfigFile();
			expect(config.oauth_token).toBe("test-access-token");
			expect(config.refresh_token).toBe("test-refresh-token");
		});
	});
});
