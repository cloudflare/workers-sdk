import { writeFile } from "node:fs/promises";
import readline from "node:readline";
import { describe, expect, test } from "vitest";
import { mockAccountId, mockApiToken } from "../../helpers/mock-account-id";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { clearDialogs } from "../../helpers/mock-dialogs";
import { runInTempDir } from "../../helpers/run-in-tmp";
import { runWrangler } from "../../helpers/run-wrangler";
import { mockPostVersion, mockSetupApiCalls } from "./utils";
import type { Interface } from "node:readline";

describe("versions secret bulk", () => {
	const std = mockConsoleMethods();
	runInTempDir();
	mockAccountId();
	mockApiToken();
	afterEach(() => {
		clearDialogs();
	});

	test("should fail secret bulk w/ no pipe or JSON input", async () => {
		vi.spyOn(readline, "createInterface").mockImplementation(
			() => null as unknown as Interface
		);
		await runWrangler(`versions secret bulk --name script-name`);
		expect(std.out).toMatchInlineSnapshot(
			`"🌀 Creating the secrets for the Worker \\"script-name\\" "`
		);
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNo content found in file or piped input.[0m

			"
		`);
		expect(std.warn).toMatchInlineSnapshot(`""`);
	});

	test("uploading secrets from json file", async () => {
		await writeFile(
			"secrets.json",
			JSON.stringify({
				SECRET_1: "secret-1",
				SECRET_2: "secret-2",
				SECRET_3: "secret-3",
			}),
			{ encoding: "utf8" }
		);

		mockSetupApiCalls();
		mockPostVersion((metadata) => {
			expect(metadata.bindings).toStrictEqual([
				{ type: "secret_text", name: "SECRET_1", text: "secret-1" },
				{ type: "secret_text", name: "SECRET_2", text: "secret-2" },
				{ type: "secret_text", name: "SECRET_3", text: "secret-3" },
			]);
			expect(metadata.keep_bindings).toStrictEqual([
				"secret_key",
				"secret_text",
			]);
			expect(metadata.keep_assets).toBeTruthy();
		});

		await runWrangler(`versions secret bulk secrets.json --name script-name`);
		expect(std.out).toMatchInlineSnapshot(
			`
			"🌀 Creating the secrets for the Worker \\"script-name\\"
			✨ Successfully created secret for key: SECRET_1
			✨ Successfully created secret for key: SECRET_2
			✨ Successfully created secret for key: SECRET_3
			✨ Success! Created version id with 3 secrets.
			➡️  To deploy this version to production traffic use the command \\"wrangler versions deploy\\"."
		`
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("uploading secrets from env file", async () => {
		await writeFile(
			".env",
			"SECRET_1=secret-1\nSECRET_2=secret-2\nSECRET_3=secret-3"
		);
		mockSetupApiCalls();
		mockPostVersion();
		await runWrangler(`versions secret bulk .env --name script-name`);
		expect(std.out).toMatchInlineSnapshot(
			`
			"🌀 Creating the secrets for the Worker \\"script-name\\"
			✨ Successfully created secret for key: SECRET_1
			✨ Successfully created secret for key: SECRET_2
			✨ Successfully created secret for key: SECRET_3
			✨ Success! Created version id with 3 secrets.
			➡️  To deploy this version to production traffic use the command \\"wrangler versions deploy\\"."
		`
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("no wrangler configuration warnings shown", async () => {
		await writeFile("secrets.json", JSON.stringify({ SECRET_1: "secret-1" }));
		await writeFile("wrangler.json", JSON.stringify({ invalid_field: true }));
		mockSetupApiCalls();
		mockPostVersion();
		await runWrangler(`versions secret bulk secrets.json --name script-name`);
		expect(std.warn).toMatchInlineSnapshot(`""`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("uploading secrets from stdin", async () => {
		vi.spyOn(readline, "createInterface").mockImplementation(
			() =>
				// `readline.Interface` is an async iterator: `[Symbol.asyncIterator](): AsyncIterableIterator<string>`
				JSON.stringify({
					SECRET_1: "secret-1",
					SECRET_2: "secret-2",
					SECRET_3: "secret-3",
				}) as unknown as Interface
		);

		mockSetupApiCalls();
		mockPostVersion((metadata) => {
			expect(metadata.bindings).toStrictEqual([
				{ type: "secret_text", name: "SECRET_1", text: "secret-1" },
				{ type: "secret_text", name: "SECRET_2", text: "secret-2" },
				{ type: "secret_text", name: "SECRET_3", text: "secret-3" },
			]);
			expect(metadata.keep_bindings).toStrictEqual([
				"secret_key",
				"secret_text",
			]);
			expect(metadata.keep_assets).toBeTruthy();
		});

		await runWrangler(`versions secret bulk --name script-name`);
		expect(std.out).toMatchInlineSnapshot(
			`
			"🌀 Creating the secrets for the Worker \\"script-name\\"
			✨ Successfully created secret for key: SECRET_1
			✨ Successfully created secret for key: SECRET_2
			✨ Successfully created secret for key: SECRET_3
			✨ Success! Created version id with 3 secrets.
			➡️  To deploy this version to production traffic use the command \\"wrangler versions deploy\\"."
		`
		);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("should error on invalid json file", async () => {
		await writeFile("secrets.json", "not valid json :(", { encoding: "utf8" });

		await expect(
			runWrangler(`versions secret bulk secrets.json --name script-name`)
		).rejects.toThrowError(
			`The contents of "secrets.json" is not valid JSON: "ParseError: InvalidSymbol"`
		);
	});

	test("should error on invalid json stdin", async () => {
		vi.spyOn(readline, "createInterface").mockImplementation(
			() =>
				// `readline.Interface` is an async iterator: `[Symbol.asyncIterator](): AsyncIterableIterator<string>`
				"hello world" as unknown as Interface
		);

		mockSetupApiCalls();
		mockPostVersion((metadata) => {
			expect(metadata.bindings).toStrictEqual([
				{ type: "secret_text", name: "SECRET_1", text: "secret-1" },
				{ type: "secret_text", name: "SECRET_2", text: "secret-2" },
				{ type: "secret_text", name: "SECRET_3", text: "secret-3" },
			]);
			expect(metadata.keep_bindings).toStrictEqual([
				"secret_key",
				"secret_text",
			]);
			expect(metadata.keep_assets).toBeTruthy();
		});

		await runWrangler(`versions secret bulk --name script-name`);
		expect(std.out).toMatchInlineSnapshot(
			`"🌀 Creating the secrets for the Worker \\"script-name\\" "`
		);
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNo content found in file or piped input.[0m

			"
		`);
	});
});
