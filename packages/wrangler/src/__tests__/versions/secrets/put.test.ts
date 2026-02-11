import { writeFile } from "node:fs/promises";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { FormData } from "undici";
/* eslint-disable workers-sdk/no-vitest-import-expect -- expect used in mockPostVersion callback */
import { afterEach, describe, expect, it, test } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { mockAccountId, mockApiToken } from "../../helpers/mock-account-id";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { clearDialogs, mockPrompt } from "../../helpers/mock-dialogs";
import { useMockIsTTY } from "../../helpers/mock-istty";
import { useMockStdin } from "../../helpers/mock-stdin";
import { msw } from "../../helpers/msw";
import { runInTempDir } from "../../helpers/run-in-tmp";
import { runWrangler } from "../../helpers/run-wrangler";
import { mockPostVersion, mockSetupApiCalls } from "./utils";

describe("versions secret put", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();
	runInTempDir();
	mockAccountId();
	mockApiToken();
	afterEach(() => {
		clearDialogs();
	});

	test("can add a new secret (interactive)", async () => {
		setIsTTY(true);

		mockPrompt({
			text: "Enter a secret value:",
			options: { isSecret: true },
			result: "the-secret",
		});

		mockSetupApiCalls();
		mockPostVersion((metadata) => {
			expect(metadata.bindings).toStrictEqual([
				{ type: "inherit", name: "do-binding" },
				{ type: "secret_text", name: "NEW_SECRET", text: "the-secret" },
			]);
			expect(metadata.keep_bindings).toStrictEqual([
				"secret_key",
				"secret_text",
			]);
			expect(metadata.keep_assets).toBeTruthy();
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

	test("unsafe metadata is provided", async () => {
		writeWranglerConfig({
			name: "script-name",
			unsafe: { metadata: { build_options: { stable_id: "foo/bar" } } },
		});

		setIsTTY(true);

		mockPrompt({
			text: "Enter a secret value:",
			options: { isSecret: true },
			result: "the-secret",
		});

		mockSetupApiCalls();
		mockPostVersion((metadata) => {
			expect(metadata["build_options"]).toStrictEqual({ stable_id: "foo/bar" });
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

	test("unsafe metadata not included if not in wrangler.toml", async () => {
		writeWranglerConfig({
			name: "script-name",
		});

		setIsTTY(true);

		mockPrompt({
			text: "Enter a secret value:",
			options: { isSecret: true },
			result: "the-secret",
		});

		mockSetupApiCalls();
		mockPostVersion((metadata) => {
			expect(metadata.bindings).toStrictEqual([
				{ type: "inherit", name: "do-binding" },
				{ type: "secret_text", name: "NEW_SECRET", text: "the-secret" },
			]);
			expect(metadata.keep_bindings).toStrictEqual([
				"secret_key",
				"secret_text",
			]);
			expect(metadata["build_options"]).toBeUndefined();
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

	test("no wrangler configuration warnings shown", async () => {
		await writeFile("wrangler.json", JSON.stringify({ invalid_field: true }));
		setIsTTY(true);

		mockPrompt({
			text: "Enter a secret value:",
			options: { isSecret: true },
			result: "the-secret",
		});

		mockSetupApiCalls();
		mockPostVersion();
		await runWrangler("versions secret put NEW_SECRET --name script-name");
		expect(std.warn).toMatchInlineSnapshot(`""`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	describe("(non-interactive)", () => {
		const mockStdIn = useMockStdin({ isTTY: false });
		test("can add a new secret (non-interactive)", async () => {
			mockSetupApiCalls();
			mockPostVersion((metadata) => {
				expect(metadata.bindings).toStrictEqual([
					{ type: "inherit", name: "do-binding" },
					{ type: "secret_text", name: "NEW_SECRET", text: "the-secret" },
				]);
				expect(metadata.keep_bindings).toStrictEqual([
					"secret_key",
					"secret_text",
				]);
				expect(metadata.keep_assets).toBeTruthy();
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

	test("can add a new secret, read Worker name from wrangler.toml", async () => {
		writeWranglerConfig({ name: "script-name" });

		setIsTTY(true);

		mockPrompt({
			text: "Enter a secret value:",
			options: { isSecret: true },
			result: "the-secret",
		});

		mockSetupApiCalls();
		mockPostVersion((metadata) => {
			expect(metadata.bindings).toStrictEqual([
				{ type: "inherit", name: "do-binding" },
				{ type: "secret_text", name: "NEW_SECRET", text: "the-secret" },
			]);
			expect(metadata.keep_bindings).toStrictEqual([
				"secret_key",
				"secret_text",
			]);
			expect(metadata.keep_assets).toBeTruthy();
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

	test("can add a new secret with message", async () => {
		setIsTTY(true);

		mockPrompt({
			text: "Enter a secret value:",
			options: { isSecret: true },
			result: "the-secret",
		});

		mockSetupApiCalls();
		mockPostVersion((metadata) => {
			expect(metadata.bindings).toStrictEqual([
				{ type: "inherit", name: "do-binding" },
				{ type: "secret_text", name: "NEW_SECRET", text: "the-secret" },
			]);
			expect(metadata.keep_bindings).toStrictEqual([
				"secret_key",
				"secret_text",
			]);
			expect(metadata.keep_assets).toBeTruthy();

			expect(metadata.annotations).not.toBeUndefined();
			expect(
				(metadata.annotations as Record<string, string>)["workers/message"]
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

	test("can add a new secret with message + tag", async () => {
		setIsTTY(true);

		mockPrompt({
			text: "Enter a secret value:",
			options: { isSecret: true },
			result: "the-secret",
		});

		mockSetupApiCalls();
		mockPostVersion((metadata) => {
			expect(metadata.bindings).toStrictEqual([
				{ type: "inherit", name: "do-binding" },
				{ type: "secret_text", name: "NEW_SECRET", text: "the-secret" },
			]);
			expect(metadata.keep_bindings).toStrictEqual([
				"secret_key",
				"secret_text",
			]);
			expect(metadata.keep_assets).toBeTruthy();

			expect(metadata.annotations).not.toBeUndefined();
			expect(
				(metadata.annotations as Record<string, string>)["workers/message"]
			).toBe("Deploy a new secret");
			expect(
				(metadata.annotations as Record<string, string>)["workers/tag"]
			).toBe("v1");
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

	test("all non-secret bindings are inherited", async () => {
		setIsTTY(true);

		mockSetupApiCalls();

		mockPrompt({
			text: "Enter a secret value:",
			options: { isSecret: true },
			result: "the-secret",
		});

		mockPostVersion((metadata) => {
			expect(metadata.bindings).toStrictEqual([
				{ type: "inherit", name: "do-binding" },
				{ type: "secret_text", name: "SECRET", text: "the-secret" },
			]);
			expect(metadata.keep_bindings).toStrictEqual([
				"secret_key",
				"secret_text",
			]);
			expect(metadata.annotations).not.toBeUndefined();
		});
		await runWrangler("versions secret put SECRET --name script-name");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🌀 Creating the secret for the Worker "script-name"
			✨ Success! Created version id with secret SECRET.
			➡️  To deploy this version with secret SECRET to production traffic use the command "wrangler versions deploy"."
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("can update an existing secret", async () => {
		setIsTTY(true);

		mockPrompt({
			text: "Enter a secret value:",
			options: { isSecret: true },
			result: "the-secret",
		});

		mockSetupApiCalls();
		mockPostVersion((metadata) => {
			expect(metadata.bindings).toStrictEqual([
				{ type: "inherit", name: "do-binding" },
				{ type: "secret_text", name: "SECRET", text: "the-secret" },
			]);
			expect(metadata.keep_bindings).toStrictEqual([
				"secret_key",
				"secret_text",
			]);
			expect(metadata.keep_assets).toBeTruthy();

			expect(metadata.annotations).not.toBeUndefined();
			expect(
				(metadata.annotations as Record<string, string>)["workers/message"]
			).toBe("Deploy a new secret");
		});
		await runWrangler(
			"versions secret put SECRET --name script-name --message 'Deploy a new secret'"
		);

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🌀 Creating the secret for the Worker "script-name"
			✨ Success! Created version id with secret SECRET.
			➡️  To deploy this version with secret SECRET to production traffic use the command "wrangler versions deploy"."
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("can add secret on wasm worker", async () => {
		setIsTTY(true);

		mockSetupApiCalls();
		// Mock content call to have wasm
		msw.use(
			http.get(
				`*/accounts/:accountId/workers/scripts/:scriptName/content/v2?version=ce15c78b-cc43-4f60-b5a9-15ce4f298c2a`,
				async ({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.scriptName).toEqual("script-name");

					const formData = new FormData();
					formData.set(
						"index.js",
						new File(["export default {}"], "index.js", {
							type: "application/javascript+module",
						}),
						"index.js"
					);
					formData.set(
						"module.wasm",
						new File(
							[Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])],
							"module.wasm",
							{
								type: "application/wasm",
							}
						),
						"module.wasm"
					);
					return HttpResponse.formData(formData, {
						headers: { "cf-entrypoint": "index.js" },
					});
				},
				{ once: true }
			)
		);

		mockPrompt({
			text: "Enter a secret value:",
			options: { isSecret: true },
			result: "the-secret",
		});

		mockPostVersion((metadata, formData) => {
			expect(formData.get("module.wasm")).not.toBeNull();
			expect((formData.get("module.wasm") as File).size).equal(10);

			expect(metadata.bindings).toStrictEqual([
				{ type: "inherit", name: "do-binding" },
				{ type: "secret_text", name: "SECRET", text: "the-secret" },
			]);
			expect(metadata.keep_bindings).toStrictEqual([
				"secret_key",
				"secret_text",
			]);
			expect(metadata.keep_assets).toBeTruthy();

			expect(metadata.annotations).not.toBeUndefined();
			expect(
				(metadata.annotations as Record<string, string>)["workers/message"]
			).toBe("Deploy a new secret");
		});
		await runWrangler(
			"versions secret put SECRET --name script-name --message 'Deploy a new secret'"
		);

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			🌀 Creating the secret for the Worker "script-name"
			✨ Success! Created version id with secret SECRET.
			➡️  To deploy this version with secret SECRET to production traffic use the command "wrangler versions deploy"."
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	describe("multi-env warning", () => {
		const mockStdIn = useMockStdin({ isTTY: false });

		it("should warn if the wrangler config contains environments but none was specified in the command", async () => {
			writeWranglerConfig({
				name: "script-name",
				env: { test: {} },
			});
			mockSetupApiCalls();
			mockPostVersion();

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
				  the target environment using the \`-e|--env\` flag.
				  If your intention is to use the top-level environment of your configuration simply pass an empty
				  string to the flag to target such environment. For example \`--env=""\`.

				"
			`);
		});

		it("should not warn if the wrangler config contains environments and one was specified in the command", async () => {
			writeWranglerConfig({
				name: "script-name",
				env: { test: {} },
			});
			mockSetupApiCalls();
			mockPostVersion();

			mockStdIn.send(
				`the`,
				`-`,
				`secret
			` // whitespace & newline being removed
			);
			await runWrangler("versions secret put NEW_SECRET -e test");

			expect(std.warn).toMatchInlineSnapshot(`""`);
		});

		it("should not warn if the wrangler config doesn't contain environments and none was specified in the command", async () => {
			writeWranglerConfig({
				name: "script-name",
			});
			mockSetupApiCalls();
			mockPostVersion();

			mockStdIn.send(
				`the`,
				`-`,
				`secret
			` // whitespace & newline being removed
			);
			await runWrangler("versions secret put NEW_SECRET");

			expect(std.warn).toMatchInlineSnapshot(`""`);
		});
	});
});
