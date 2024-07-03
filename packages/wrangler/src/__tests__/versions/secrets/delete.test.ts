import { describe, expect, test } from "vitest";
import { mockAccountId, mockApiToken } from "../../helpers/mock-account-id";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { clearDialogs, mockConfirm } from "../../helpers/mock-dialogs";
import { useMockIsTTY } from "../../helpers/mock-istty";
import { runInTempDir } from "../../helpers/run-in-tmp";
import { runWrangler } from "../../helpers/run-wrangler";
import writeWranglerToml from "../../helpers/write-wrangler-toml";
import { mockGetVersion, mockPostVersion, mockSetupApiCalls } from "./utils";

describe("versions secret put", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();
	runInTempDir();
	mockAccountId();
	mockApiToken();
	afterEach(() => {
		clearDialogs();
	});

	test("can delete a new secret (interactive)", async () => {
		setIsTTY(true);

		mockConfirm({
			text: "Are you sure you want to permanently delete the secret SECRET on the Worker script-name?",
			result: true,
		});

		mockSetupApiCalls();
		mockGetVersion();
		mockPostVersion((metadata) => {
			// We should have all secrets except the one being deleted
			expect(metadata.bindings).toStrictEqual([
				{ type: "inherit", name: "ANOTHER_SECRET" },
				{ type: "inherit", name: "YET_ANOTHER_SECRET" },
			]);
			// We will not be inherting secret_text as that would bring back SECRET
			expect(metadata.keep_bindings).toStrictEqual(["secret_key"]);
		});
		await runWrangler(
			"versions secret delete SECRET --name script-name --x-versions"
		);

		expect(std.out).toMatchInlineSnapshot(`
			"🌀 Deleting the secret SECRET on the Worker script-name
			✨ Success! Created version id with deleted secret SECRET.
			➡️  To deploy this version without the secret SECRET to production traffic use the command \\"wrangler versions deploy --x-versions\\"."
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("can delete a secret (non-interactive)", async () => {
		setIsTTY(false);

		mockSetupApiCalls();
		mockGetVersion();
		mockPostVersion((metadata) => {
			expect(metadata.bindings).toStrictEqual([
				{ type: "inherit", name: "ANOTHER_SECRET" },
				{ type: "inherit", name: "YET_ANOTHER_SECRET" },
			]);
			// We will not be inherting secret_text as that would bring back SECRET
			expect(metadata.keep_bindings).toStrictEqual(["secret_key"]);
		});

		await runWrangler(
			"versions secret delete SECRET --name script-name --x-versions"
		);

		expect(std.out).toMatchInlineSnapshot(`
			"? Are you sure you want to permanently delete the secret SECRET on the Worker script-name?
			🤖 Using fallback value in non-interactive context: yes
			🌀 Deleting the secret SECRET on the Worker script-name
			✨ Success! Created version id with deleted secret SECRET.
			➡️  To deploy this version without the secret SECRET to production traffic use the command \\"wrangler versions deploy --x-versions\\"."
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	test("can delete a secret reading Worker name from wrangler.toml", async () => {
		writeWranglerToml({ name: "script-name" });
		setIsTTY(false);

		mockSetupApiCalls();
		mockGetVersion();
		mockPostVersion((metadata) => {
			expect(metadata.bindings).toStrictEqual([
				{ type: "inherit", name: "ANOTHER_SECRET" },
				{ type: "inherit", name: "YET_ANOTHER_SECRET" },
			]);
			// We will not be inherting secret_text as that would bring back SECRET
			expect(metadata.keep_bindings).toStrictEqual(["secret_key"]);
		});

		await runWrangler("versions secret delete SECRET --x-versions");

		expect(std.out).toMatchInlineSnapshot(`
			"? Are you sure you want to permanently delete the secret SECRET on the Worker script-name?
			🤖 Using fallback value in non-interactive context: yes
			🌀 Deleting the secret SECRET on the Worker script-name
			✨ Success! Created version id with deleted secret SECRET.
			➡️  To deploy this version without the secret SECRET to production traffic use the command \\"wrangler versions deploy --x-versions\\"."
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});
});
