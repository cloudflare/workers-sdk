import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
	activateProfileForDirectory,
	getBindingsForProfile,
	getProfileForDirectory,
	profileExists,
	resolveProfile,
	validateProfileName,
} from "@cloudflare/workers-auth";
import { getGlobalWranglerConfigPath } from "@cloudflare/workers-utils";
import {
	normalizeString,
	runInTempDir,
} from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, it } from "vitest";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockOAuthFlow } from "./helpers/mock-oauth-flow";
import { msw, mswSuccessOauthHandlers } from "./helpers/msw";
import { runWrangler } from "./helpers/run-wrangler";

function configDir(): string {
	return getGlobalWranglerConfigPath();
}

function createProfileFile(name: string, token = `${name}-token`) {
	const profilesDir = path.join(configDir(), "config");
	mkdirSync(profilesDir, { recursive: true });
	const futureDate = new Date(Date.now() + 100000 * 1000).toISOString();
	writeFileSync(
		path.join(profilesDir, `${name}.toml`),
		`oauth_token = "${token}"\nrefresh_token = "test-refresh"\nexpiration_time = "${futureDate}"\n`
	);
}

function mockSuccessfulOAuth(
	mockOAuthServerCallback: (respondWith: "success") => void
) {
	mockOAuthServerCallback("success");
	msw.use(
		http.post(
			"*/oauth2/token",
			() =>
				HttpResponse.json({
					access_token: "test-access-token",
					expires_in: 100000,
					refresh_token: "test-refresh-token",
					scope: "account:read",
				}),
			{ once: true }
		)
	);
}

describe("Profiles", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const { mockOAuthServerCallback } = mockOAuthFlow();

	beforeEach(() => {
		msw.use(...mswSuccessOauthHandlers);
	});

	describe("validateProfileName", () => {
		it("rejects reserved names", ({ expect }) => {
			expect(() => validateProfileName("default")).toThrow(
				/reserved profile name/
			);
			expect(() => validateProfileName("staging")).toThrow(
				/reserved profile name/
			);
			expect(() => validateProfileName("Default")).toThrow(
				/reserved profile name/
			);
		});

		it("rejects names with invalid characters", ({ expect }) => {
			expect(() => validateProfileName("my profile")).toThrow(
				/may only contain/
			);
			expect(() => validateProfileName("my.profile")).toThrow(
				/may only contain/
			);
			expect(() => validateProfileName("my../profile")).toThrow(
				/may only contain/
			);
		});

		it("accepts valid profile names", ({ expect }) => {
			expect(() => validateProfileName("my-profile")).not.toThrow();
			expect(() => validateProfileName("my_profile")).not.toThrow();
			expect(() => validateProfileName("client1")).not.toThrow();
			expect(() => validateProfileName("WORK")).not.toThrow();
		});
	});

	describe("prefix matching", () => {
		it("most specific (longest) match wins", ({ expect }) => {
			const parentDir = path.resolve("/foo");
			const childDir = path.resolve("/foo/bar");
			activateProfileForDirectory(configDir(), "parent", parentDir);
			activateProfileForDirectory(configDir(), "child", childDir);

			expect(getProfileForDirectory(configDir(), childDir)).toBe("child");
			expect(
				getProfileForDirectory(configDir(), path.join(childDir, "sub"))
			).toBe("child");
			expect(
				getProfileForDirectory(configDir(), path.join(parentDir, "other"))
			).toBe("parent");
		});

		it("does not match at non-path boundary", ({ expect }) => {
			const dir = path.resolve("/foo/bar");
			activateProfileForDirectory(configDir(), "client-a", dir);
			expect(getProfileForDirectory(configDir(), dir + "baz")).toBeUndefined();
		});
	});

	describe("resolveProfile", () => {
		it("--profile flag takes priority over directory binding", ({ expect }) => {
			activateProfileForDirectory(configDir(), "dir-profile", process.cwd());
			expect(
				resolveProfile({
					configDir: configDir(),
					profile: "flag-profile",
					cwd: process.cwd(),
				})
			).toBe("flag-profile");
		});

		it("rejects invalid profile names from --profile flag", ({ expect }) => {
			expect(() =>
				resolveProfile({
					configDir: configDir(),
					profile: "../../../etc/passwd",
					cwd: process.cwd(),
				})
			).toThrow(/may only contain/);
			expect(() =>
				resolveProfile({
					configDir: configDir(),
					profile: "my profile",
					cwd: process.cwd(),
				})
			).toThrow(/may only contain/);
			expect(() =>
				resolveProfile({
					configDir: configDir(),
					profile: "default",
					cwd: process.cwd(),
				})
			).toThrow(/reserved profile name/);
		});
	});

	describe("wrangler auth create", () => {
		it("validates name", async ({ expect }) => {
			await expect(runWrangler("auth create default")).rejects.toThrow(
				/reserved profile name/
			);
		});

		it("errors without creating a profile when env credentials are set", async ({
			expect,
		}) => {
			await expect(
				runWrangler("auth create client-a", {
					CLOUDFLARE_API_TOKEN: "env-token",
				})
			).rejects.toThrow(
				'Cannot create auth profile "client-a" while CLOUDFLARE_API_TOKEN is set. Unset CLOUDFLARE_API_TOKEN and try again.'
			);

			expect(profileExists(configDir(), "client-a")).toBe(false);
		});

		it("creates a new profile via OAuth login", async ({ expect }) => {
			mockSuccessfulOAuth(mockOAuthServerCallback);

			await runWrangler("auth create client-a");

			expect(profileExists(configDir(), "client-a")).toBe(true);
			expect(normalizeString(std.out)).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Attempting to login via OAuth...
				Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20ai-search%3Awrite%20ai-search%3Arun%20websearch.run%20agent-memory%3Awrite%20queues%3Awrite%20pipelines%3Awrite%20secrets_store%3Awrite%20artifacts%3Awrite%20flagship%3Awrite%20containers%3Awrite%20cloudchamber%3Awrite%20connectivity%3Aadmin%20email_routing%3Awrite%20email_sending%3Awrite%20browser%3Awrite%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
				Successfully logged in.
				Profile "client-a" created.
				Run \`wrangler auth activate client-a\` to use this profile in a directory."
			`);
		});

		it("re-authenticates an existing profile", async ({ expect }) => {
			createProfileFile("client-a");
			mockSuccessfulOAuth(mockOAuthServerCallback);

			await runWrangler("auth create client-a");

			expect(normalizeString(std.out)).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Attempting to login via OAuth...
				Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20ai-search%3Awrite%20ai-search%3Arun%20websearch.run%20agent-memory%3Awrite%20queues%3Awrite%20pipelines%3Awrite%20secrets_store%3Awrite%20artifacts%3Awrite%20flagship%3Awrite%20containers%3Awrite%20cloudchamber%3Awrite%20connectivity%3Aadmin%20email_routing%3Awrite%20email_sending%3Awrite%20browser%3Awrite%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
				Successfully logged in.
				Profile "client-a" re-authenticated.
				Run \`wrangler auth activate client-a\` to use this profile in a directory."
			`);
		});
	});

	describe("wrangler auth delete", () => {
		it("validates name", async ({ expect }) => {
			await expect(runWrangler("auth delete default")).rejects.toThrow(
				/reserved profile name/
			);
		});

		it("errors when profile does not exist", async ({ expect }) => {
			await expect(runWrangler("auth delete nonexistent")).rejects.toThrow(
				/does not exist/
			);
		});

		it("errors without deleting a profile when env credentials are set", async ({
			expect,
		}) => {
			const dirA = path.resolve("/projects/client-a");
			createProfileFile("client-a");
			activateProfileForDirectory(configDir(), "client-a", dirA);

			await expect(
				runWrangler("auth delete client-a", {
					CLOUDFLARE_API_TOKEN: "env-token",
				})
			).rejects.toThrow(
				'Cannot delete auth profile "client-a" while CLOUDFLARE_API_TOKEN is set. Unset CLOUDFLARE_API_TOKEN and try again.'
			);

			expect(profileExists(configDir(), "client-a")).toBe(true);
			expect(getBindingsForProfile(configDir(), "client-a")).toEqual([dirA]);
		});

		it("deletes a profile and its directory bindings", async ({ expect }) => {
			const dirA = path.resolve("/projects/client-a");
			const dirAv2 = path.resolve("/projects/client-a-v2");
			createProfileFile("client-a");
			activateProfileForDirectory(configDir(), "client-a", dirA);
			activateProfileForDirectory(configDir(), "client-a", dirAv2);

			await runWrangler("auth delete client-a");

			expect(profileExists(configDir(), "client-a")).toBe(false);
			expect(getBindingsForProfile(configDir(), "client-a")).toHaveLength(0);
			const out = normalizeString(std.out);
			expect(out).toContain("Removed directory bindings:");
			expect(out).toContain(dirA);
			expect(out).toContain(dirAv2);
			expect(out).toContain("Successfully logged out.");
			expect(out).toContain('Profile "client-a" deleted.');
		});

		it("falls back to ancestor profile after deleting a child profile", async ({
			expect,
		}) => {
			const parentDir = path.resolve("projects");
			const childDir = path.join(parentDir, "app");
			mkdirSync(childDir, { recursive: true });

			createProfileFile("parent-profile");
			createProfileFile("child-profile");
			activateProfileForDirectory(configDir(), "parent-profile", parentDir);
			activateProfileForDirectory(configDir(), "child-profile", childDir);

			await runWrangler("auth delete child-profile");

			// From the child directory, the parent profile should now be active
			await runWrangler(`whoami --cwd ${childDir}`).catch(() => {});

			expect(std.out).toContain("Active profile: parent-profile");
		});
	});

	describe("wrangler auth activate", () => {
		it("errors when profile does not exist", async ({ expect }) => {
			await expect(runWrangler("auth activate nonexistent")).rejects.toThrow(
				/does not exist.*Run `wrangler auth create nonexistent` first/
			);
		});

		it("binds a profile to the current directory", async ({ expect }) => {
			createProfileFile("client-a");

			await runWrangler("auth activate client-a");

			expect(getProfileForDirectory(configDir(), process.cwd())).toBe(
				"client-a"
			);
			expect(normalizeString(std.out)).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Profile "client-a" activated for "<cwd>"."
			`);
		});

		it("binds a profile to a specified directory", async ({ expect }) => {
			const targetDir = path.resolve("/projects/client-a");
			createProfileFile("client-a");

			await runWrangler(`auth activate client-a ${targetDir}`);

			expect(getProfileForDirectory(configDir(), targetDir)).toBe("client-a");
			expect(normalizeString(std.out)).toContain(
				`Profile "client-a" activated for "${targetDir}".`
			);
		});
	});

	describe("wrangler auth deactivate", () => {
		it("errors when no binding exists for current directory", async ({
			expect,
		}) => {
			await expect(runWrangler("auth deactivate")).rejects.toThrow(
				/No profile is bound/
			);
		});

		it("errors when run from a subdirectory of a bound directory", async ({
			expect,
		}) => {
			const targetDir = path.resolve("/projects/client-a");
			createProfileFile("client-a");
			await runWrangler(`auth activate client-a ${targetDir}`);

			await expect(
				runWrangler(`auth deactivate ${path.resolve("/projects/client-a/sub")}`)
			).rejects.toThrow(/No profile is directly bound/);
		});

		it("deactivates a profile and falls back to default", async ({
			expect,
		}) => {
			createProfileFile("default");
			createProfileFile("client-a");
			await runWrangler("auth activate client-a");

			await runWrangler("auth deactivate");

			expect(
				getProfileForDirectory(configDir(), process.cwd())
			).toBeUndefined();
			expect(normalizeString(std.out)).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Profile "client-a" activated for "<cwd>".

				 ⛅️ wrangler x.x.x
				──────────────────
				Profile "client-a" deactivated from "<cwd>".
				This directory now uses the default profile."
			`);
		});

		it("shows no active profile when logged out globally", async ({
			expect,
		}) => {
			// No default profile exists — only the named profile
			createProfileFile("client-a");
			await runWrangler("auth activate client-a");

			await runWrangler("auth deactivate");

			expect(normalizeString(std.out)).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Profile "client-a" activated for "<cwd>".

				 ⛅️ wrangler x.x.x
				──────────────────
				Profile "client-a" deactivated from "<cwd>".
				No active profile for this directory. Run \`wrangler login\` to set up the default profile, or \`wrangler auth create <name>\` to create a named profile."
			`);
		});
	});

	describe("wrangler auth list", () => {
		it("shows message when no profiles exist", async ({ expect }) => {
			await runWrangler("auth list");
			expect(normalizeString(std.out)).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				No profiles found. Run \`wrangler login\` to get started."
			`);
		});

		it("lists profiles with bound directories", async ({ expect }) => {
			const targetDir = path.resolve("/projects/client-a");
			createProfileFile("default");
			createProfileFile("client-a");

			await runWrangler(`auth activate client-a --dir ${targetDir}`);

			await runWrangler("auth list");
			const out = normalizeString(std.out);
			expect(out).toContain("client-a");
			expect(out).toContain(targetDir);
			expect(out).toContain("default");
		});
	});

	describe("wrangler auth token", () => {
		it("outputs the token for the specified profile", async ({ expect }) => {
			createProfileFile("default");
			createProfileFile("client-a");

			await runWrangler("auth token --profile client-a");

			expect(std.out).toContain("client-a-token");
			expect(std.out).not.toContain("default-token");
		});

		it("outputs the default profile token when no --profile is specified", async ({
			expect,
		}) => {
			createProfileFile("default");
			createProfileFile("client-a");

			await runWrangler("auth token");

			expect(std.out).toContain("default-token");
			expect(std.out).not.toContain("client-a-token");
		});

		it("respects directory-bound profile for auth token", async ({
			expect,
		}) => {
			createProfileFile("default");
			createProfileFile("bound-profile");

			activateProfileForDirectory(configDir(), "bound-profile", process.cwd());

			await runWrangler("auth token");

			expect(std.out).toContain("bound-profile-token");
			expect(std.out).not.toContain("default-token");
		});

		it("--profile flag overrides directory binding", async ({ expect }) => {
			createProfileFile("bound-profile");
			createProfileFile("flag-profile");

			activateProfileForDirectory(configDir(), "bound-profile", process.cwd());

			await runWrangler("auth token --profile flag-profile");

			expect(std.out).toContain("flag-profile-token");
			expect(std.out).not.toContain("bound-profile-token");
		});
	});

	describe("banner profile resolution", () => {
		it("shows active profile in the banner for non-auth commands", async ({
			expect,
		}) => {
			createProfileFile("my-profile");
			await runWrangler("auth activate my-profile");

			// whoami prints the banner (with active profile) before failing on auth
			await runWrangler("whoami").catch(() => {});

			// expect(normalizeString(std.out)).toContain("Active profile: my-profile");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Profile "my-profile" activated for "<cwd>".

				 ⛅️ wrangler x.x.x
				──────────────────
				Active profile: my-profile
				Getting User settings...
				"
			`);
		});

		it("does not show active profile in the banner for auth commands", async ({
			expect,
		}) => {
			createProfileFile("my-profile");
			await runWrangler("auth activate my-profile");

			await runWrangler("auth list");

			expect(normalizeString(std.out)).not.toContain("Active profile:");
		});

		it("does not show active profile when env credentials override profiles", async ({
			expect,
		}) => {
			createProfileFile("my-profile");
			await runWrangler("auth activate my-profile");

			await runWrangler("whoami", {
				CLOUDFLARE_API_TOKEN: "env-token",
			}).catch(() => {});

			expect(normalizeString(std.out)).not.toContain(
				"Active profile: my-profile"
			);
		});

		it("resolves profile from --config directory", async ({ expect }) => {
			// Create a project directory with a wrangler config
			const projectDir = path.resolve("project-a");
			mkdirSync(projectDir, { recursive: true });
			writeFileSync(
				path.join(projectDir, "wrangler.json"),
				JSON.stringify({ name: "test" })
			);

			// Bind a profile to that project directory
			createProfileFile("project-profile");
			activateProfileForDirectory(configDir(), "project-profile", projectDir);

			// whoami with --config pointing to the project resolves the profile from the config's directory
			await runWrangler(
				`whoami --config ${path.join(projectDir, "wrangler.json")}`
			).catch(() => {});

			expect(std.out).toContain("Active profile: project-profile");
		});

		it("resolves profile from --cwd directory", async ({ expect }) => {
			// Create a subdirectory and bind a profile to it
			const subDir = path.resolve("workspace");
			mkdirSync(subDir, { recursive: true });

			createProfileFile("workspace-profile");
			activateProfileForDirectory(configDir(), "workspace-profile", subDir);

			// whoami with --cwd resolves the profile from that directory
			await runWrangler(`whoami --cwd ${subDir}`).catch(() => {});

			expect(std.out).toContain("Active profile: workspace-profile");
		});

		it("inherits profile from ancestor directory", async ({ expect }) => {
			// Bind a profile to a parent directory
			const parentDir = path.resolve("projects");
			const childDir = path.join(parentDir, "app", "src");
			mkdirSync(childDir, { recursive: true });

			createProfileFile("inherited-profile");
			activateProfileForDirectory(configDir(), "inherited-profile", parentDir);

			// whoami from a nested subdirectory inherits the parent's profile
			await runWrangler(`whoami --cwd ${childDir}`).catch(() => {});

			expect(std.out).toContain("Active profile: inherited-profile");
		});
	});
});
