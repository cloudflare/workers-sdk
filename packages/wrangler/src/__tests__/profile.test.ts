import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
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
	validateProfileName,
	writeDirectoryBindings,
} from "../user/profiles";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { mockOAuthFlow } from "./helpers/mock-oauth-flow";
import {
	msw,
	mswSuccessOauthHandlers,
	mswSuccessUserHandlers,
} from "./helpers/msw";
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
		it("should validate profile names", ({ expect }) => {
			expect(() => validateProfileName("work-Name_1")).not.toThrow();
			const longName = "a".repeat(65);
			expect(() => validateProfileName(longName)).toThrow(
				"at most 64 characters"
			);
		});
	});

	describe("getAuthConfigFilePath", () => {
		it("should return default.toml when no profile is active", ({ expect }) => {
			const filePath = getAuthConfigFilePath();
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

	describe("getActiveProfileName", () => {
		it("should return undefined when nothing is configured", ({ expect }) => {
			expect(getActiveProfileName()).toBeUndefined();
		});

		it("should respect WRANGLER_PROFILE env var", ({ expect }) => {
			vi.stubEnv("WRANGLER_PROFILE", "work");
			expect(getActiveProfileName()).toBe("work");
			vi.unstubAllEnvs();
		});

		it("should return directory binding when set", ({ expect }) => {
			const dir = process.cwd();
			writeDirectoryBindings({ [dir]: "dir-profile" });
			expect(getActiveProfileName()).toBe("dir-profile");
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

		it("should return undefined when only directory bindings for other paths exist", ({
			expect,
		}) => {
			writeDirectoryBindings({ "/some/other/path": "other-profile" });
			expect(getActiveProfileName()).toBeUndefined();
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
				const dir = process.cwd();
				writeDirectoryBindings({ [dir]: "work" });

				await runWrangler("profiles list");
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					work (active)
					  - <cwd>

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

		describe("wrangler login --profile", () => {
			it("should bind directory to existing profile", async ({ expect }) => {
				writeAuthConfigFile(
					{
						oauth_token: "token",
						refresh_token: "refresh",
						expiration_time: "2030-01-01T00:00:00Z",
					},
					"work"
				);
				const dir = process.cwd();
				await runWrangler(`login --profile=work`);
				expect(std.out).toContain('to profile "work"');
				expect(std.out).toContain("Bound directory");
				expect(readDirectoryBindings()[dir]).toBe("work");
			});

			it("should prompt to create profile if it doesn't exist and create on confirm", async ({
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
					text: 'Profile "work" does not exist. Would you like to create it?',
					result: true,
				});

				const dir = process.cwd();
				await runWrangler("login --profile=work");

				expect(std.out).toContain("Successfully logged in.");
				expect(std.out).toContain(
					'Created profile "work" and bound it to directory'
				);
				expect(profileExists("work")).toBe(true);
				expect(readDirectoryBindings()[dir]).toBe("work");
			});

			it("should not create profile if user declines", async ({ expect }) => {
				mockConfirm({
					text: 'Profile "work" does not exist. Would you like to create it?',
					result: false,
				});

				await runWrangler("login --profile=work");

				expect(std.out).toContain(
					"You can create the profile manually with `wrangler profiles create work`"
				);
				expect(profileExists("work")).toBe(false);
			});

			it("should bind a specific directory when --dir is provided", async ({
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
				const dir = "/custom/project/path";
				await runWrangler(`login --profile=work --dir=${dir}`);
				expect(std.out).toContain(`Bound directory "${dir}" to profile "work"`);
				expect(readDirectoryBindings()[dir]).toBe("work");
			});
		});

		describe("wrangler logout --profile", () => {
			it("should unbind directory from profile", async ({ expect }) => {
				writeAuthConfigFile(
					{
						oauth_token: "token",
						refresh_token: "refresh",
						expiration_time: "2030-01-01T00:00:00Z",
					},
					"work"
				);
				const dir = process.cwd();
				writeDirectoryBindings({ [dir]: "work" });

				mockConfirm({
					text: 'No other directories use profile "work". Would you like to delete it?',
					result: false,
				});

				await runWrangler("logout --profile=work");

				expect(std.out).toContain("Unbound directory");
				expect(std.out).toContain('from profile "work"');
				expect(readDirectoryBindings()[dir]).toBeUndefined();
			});

			it("should prompt to delete profile when no other directories use it", async ({
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
				writeDirectoryBindings({ [dir]: "work" });

				mockConfirm({
					text: 'No other directories use profile "work". Would you like to delete it?',
					result: true,
				});

				await runWrangler("logout --profile=work");

				expect(std.out).toContain(`Deleted profile "work"`);
				expect(profileExists("work")).toBe(false);
			});

			it("should not prompt to delete if other directories still use the profile", async ({
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
				writeDirectoryBindings({
					[dir]: "work",
					"/other/project": "work",
				});

				await runWrangler("logout --profile=work");

				expect(std.out).toContain("Unbound directory");
				expect(std.out).toContain('from profile "work"');
				expect(std.out).not.toContain("Would you like to delete it?");
				expect(profileExists("work")).toBe(true);
			});

			it("should fail if directory is bound to a different profile", async ({
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
				writeAuthConfigFile(
					{
						oauth_token: "token2",
						refresh_token: "refresh2",
						expiration_time: "2030-01-01T00:00:00Z",
					},
					"personal"
				);
				const dir = process.cwd();
				writeDirectoryBindings({ [dir]: "personal" });

				await expect(
					runWrangler("logout --profile=work")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Directory "<cwd>" is bound to profile "personal", not "work".]`
				);
			});

			it("should fail if directory is not bound to any profile", async ({
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

				await expect(
					runWrangler("logout --profile=work")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Directory "<cwd>" is not bound to any profile.]`
				);
			});

			it("should fail if parent directory is bound but not this directory", async ({
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
				const parentDir = path.dirname(process.cwd());
				writeDirectoryBindings({ [parentDir]: "work" });

				await expect(
					runWrangler("logout --profile=work")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Directory "<cwd>" is not bound to any profile, but a parent directory is bound to profile "work".
 Run "wrangler profiles list" to see all profiles and their bound directories.]`
				);
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

				await runWrangler("profiles create work");

				expect(std.out).toContain("Successfully logged in.");
				expect(std.out).toContain('Successfully created profile "work".');
				expect(std.out).toContain(
					"This profile is not active yet. Run `wrangler login --profile=work` to use it in this directory."
				);
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
				expect(std.out).toContain("work");
				expect(std.out).toContain("/project-a");
				expect(std.out).toContain('Deleted profile "work"');
				expect(std.out).toContain("No profiles found");
				expect(readDirectoryBindings()).toEqual({});
			});
		});

		describe("active profile in banner", () => {
			beforeEach(() => {
				msw.use(...mswSuccessUserHandlers);
			});

			it("should print the active profile under the banner", async ({
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
				writeDirectoryBindings({ [dir]: "work" });

				await runWrangler("whoami");

				expect(std.out).toContain("Using profile: work");
			});

			it("should not print the active profile with --json", async ({
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
				writeDirectoryBindings({ [dir]: "work" });

				await runWrangler("whoami --json");

				expect(std.out).not.toContain("Using profile");
				const output = JSON.parse(std.out);
				expect(output.loggedIn).toBe(true);
				expect(output.profile).toBe("work");
			});

			it("should not print profile line when using default profile", async ({
				expect,
			}) => {
				writeAuthConfigFile({
					oauth_token: "token",
					refresh_token: "refresh",
					expiration_time: "2030-01-01T00:00:00Z",
				});

				await runWrangler("whoami");

				expect(std.out).not.toContain("Using profile");
			});

			it("should fall back to default auth when no profile is active", async ({
				expect,
			}) => {
				// Create both default auth and a profile
				writeAuthConfigFile({
					oauth_token: "default-token",
					refresh_token: "default-refresh",
					expiration_time: "2030-01-01T00:00:00Z",
				});
				writeAuthConfigFile(
					{
						oauth_token: "profile-token",
						refresh_token: "profile-refresh",
						expiration_time: "2030-01-01T00:00:00Z",
					},
					"work"
				);
				// Bind the profile to a DIFFERENT directory, not the current one
				writeDirectoryBindings({ "/some/other/path": "work" });

				// Should use default auth since no profile is active for cwd
				await runWrangler("whoami");

				expect(std.out).not.toContain("Using profile");
				// The command succeeds, meaning it used the default auth
				expect(std.out).toContain("Account Name");
			});
		});
	});
});
