import { writeFile } from "node:fs/promises";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, describe, it, test } from "vitest";
import { mockAccountId, mockApiToken } from "../../helpers/mock-account-id";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { clearDialogs, mockConfirm } from "../../helpers/mock-dialogs";
import { useMockIsTTY } from "../../helpers/mock-istty";
import { runInTempDir } from "../../helpers/run-in-tmp";
import { runWrangler } from "../../helpers/run-wrangler";
import { mockGetVersion, mockPostVersion, mockSetupApiCalls } from "./utils";
import type { VersionDetails } from "../../../versions/secrets";
import type { CfPlacement } from "@cloudflare/workers-utils";

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

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mMultiple environments are defined in the Wrangler configuration file, but no target environment was specified for the versions secret delete command.[0m

				  To avoid unintentional changes to the wrong environment, it is recommended to explicitly specify
				  the target environment using the \`-e|--env\` flag.
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
	});

	describe("placement", () => {
		function buildVersionInfo(placement: CfPlacement): VersionDetails {
			return {
				id: "ce15c78b-cc43-4f60-b5a9-15ce4f298c2a",
				metadata: {} as VersionDetails["metadata"],
				number: 2,
				resources: {
					bindings: [
						{ type: "secret_text", name: "SECRET", text: "Secret shhh" },
					],
					script: {
						etag: "etag",
						handlers: ["fetch"],
						last_deployed_from: "api",
						placement,
					},
					script_runtime: {
						usage_model: "standard",
						limits: {},
					},
				},
			};
		}

		// `versions secret delete` fetches the version twice (once directly, once
		// inside copyWorkerVersionWithNewSecrets), so register the override twice.
		function mockGetVersionTwice(
			expect: Parameters<typeof mockGetVersion>[0],
			versionInfo: VersionDetails
		) {
			mockGetVersion(expect, versionInfo);
			mockGetVersion(expect, versionInfo);
		}

		test("preserves smart placement on the new version", async ({ expect }) => {
			setIsTTY(false);
			const placement: CfPlacement = { mode: "smart" };
			mockSetupApiCalls(expect);
			mockGetVersionTwice(expect, buildVersionInfo(placement));
			mockPostVersion(expect, (metadata) => {
				expect(metadata.placement).toStrictEqual(placement);
			});
			await runWrangler("versions secret delete SECRET --name script-name");
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		test("preserves targeted placement with service targets on the new version", async ({
			expect,
		}) => {
			setIsTTY(false);
			const placement = {
				mode: "targeted",
				target: [{ hostname: "example.com", id: 410, type: "http" }],
			} as unknown as CfPlacement;
			mockSetupApiCalls(expect);
			mockGetVersionTwice(expect, buildVersionInfo(placement));
			mockPostVersion(expect, (metadata) => {
				expect(metadata.placement).toStrictEqual(placement);
			});
			await runWrangler("versions secret delete SECRET --name script-name");
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		test("preserves targeted placement with region targets on the new version", async ({
			expect,
		}) => {
			setIsTTY(false);
			const placement = {
				mode: "targeted",
				target: [{ id: 12, region: "aws:ap-northeast-1", type: "region" }],
			} as unknown as CfPlacement;
			mockSetupApiCalls(expect);
			mockGetVersionTwice(expect, buildVersionInfo(placement));
			mockPostVersion(expect, (metadata) => {
				expect(metadata.placement).toStrictEqual(placement);
			});
			await runWrangler("versions secret delete SECRET --name script-name");
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		test("omits placement when the existing version has none", async ({
			expect,
		}) => {
			setIsTTY(false);
			mockSetupApiCalls(expect);
			mockGetVersion(expect);
			mockPostVersion(expect, (metadata) => {
				expect(metadata.placement).toBeUndefined();
			});
			await runWrangler("versions secret delete SECRET --name script-name");
			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});
});
