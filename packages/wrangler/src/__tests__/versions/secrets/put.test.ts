import { describe, expect, test } from "vitest";
import { mockAccountId, mockApiToken } from "../../helpers/mock-account-id";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { clearDialogs, mockPrompt } from "../../helpers/mock-dialogs";
import { useMockIsTTY } from "../../helpers/mock-istty";
import { useMockStdin } from "../../helpers/mock-stdin";
import { runInTempDir } from "../../helpers/run-in-tmp";
import { runWrangler } from "../../helpers/run-wrangler";
import writeWranglerToml from "../../helpers/write-wrangler-toml";
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
		});
		await runWrangler(
			"versions secret put NEW_SECRET --name script-name --x-versions"
		);

		expect(std.out).toMatchInlineSnapshot(`
			"🌀 Creating the secret for the Worker \\"script-name\\"
			✨ Success! Created version id with secret NEW_SECRET.
			➡️  To deploy this version with secret NEW_SECRET to production traffic use the command \\"wrangler versions deploy --x-versions\\"."
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	// For some reason, this always hangs. Not sure why
	test.skip("can add a new secret (non-interactive)", async () => {
		setIsTTY(false);
		const mockStdIn = useMockStdin({ isTTY: false });

		mockSetupApiCalls();
		mockPostVersion((metadata) => {
			expect(metadata.bindings).toStrictEqual([
				{ type: "secret_text", name: "NEW_SECRET", text: "the-secret" },
			]);
			expect(metadata.keep_bindings).toStrictEqual([
				"secret_key",
				"secret_text",
			]);
		});

		mockStdIn.send(
			`the`,
			`-`,
			`secret
			` // whitespace & newline being removed
		);
		await runWrangler(
			"versions secret put NEW_SECRET --name script-name --x-versions"
		);

		expect(std.out).toMatchInlineSnapshot(`
			"🌀 Creating the secret for the Worker \\"script-name\\"
			✨ Success! Created version id with secret NEW_SECRET.
			➡️  To deploy this version with secret NEW_SECRET to production traffic use the command wrangler versions deploy."
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("can add a new secret, read Worker name from wrangler.toml", async () => {
		writeWranglerToml({ name: "script-name" });

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
		});
		await runWrangler("versions secret put NEW_SECRET --x-versions");

		expect(std.out).toMatchInlineSnapshot(`
			"🌀 Creating the secret for the Worker \\"script-name\\"
			✨ Success! Created version id with secret NEW_SECRET.
			➡️  To deploy this version with secret NEW_SECRET to production traffic use the command \\"wrangler versions deploy --x-versions\\"."
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

			expect(metadata.annotations).not.toBeUndefined();
			expect(
				(metadata.annotations as Record<string, string>)["workers/message"]
			).toBe("Deploy a new secret");
		});
		await runWrangler(
			"versions secret put NEW_SECRET --name script-name --message 'Deploy a new secret' --x-versions"
		);

		expect(std.out).toMatchInlineSnapshot(`
			"🌀 Creating the secret for the Worker \\"script-name\\"
			✨ Success! Created version id with secret NEW_SECRET.
			➡️  To deploy this version with secret NEW_SECRET to production traffic use the command \\"wrangler versions deploy --x-versions\\"."
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

			expect(metadata.annotations).not.toBeUndefined();
			expect(
				(metadata.annotations as Record<string, string>)["workers/message"]
			).toBe("Deploy a new secret");
			expect(
				(metadata.annotations as Record<string, string>)["workers/tag"]
			).toBe("v1");
		});
		await runWrangler(
			"versions secret put NEW_SECRET --name script-name --message 'Deploy a new secret' --tag v1 --x-versions"
		);

		expect(std.out).toMatchInlineSnapshot(`
			"🌀 Creating the secret for the Worker \\"script-name\\"
			✨ Success! Created version id with secret NEW_SECRET.
			➡️  To deploy this version with secret NEW_SECRET to production traffic use the command \\"wrangler versions deploy --x-versions\\"."
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

			expect(metadata.annotations).not.toBeUndefined();
			expect(
				(metadata.annotations as Record<string, string>)["workers/message"]
			).toBe("Deploy a new secret");
		});
		await runWrangler(
			"versions secret put SECRET --name script-name --message 'Deploy a new secret' --x-versions"
		);

		expect(std.out).toMatchInlineSnapshot(`
			"🌀 Creating the secret for the Worker \\"script-name\\"
			✨ Success! Created version id with secret SECRET.
			➡️  To deploy this version with secret SECRET to production traffic use the command \\"wrangler versions deploy --x-versions\\"."
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});
});
