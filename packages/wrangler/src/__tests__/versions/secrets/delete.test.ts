import { writeFile } from "node:fs/promises";
import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { afterEach, describe, it, test, vi } from "vitest";
import { mockAccountId, mockApiToken } from "../../helpers/mock-account-id";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { clearDialogs, mockConfirm } from "../../helpers/mock-dialogs";
import { useMockIsTTY } from "../../helpers/mock-istty";
import { runWrangler } from "../../helpers/run-wrangler";
import {
	expectSecretPatch,
	mockPatchLatestVersion,
	mockPatchLatestVersionNoVersions,
} from "./utils";

describe("versions secret delete", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();
	runInTempDir();
	mockAccountId();
	mockApiToken();
	afterEach(() => {
		clearDialogs();
	});

	test("can delete a new secret (interactive)", async ({ expect }) => {
		setIsTTY(true);

		mockConfirm({
			text: "Are you sure you want to permanently delete the secret SECRET on the Worker script-name?",
			result: true,
		});

		mockPatchLatestVersion(expect, (patch) => {
			expectSecretPatch(expect, patch, { SECRET: null });
		});
		await runWrangler("versions secret delete SECRET --name script-name");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🌀 Deleting the secret SECRET on the Worker script-name
			✨ Success! Created version id with deleted secret SECRET.
			➡️  To deploy this version without the secret SECRET to production traffic use the command "wrangler versions deploy"."
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("can delete a secret (non-interactive)", async ({ expect }) => {
		setIsTTY(false);

		mockPatchLatestVersion(expect, (patch) => {
			expectSecretPatch(expect, patch, { SECRET: null });
		});

		await runWrangler("versions secret delete SECRET --name script-name");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			? Are you sure you want to permanently delete the secret SECRET on the Worker script-name?
			🤖 Using fallback value in non-interactive context: yes
			🌀 Deleting the secret SECRET on the Worker script-name
			✨ Success! Created version id with deleted secret SECRET.
			➡️  To deploy this version without the secret SECRET to production traffic use the command "wrangler versions deploy"."
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("can delete a secret reading Worker name from wrangler.toml", async ({
		expect,
	}) => {
		writeWranglerConfig({ name: "script-name" });
		setIsTTY(false);

		mockPatchLatestVersion(expect, (patch) => {
			expectSecretPatch(expect, patch, { SECRET: null });
		});

		await runWrangler("versions secret delete SECRET");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			? Are you sure you want to permanently delete the secret SECRET on the Worker script-name?
			🤖 Using fallback value in non-interactive context: yes
			🌀 Deleting the secret SECRET on the Worker script-name
			✨ Success! Created version id with deleted secret SECRET.
			➡️  To deploy this version without the secret SECRET to production traffic use the command "wrangler versions deploy"."
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("no wrangler configuration warnings shown", async ({ expect }) => {
		await writeFile("wrangler.json", JSON.stringify({ invalid_field: true }));
		setIsTTY(false);

		mockPatchLatestVersion(expect, (patch) => {
			expectSecretPatch(expect, patch, { SECRET: null });
		});

		await runWrangler("versions secret delete SECRET --name script-name");

		expect(std.warn).toMatchInlineSnapshot(`""`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("shows a nice error message when the Worker has no versions", async ({
		expect,
	}) => {
		setIsTTY(false);
		mockPatchLatestVersionNoVersions(expect);

		await expect(
			runWrangler("versions secret delete SECRET --name script-name")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: There are currently no uploaded versions of this Worker. Please upload a version before modifying a secret.]`
		);
	});

	describe("multi-env warning", () => {
		it("should warn if the wrangler config contains environments but none was specified in the command", async ({
			expect,
		}) => {
			setIsTTY(false);

			writeWranglerConfig({
				env: { test: {} },
			});
			mockPatchLatestVersion(expect, (patch) => {
				expectSecretPatch(expect, patch, { SECRET: null });
			});

			await runWrangler("versions secret delete SECRET --name script-name");

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mMultiple environments are defined in the Wrangler configuration file, but no target environment was specified for the versions secret delete command.[0m

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
			setIsTTY(false);

			writeWranglerConfig({
				env: { test: {} },
			});
			mockPatchLatestVersion(expect, (patch) => {
				expectSecretPatch(expect, patch, { SECRET: null });
			});

			await runWrangler(
				"versions secret delete SECRET --name script-name -e test"
			);

			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should not warn if the wrangler config doesn't contain environments and none was specified in the command", async ({
			expect,
		}) => {
			setIsTTY(false);

			writeWranglerConfig();
			mockPatchLatestVersion(expect, (patch) => {
				expectSecretPatch(expect, patch, { SECRET: null });
			});

			await runWrangler("versions secret delete SECRET --name script-name");

			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should not warn if the wrangler config contains environments and CLOUDFLARE_ENV is set", async ({
			expect,
		}) => {
			vi.stubEnv("CLOUDFLARE_ENV", "test");
			setIsTTY(false);

			writeWranglerConfig({
				env: { test: {} },
			});
			mockPatchLatestVersion(expect, (patch) => {
				expectSecretPatch(expect, patch, { SECRET: null });
			});

			await runWrangler("versions secret delete SECRET --name script-name");

			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it('should not warn if --env="" is passed to explicitly target the top-level environment', async ({
			expect,
		}) => {
			setIsTTY(false);

			writeWranglerConfig({
				env: { test: {} },
			});
			mockPatchLatestVersion(expect, (patch) => {
				expectSecretPatch(expect, patch, { SECRET: null });
			});

			await runWrangler(
				'versions secret delete SECRET --name script-name --env=""'
			);

			expect(std.warn).toMatchInlineSnapshot(`""`);
		});
	});
});
