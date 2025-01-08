import { writeFile } from "node:fs/promises";
import { http, HttpResponse } from "msw";
import { File, FormData } from "undici";
import { describe, expect, test } from "vitest";
import { mockAccountId, mockApiToken } from "../../helpers/mock-account-id";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { clearDialogs, mockPrompt } from "../../helpers/mock-dialogs";
import { useMockIsTTY } from "../../helpers/mock-istty";
import { useMockStdin } from "../../helpers/mock-stdin";
import { msw } from "../../helpers/msw";
import { runInTempDir } from "../../helpers/run-in-tmp";
import { runWrangler } from "../../helpers/run-wrangler";
import { writeWranglerConfig } from "../../helpers/write-wrangler-config";
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
			"🌀 Creating the secret for the Worker \\"script-name\\"
			✨ Success! Created version id with secret NEW_SECRET.
			➡️  To deploy this version with secret NEW_SECRET to production traffic use the command \\"wrangler versions deploy\\"."
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
				"🌀 Creating the secret for the Worker \\"script-name\\"
				✨ Success! Created version id with secret NEW_SECRET.
				➡️  To deploy this version with secret NEW_SECRET to production traffic use the command \\"wrangler versions deploy\\"."
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
			"🌀 Creating the secret for the Worker \\"script-name\\"
			✨ Success! Created version id with secret NEW_SECRET.
			➡️  To deploy this version with secret NEW_SECRET to production traffic use the command \\"wrangler versions deploy\\"."
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
			"🌀 Creating the secret for the Worker \\"script-name\\"
			✨ Success! Created version id with secret NEW_SECRET.
			➡️  To deploy this version with secret NEW_SECRET to production traffic use the command \\"wrangler versions deploy\\"."
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
			"🌀 Creating the secret for the Worker \\"script-name\\"
			✨ Success! Created version id with secret NEW_SECRET.
			➡️  To deploy this version with secret NEW_SECRET to production traffic use the command \\"wrangler versions deploy\\"."
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
			"🌀 Creating the secret for the Worker \\"script-name\\"
			✨ Success! Created version id with secret SECRET.
			➡️  To deploy this version with secret SECRET to production traffic use the command \\"wrangler versions deploy\\"."
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
			"🌀 Creating the secret for the Worker \\"script-name\\"
			✨ Success! Created version id with secret SECRET.
			➡️  To deploy this version with secret SECRET to production traffic use the command \\"wrangler versions deploy\\"."
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});
});
