import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, expect, test } from "vitest";
import { normalizeOutput } from "../../../e2e/helpers/normalize";
import { collectCLIOutput } from "../helpers/collect-cli-output";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { mockConfirm } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { msw, mswDeleteVersion } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

describe("versions delete", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	mockConsoleMethods();
	const std = collectCLIOutput();
	const { setIsTTY } = useMockIsTTY();

	describe("without wrangler.toml", () => {
		beforeEach(() => msw.use(mswDeleteVersion));

		test("fails with no args", async () => {
			const result = runWrangler("versions delete");

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: Not enough non-option arguments: got 0, need at least 1]`
			);

			expect(std.out).toMatchInlineSnapshot(`""`);
			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("fails with --name arg only", async () => {
			const result = runWrangler("versions delete --name test-name");

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: Not enough non-option arguments: got 0, need at least 1]`
			);

			expect(std.out).toMatchInlineSnapshot(`""`);
			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("fails with positional version-id arg only", async () => {
			const result = runWrangler(
				"versions delete 10000000-0000-0000-0000-000000000000"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: You need to provide a name of your worker. Either pass it as a cli arg with \`--name <name>\` or in your config file as \`name = "<name>"\`]`
			);

			expect(std.out).toMatchInlineSnapshot(`""`);
			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("succeeds with positional version-id arg and --name arg when confirmed", async () => {
			setIsTTY(true);
			mockConfirm({
				text: "Are you sure you want to delete version 10000000-0000-0000-0000-000000000000 of Worker test-name?",
				result: true,
			});

			const result = runWrangler(
				"versions delete 10000000-0000-0000-0000-000000000000 --name test-name"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
				"Successfully deleted version 10000000-0000-0000-0000-000000000000 of Worker test-name.
				"
			`);
			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("cancels deletion when user declines confirmation", async () => {
			setIsTTY(true);
			mockConfirm({
				text: "Are you sure you want to delete version 10000000-0000-0000-0000-000000000000 of Worker test-name?",
				result: false,
			});

			const result = runWrangler(
				"versions delete 10000000-0000-0000-0000-000000000000 --name test-name"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
				"Deletion cancelled.
				"
			`);
			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("succeeds with --yes flag (skips confirmation)", async () => {
			const result = runWrangler(
				"versions delete 10000000-0000-0000-0000-000000000000 --name test-name --yes"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
				"Successfully deleted version 10000000-0000-0000-0000-000000000000 of Worker test-name.
				"
			`);
			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("outputs JSON with --json and --yes flags", async () => {
			const result = runWrangler(
				"versions delete 10000000-0000-0000-0000-000000000000 --name test-name --json --yes"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
				"{
				  \\"success\\": true,
				  \\"worker_name\\": \\"test-name\\",
				  \\"version_id\\": \\"10000000-0000-0000-0000-000000000000\\"
				}
				"
			`);
			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("fails with non-existent version-id", async () => {
			const result = runWrangler(
				"versions delete ffffffff-ffff-ffff-ffff-ffffffffffff --name test-name --yes"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[APIError: A request to the Cloudflare API (/accounts/some-account-id/workers/workers/test-name/versions/ffffffff-ffff-ffff-ffff-ffffffffffff) failed.]`
			);

			expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`""`);
			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});
	});

	describe("with wrangler.toml", () => {
		beforeEach(() => {
			msw.use(mswDeleteVersion);
			writeWranglerConfig();
		});

		test("fails with no args", async () => {
			const result = runWrangler("versions delete");

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: Not enough non-option arguments: got 0, need at least 1]`
			);

			expect(std.out).toMatchInlineSnapshot(`""`);
			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("succeeds with positional version-id arg only when confirmed", async () => {
			setIsTTY(true);
			mockConfirm({
				text: "Are you sure you want to delete version 10000000-0000-0000-0000-000000000000 of Worker test-name?",
				result: true,
			});

			const result = runWrangler(
				"versions delete 10000000-0000-0000-0000-000000000000"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
				"Successfully deleted version 10000000-0000-0000-0000-000000000000 of Worker test-name.
				"
			`);
			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("succeeds with --yes flag", async () => {
			const result = runWrangler(
				"versions delete 10000000-0000-0000-0000-000000000000 --yes"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
				"Successfully deleted version 10000000-0000-0000-0000-000000000000 of Worker test-name.
				"
			`);
			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("outputs JSON with --json and --yes flags", async () => {
			const result = runWrangler(
				"versions delete 10000000-0000-0000-0000-000000000000 --json --yes"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
				"{
				  \\"success\\": true,
				  \\"worker_name\\": \\"test-name\\",
				  \\"version_id\\": \\"10000000-0000-0000-0000-000000000000\\"
				}
				"
			`);
			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});
	});
});
