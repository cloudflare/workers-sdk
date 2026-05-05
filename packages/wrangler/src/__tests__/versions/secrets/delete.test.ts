import { writeFile } from "node:fs/promises";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, describe, it, test, vi } from "vitest";
import { multiEnvWarning } from "../../helpers/multi-env-warning";
import { mockAccountId, mockApiToken } from "../../helpers/mock-account-id";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { clearDialogs, mockConfirm } from "../../helpers/mock-dialogs";
import { useMockIsTTY } from "../../helpers/mock-istty";
import { runInTempDir } from "../../helpers/run-in-tmp";
import { runWrangler } from "../../helpers/run-wrangler";
import { mockGetVersion, mockPostVersion, mockSetupApiCalls } from "./utils";

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

		mockSetupApiCalls(expect);
		mockGetVersion(expect);
		mockPostVersion(expect, (metadata) => {
			// We should have all secrets except the one being deleted
			expect(metadata.bindings).toStrictEqual([
				{ type: "inherit", name: "do-binding" },
				{ type: "inherit", name: "ANOTHER_SECRET" },
				{ type: "inherit", name: "YET_ANOTHER_SECRET" },
			]);
			// We will not be inherting secret_text as that would bring back SECRET
			expect(metadata.keep_bindings).toStrictEqual(["secret_key"]);
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

		mockSetupApiCalls(expect);
		mockGetVersion(expect);
		mockPostVersion(expect, (metadata) => {
			expect(metadata.bindings).toStrictEqual([
				{ type: "inherit", name: "do-binding" },
				{ type: "inherit", name: "ANOTHER_SECRET" },
				{ type: "inherit", name: "YET_ANOTHER_SECRET" },
			]);
			// We will not be inherting secret_text as that would bring back SECRET
			expect(metadata.keep_bindings).toStrictEqual(["secret_key"]);
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

		mockSetupApiCalls(expect);
		mockGetVersion(expect);
		mockPostVersion(expect, (metadata) => {
			expect(metadata.bindings).toStrictEqual([
				{ type: "inherit", name: "do-binding" },
				{ type: "inherit", name: "ANOTHER_SECRET" },
				{ type: "inherit", name: "YET_ANOTHER_SECRET" },
			]);
			// We will not be inherting secret_text as that would bring back SECRET
			expect(metadata.keep_bindings).toStrictEqual(["secret_key"]);
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

		mockSetupApiCalls(expect);
		mockGetVersion(expect);
		mockPostVersion(expect);

		await runWrangler("versions secret delete SECRET --name script-name");

		expect(std.warn).toMatchInlineSnapshot(`""`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	describe("multi-env warning", () => {
		it("should warn if the wrangler config contains environments but none was specified in the command", async ({
			expect,
		}) => {
			setIsTTY(false);

			writeWranglerConfig({
				env: { test: {} },
			});
			mockSetupApiCalls(expect);
			mockGetVersion(expect);
			mockPostVersion(expect);

			await runWrangler("versions secret delete SECRET --name script-name");

			expect(std.warn).toMatchInlineSnapshot(multiEnvWarning("versions secret delete"));
		});

		it("should not warn if the wrangler config contains environments and one was specified in the command", async ({
			expect,
		}) => {
			setIsTTY(false);

			writeWranglerConfig({
				env: { test: {} },
			});
			mockSetupApiCalls(expect);
			mockGetVersion(expect);
			mockPostVersion(expect);

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
			mockSetupApiCalls(expect);
			mockGetVersion(expect);
			mockPostVersion(expect);

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
			mockSetupApiCalls(expect);
			mockGetVersion(expect);
			mockPostVersion(expect);

			await runWrangler("versions secret delete SECRET --name script-name");

			expect(std.warn).toMatchInlineSnapshot(`""`);
		});
	});
});
