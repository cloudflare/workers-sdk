import path from "node:path";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, it, vi } from "vitest";
import {
	getAuthConfigFilePath,
	readAuthConfigFile,
	writeAuthConfigFile,
} from "../user";
import {
	getActiveProfileName,
	getProfileForDirectory,
	profileExists,
	readDirectoryBindings,
	setActiveProfile,
	validateProfileName,
	writeDirectoryBindings,
} from "../user/profiles";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { mockOAuthFlow } from "./helpers/mock-oauth-flow";
import { msw, mswSuccessOauthHandlers } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("Profile", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();
	const { mockOAuthServerCallback } = mockOAuthFlow();

	beforeEach(() => {
		msw.use(...mswSuccessOauthHandlers);
		setIsTTY(true);
	});

	describe("validateProfileName", () => {
		it("should accept valid profile names", ({ expect }) => {
			expect(() => validateProfileName("work")).not.toThrow();
			expect(() => validateProfileName("my-company")).not.toThrow();
			expect(() => validateProfileName("profile_1")).not.toThrow();
			expect(() => validateProfileName("Test123")).not.toThrow();
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

	describe("getActiveProfileName", () => {
		it("should return default when nothing is configured", ({ expect }) => {
			expect(getActiveProfileName()).toBe("default");
		});

		it("should respect WRANGLER_PROFILE env var", ({ expect }) => {
			vi.stubEnv("WRANGLER_PROFILE", "work");
			expect(getActiveProfileName()).toBe("work");
			vi.unstubAllEnvs();
		});

		it("should respect active.json active_profile", ({ expect }) => {
			setActiveProfile("work");
			expect(getActiveProfileName()).toBe("work");
		});

		it("should prioritize WRANGLER_PROFILE over directory binding", ({
			expect,
		}) => {
			const dir = process.cwd();
			writeDirectoryBindings({ [dir]: "dir-profile" });
			vi.stubEnv("WRANGLER_PROFILE", "env-profile");
			expect(getActiveProfileName()).toBe("env-profile");
			vi.unstubAllEnvs();
		});

		it("should prioritize directory binding over active.json", ({ expect }) => {
			setActiveProfile("active-profile");
			const dir = process.cwd();
			writeDirectoryBindings({ [dir]: "dir-profile" });
			expect(getActiveProfileName()).toBe("dir-profile");
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

	});

	describe("CLI commands", () => {
		describe("wrangler profiles list", () => {
			it("should show active marker on the correct profile", async ({
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
				await runWrangler("profiles list");
				await runWrangler("profiles set work");

				await runWrangler("profiles list");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					work



					 ⛅️ wrangler x.x.x
					──────────────────
					✨ Switched to profile "work".


					 ⛅️ wrangler x.x.x
					──────────────────
					work (active)

					"
				`);
			});

			it("should show bound directories", async ({ expect }) => {
				writeAuthConfigFile(
					{
						oauth_token: "token",
						refresh_token: "refresh",
						expiration_time: "2030-01-01T00:00:00Z",
					},
					"work"
				);
				writeDirectoryBindings({
					"/projects/app": "work",
					"/projects/api": "work",
				});
				await runWrangler("profiles list");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					work
					  - /projects/app
					  - /projects/api

					"
				`);
			});
		});

		describe("wrangler profiles set", () => {
			it("should fail when profile doesn't exist", async ({ expect }) => {
				await expect(runWrangler("profiles set nonexistent")).rejects.toThrow(
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
				await runWrangler("profiles set work");
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
				await runWrangler(`profiles set work --dir ${dir}`);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					✨ Bound directory "<cwd>" to profile "work".
					"
				`);
				expect(readDirectoryBindings()[dir]).toBe("work");
			});
		});

		describe("wrangler profiles create", () => {
			it("should create a profile and log in via OAuth", async ({ expect }) => {
				mockOAuthServerCallback("success");
				msw.use(
					http.post(
						"*/oauth2/token",
						async () => {
							return HttpResponse.json({
								access_token: "test-access-token",
								expires_in: 100000,
								refresh_token: "test-refresh-token",
								scope: "account:read",
							});
						},
						{ once: true }
					)
				);
				mockConfirm({
					text: 'Do you want to set "work" as the active profile?',
					result: false,
				});

				await runWrangler("profiles create work");

				expect(std.out).toContain("Successfully logged in.");
				expect(std.out).toContain('Successfully created profile "work".');
				expect(profileExists("work")).toBe(true);
				expect(readAuthConfigFile("work")).toEqual({
					oauth_token: "test-access-token",
					refresh_token: "test-refresh-token",
					expiration_time: expect.any(String),
					scopes: ["account:read"],
				});
			});

			it("should reject creating a profile with a reserved name", async ({
				expect,
			}) => {
				await expect(runWrangler("profiles create default")).rejects.toThrow(
					"reserved"
				);
			});

			it("should reject creating a profile with invalid characters", async ({
				expect,
			}) => {
				await expect(
					runWrangler("profiles create 'my profile'")
				).rejects.toThrow("Only letters, numbers, hyphens, and underscores");
			});

			it("should reject creating a profile that already exists", async ({
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

				await expect(runWrangler("profiles create work")).rejects.toThrow(
					'Profile "work" already exists'
				);
			});

			it("should set profile as active when user confirms", async ({
				expect,
			}) => {
				mockOAuthServerCallback("success");
				msw.use(
					http.post(
						"*/oauth2/token",
						async () => {
							return HttpResponse.json({
								access_token: "test-access-token",
								expires_in: 100000,
								refresh_token: "test-refresh-token",
								scope: "account:read",
							});
						},
						{ once: true }
					)
				);
				mockConfirm({
					text: 'Do you want to set "work" as the active profile?',
					result: true,
				});

				await runWrangler("profiles create work");

				expect(getActiveProfileName()).toBe("work");
				expect(std.out).toContain('Switched to profile "work".');
			});
		});

		describe("wrangler profiles delete", () => {
			it("should throw when trying to delete default", async ({ expect }) => {
				await expect(runWrangler("profiles delete default")).rejects.toThrow(
					"Cannot delete the default profile"
				);
			});

			it("should throw when profile doesn't exist", async ({ expect }) => {
				await expect(
					runWrangler("profiles delete nonexistent")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Profile "nonexistent" does not exist.]`
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

				writeDirectoryBindings({
					"/project-a": "work",
				});
				await runWrangler("profiles list");
				await runWrangler("profiles delete work");
				await runWrangler("profiles list");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					work
					  - /project-a



					 ⛅️ wrangler x.x.x
					──────────────────
					✅ Deleted profile "work".


					 ⛅️ wrangler x.x.x
					──────────────────
					No profiles found. You can create a profile by running \`wrangler profiles create <profile name>\`.


					"
				`);
				expect(readDirectoryBindings()).toEqual({});
			});
		});

		describe("wrangler profiles unset", () => {
			it("should reset the active profile to default", async ({ expect }) => {
				writeAuthConfigFile(
					{
						oauth_token: "token",
						refresh_token: "refresh",
						expiration_time: "2030-01-01T00:00:00Z",
					},
					"work"
				);
				setActiveProfile("work");
				expect(getActiveProfileName()).toBe("work");

				await runWrangler("profiles unset");

				expect(getActiveProfileName()).toBe("default");
				expect(std.out).toContain(
					'Switched from profile "work" back to the default profile.'
				);
			});

			it("should report when already using the default profile", async ({
				expect,
			}) => {
				await runWrangler("profiles unset");
				expect(std.out).toContain("Already using the default profile.");
			});

			it("should remove a directory binding when --dir is provided", async ({
				expect,
			}) => {
				const dir = process.cwd();
				writeDirectoryBindings({ [dir]: "work" });
				await runWrangler(`profiles unset --dir`);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					✅ Unset profile for directory "<cwd>".
					"
				`);
				expect(readDirectoryBindings()[dir]).toBeUndefined();
			});

			it("should fail when no directory binding exists for --dir", async ({
				expect,
			}) => {
				await expect(
					runWrangler(`profiles unset --dir`)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: No profile is set for directory "<cwd>". Run \`wrangler profiles list\` to see existing profiles and their associated directories.]`
				);
			});
		});
	});
});
