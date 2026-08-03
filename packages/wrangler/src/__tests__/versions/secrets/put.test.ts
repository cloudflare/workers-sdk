import { writeFile } from "node:fs/promises";
import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { afterEach, describe, it, test, vi } from "vitest";
import { mockAccountId, mockApiToken } from "../../helpers/mock-account-id";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { clearDialogs, mockPrompt } from "../../helpers/mock-dialogs";
import { useMockIsTTY } from "../../helpers/mock-istty";
import { useMockStdin } from "../../helpers/mock-stdin";
import { runWrangler } from "../../helpers/run-wrangler";
import {
	expectSecretPatch,
	mockPatchLatestVersion,
	mockPatchLatestVersionNoVersions,
} from "./utils";

describe("versions secret put", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();
	runInTempDir();
	mockAccountId();
	mockApiToken();
	afterEach(() => {
		clearDialogs();
	});

	test("can add a new secret (interactive)", async ({ expect }) => {
		setIsTTY(true);

		mockPrompt({
			text: "Enter a secret value:",
			options: { isSecret: true },
			result: "the-secret",
		});

		mockPatchLatestVersion(expect, (patch) => {
			expectSecretPatch(expect, patch, { NEW_SECRET: "the-secret" });
		});
		await runWrangler("versions secret put NEW_SECRET --name script-name");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🌀 Creating the secret for the Worker "script-name"
			✨ Success! Created version id with secret NEW_SECRET.
			➡️  To deploy this version with secret NEW_SECRET to production traffic use the command "wrangler versions deploy"."
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("no wrangler configuration warnings shown", async ({ expect }) => {
		await writeFile("wrangler.json", JSON.stringify({ invalid_field: true }));
		setIsTTY(true);

		mockPrompt({
			text: "Enter a secret value:",
			options: { isSecret: true },
			result: "the-secret",
		});

		mockPatchLatestVersion(expect, (patch) => {
			expectSecretPatch(expect, patch, { NEW_SECRET: "the-secret" });
		});
		await runWrangler("versions secret put NEW_SECRET --name script-name");
		expect(std.warn).toMatchInlineSnapshot(`""`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("shows a nice error message when the Worker has no versions", async ({
		expect,
	}) => {
		setIsTTY(true);

		mockPrompt({
			text: "Enter a secret value:",
			options: { isSecret: true },
			result: "the-secret",
		});

		mockPatchLatestVersionNoVersions(expect);

		await expect(
			runWrangler("versions secret put NEW_SECRET --name script-name")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: There are currently no uploaded versions of this Worker. Please upload a version before modifying a secret.]`
		);
	});

	describe("(non-interactive)", () => {
		const mockStdIn = useMockStdin({ isTTY: false });
		test("can add a new secret (non-interactive)", async ({ expect }) => {
			mockPatchLatestVersion(expect, (patch) => {
				expectSecretPatch(expect, patch, { NEW_SECRET: "the-secret" });
			});

			mockStdIn.send(
				`the`,
				`-`,
				`secret
			` // whitespace & newline being removed
			);
			await runWrangler("versions secret put NEW_SECRET --name script-name");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				🌀 Creating the secret for the Worker "script-name"
				✨ Success! Created version id with secret NEW_SECRET.
				➡️  To deploy this version with secret NEW_SECRET to production traffic use the command "wrangler versions deploy"."
			`);
			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});

	test("can add a new secret, read Worker name from wrangler.toml", async ({
		expect,
	}) => {
		writeWranglerConfig({ name: "script-name" });

		setIsTTY(true);

		mockPrompt({
			text: "Enter a secret value:",
			options: { isSecret: true },
			result: "the-secret",
		});

		mockPatchLatestVersion(expect, (patch) => {
			expectSecretPatch(expect, patch, { NEW_SECRET: "the-secret" });
		});
		await runWrangler("versions secret put NEW_SECRET");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🌀 Creating the secret for the Worker "script-name"
			✨ Success! Created version id with secret NEW_SECRET.
			➡️  To deploy this version with secret NEW_SECRET to production traffic use the command "wrangler versions deploy"."
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("can add a new secret with message", async ({ expect }) => {
		setIsTTY(true);

		mockPrompt({
			text: "Enter a secret value:",
			options: { isSecret: true },
			result: "the-secret",
		});

		mockPatchLatestVersion(expect, (patch) => {
			expectSecretPatch(expect, patch, { NEW_SECRET: "the-secret" });

			expect(patch.annotations).not.toBeUndefined();
			expect(
				(patch.annotations as Record<string, string>)["workers/message"]
			).toBe("Deploy a new secret");
		});
		await runWrangler(
			"versions secret put NEW_SECRET --name script-name --message 'Deploy a new secret'"
		);

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🌀 Creating the secret for the Worker "script-name"
			✨ Success! Created version id with secret NEW_SECRET.
			➡️  To deploy this version with secret NEW_SECRET to production traffic use the command "wrangler versions deploy"."
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("can add a new secret with message + tag", async ({ expect }) => {
		setIsTTY(true);

		mockPrompt({
			text: "Enter a secret value:",
			options: { isSecret: true },
			result: "the-secret",
		});

		mockPatchLatestVersion(expect, (patch) => {
			expectSecretPatch(expect, patch, { NEW_SECRET: "the-secret" });

			expect(patch.annotations).not.toBeUndefined();
			expect(
				(patch.annotations as Record<string, string>)["workers/message"]
			).toBe("Deploy a new secret");
			expect((patch.annotations as Record<string, string>)["workers/tag"]).toBe(
				"v1"
			);
		});
		await runWrangler(
			"versions secret put NEW_SECRET --name script-name --message 'Deploy a new secret' --tag v1"
		);

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🌀 Creating the secret for the Worker "script-name"
			✨ Success! Created version id with secret NEW_SECRET.
			➡️  To deploy this version with secret NEW_SECRET to production traffic use the command "wrangler versions deploy"."
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	describe("multi-env warning", () => {
		const mockStdIn = useMockStdin({ isTTY: false });

		it("should warn if the wrangler config contains environments but none was specified in the command", async ({
			expect,
		}) => {
			writeWranglerConfig({
				name: "script-name",
				env: { test: {} },
			});
			mockPatchLatestVersion(expect, (patch) => {
				expectSecretPatch(expect, patch, { NEW_SECRET: "the-secret" });
			});

			mockStdIn.send(
				`the`,
				`-`,
				`secret
			` // whitespace & newline being removed
			);
			await runWrangler("versions secret put NEW_SECRET");

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mMultiple environments are defined in the Wrangler configuration file, but no target environment was specified for the versions secret put command.[0m

				  To avoid unintentional changes to the wrong environment, it is recommended to explicitly specify
				  the target environment using the \`-e|--env\` flag or CLOUDFLARE_ENV env variable.
				  If your intention is to use the top-level environment of your configuration simply pass an empty
				  string to the flag to target such environment. For example \`--env=""\`.

				"
			`);
		});

		it("should not warn if the wrangler config contains environments and one was specified in the command", async ({
			expect,
		}) => {
			writeWranglerConfig({
				name: "script-name",
				env: { test: {} },
			});
			mockPatchLatestVersion(expect, (patch) => {
				expectSecretPatch(expect, patch, { NEW_SECRET: "the-secret" });
			});

			mockStdIn.send(
				`the`,
				`-`,
				`secret
			` // whitespace & newline being removed
			);
			await runWrangler("versions secret put NEW_SECRET -e test");

			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should not warn if the wrangler config doesn't contain environments and none was specified in the command", async ({
			expect,
		}) => {
			writeWranglerConfig({
				name: "script-name",
			});
			mockPatchLatestVersion(expect, (patch) => {
				expectSecretPatch(expect, patch, { NEW_SECRET: "the-secret" });
			});

			mockStdIn.send(
				`the`,
				`-`,
				`secret
			` // whitespace & newline being removed
			);
			await runWrangler("versions secret put NEW_SECRET");

			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should not warn if the wrangler config contains environments and CLOUDFLARE_ENV is set", async ({
			expect,
		}) => {
			vi.stubEnv("CLOUDFLARE_ENV", "test");
			writeWranglerConfig({
				name: "script-name",
				env: { test: {} },
			});
			mockPatchLatestVersion(expect, (patch) => {
				expectSecretPatch(expect, patch, { NEW_SECRET: "the-secret" });
			});

			mockStdIn.send(
				`the`,
				`-`,
				`secret
			` // whitespace & newline being removed
			);
			await runWrangler("versions secret put NEW_SECRET");

			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it('should not warn if --env="" is passed to explicitly target the top-level environment', async ({
			expect,
		}) => {
			writeWranglerConfig({
				name: "script-name",
				env: { test: {} },
			});
			mockPatchLatestVersion(expect, (patch) => {
				expectSecretPatch(expect, patch, { NEW_SECRET: "the-secret" });
			});

			mockStdIn.send(
				`the`,
				`-`,
				`secret
			` // whitespace & newline being removed
			);
			await runWrangler('versions secret put NEW_SECRET --env=""');

			expect(std.warn).toMatchInlineSnapshot(`""`);
		});
	});
});
