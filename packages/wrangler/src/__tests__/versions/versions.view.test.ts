import { normalizeOutput } from "../../../e2e/helpers/normalize";
import { collectCLIOutput } from "../helpers/collect-cli-output";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { msw, mswGetVersion } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import writeWranglerToml from "../helpers/write-wrangler-toml";

describe("versions view", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	mockConsoleMethods();
	const std = collectCLIOutput();

	beforeEach(() => {
		msw.use(mswGetVersion);
	});

	describe("without wrangler.toml", () => {
		test("fails with no args", async () => {
			const result = runWrangler(
				"versions view  --experimental-gradual-rollouts"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: Not enough non-option arguments: got 0, need at least 1]`
			);

			expect(std.out).toMatchInlineSnapshot(`""`);

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("fails with --name arg only", async () => {
			const result = runWrangler(
				"versions view --name test-name  --experimental-gradual-rollouts"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: Not enough non-option arguments: got 0, need at least 1]`
			);

			expect(std.out).toMatchInlineSnapshot(`""`);

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("fails with positional version-id arg only", async () => {
			const result = runWrangler(
				"versions view 10000000-0000-0000-0000-000000000000  --experimental-gradual-rollouts"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: You need to provide a name of your worker. Either pass it as a cli arg with \`--name <name>\` or in your config file as \`name = "<name>"\`]`
			);

			expect(std.out).toMatchInlineSnapshot(`""`);

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("succeeds with positional version-id arg and --name arg", async () => {
			const result = runWrangler(
				"versions view 10000000-0000-0000-0000-000000000000 --name test-name  --experimental-gradual-rollouts"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
			"Version ID:  10000000-0000-0000-0000-000000000000
			Created:     2021-01-01T00:00:00.000Z
			Author:      Jean-Luc-Picard@federation.org
			Source:      Upload
			Tag:         -
			Message:     -
			"
		`);

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("prints version to stdout as --json", async () => {
			const result = runWrangler(
				"versions view 10000000-0000-0000-0000-000000000000 --name test-name --json  --experimental-versions"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
			"{
			  \\"id\\": \\"10000000-0000-0000-0000-000000000000\\",
			  \\"number\\": \\"1701-E\\",
			  \\"annotations\\": {
			    \\"workers/triggered_by\\": \\"upload\\"
			  },
			  \\"metadata\\": {
			    \\"author_id\\": \\"Picard-Gamma-6-0-7-3\\",
			    \\"author_email\\": \\"Jean-Luc-Picard@federation.org\\",
			    \\"source\\": \\"wrangler\\",
			    \\"created_on\\": \\"2021-01-01T00:00:00.000000Z\\",
			    \\"modified_on\\": \\"2021-01-01T00:00:00.000000Z\\"
			  }
			}
			"
		`);
		});
	});

	describe("with wrangler.toml", () => {
		beforeEach(writeWranglerToml);

		test("fails with no args", async () => {
			const result = runWrangler(
				"versions view  --experimental-gradual-rollouts"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: Not enough non-option arguments: got 0, need at least 1]`
			);

			expect(std.out).toMatchInlineSnapshot(`""`);

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("succeeds with positional version-id arg only", async () => {
			const result = runWrangler(
				"versions view 10000000-0000-0000-0000-000000000000  --experimental-gradual-rollouts"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
			"Version ID:  10000000-0000-0000-0000-000000000000
			Created:     2021-01-01T00:00:00.000Z
			Author:      Jean-Luc-Picard@federation.org
			Source:      Upload
			Tag:         -
			Message:     -
			"
		`);

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("fails with non-existent version-id", async () => {
			const result = runWrangler(
				"versions view ffffffff-ffff-ffff-ffff-ffffffffffff  --experimental-gradual-rollouts"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[APIError: A request to the Cloudflare API (/accounts/some-account-id/workers/scripts/test-name/versions/ffffffff-ffff-ffff-ffff-ffffffffffff) failed.]`
			);

			expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`""`);

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("prints version to stdout as --json", async () => {
			const result = runWrangler(
				"versions view 10000000-0000-0000-0000-000000000000 --json  --experimental-versions"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
			"{
			  \\"id\\": \\"10000000-0000-0000-0000-000000000000\\",
			  \\"number\\": \\"1701-E\\",
			  \\"annotations\\": {
			    \\"workers/triggered_by\\": \\"upload\\"
			  },
			  \\"metadata\\": {
			    \\"author_id\\": \\"Picard-Gamma-6-0-7-3\\",
			    \\"author_email\\": \\"Jean-Luc-Picard@federation.org\\",
			    \\"source\\": \\"wrangler\\",
			    \\"created_on\\": \\"2021-01-01T00:00:00.000000Z\\",
			    \\"modified_on\\": \\"2021-01-01T00:00:00.000000Z\\"
			  }
			}
			"
		`);
		});
	});
});
