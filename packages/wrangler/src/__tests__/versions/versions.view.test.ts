import { normalizeOutput } from "../../../e2e/helpers/normalize";
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
	const std = mockConsoleMethods();

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

			expect(std.out).toMatchInlineSnapshot(`
			"
			wrangler versions view <version-id>

			View the details of a specific version of your Worker [beta]

			Positionals:
			  version-id  The Worker Version ID to view  [string] [required]

			Flags:
			  -j, --experimental-json-config  Experimental: Support wrangler.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]

			Options:
			      --name  Name of the worker  [string]"
		`);

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(
				`"X [ERROR] Not enough non-option arguments: got 0, need at least 1"`
			);
		});

		test("fails with --name arg only", async () => {
			const result = runWrangler(
				"versions view --name test-name  --experimental-gradual-rollouts"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: Not enough non-option arguments: got 0, need at least 1]`
			);

			expect(std.out).toMatchInlineSnapshot(`
			"
			wrangler versions view <version-id>

			View the details of a specific version of your Worker [beta]

			Positionals:
			  version-id  The Worker Version ID to view  [string] [required]

			Flags:
			  -j, --experimental-json-config  Experimental: Support wrangler.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]

			Options:
			      --name  Name of the worker  [string]"
		`);

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(
				`"X [ERROR] Not enough non-option arguments: got 0, need at least 1"`
			);
		});

		test("fails with positional version-id arg only", async () => {
			const result = runWrangler(
				"versions view 10000000-0000-0000-0000-000000000000  --experimental-gradual-rollouts"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: You need to provide a name when deploying a worker. Either pass it as a cli arg with \`--name <name>\` or in your config file as \`name = "<name>"\`]`
			);

			expect(std.out).toMatchInlineSnapshot(`""`);

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(
				`"X [ERROR] You need to provide a name when deploying a worker. Either pass it as a cli arg with \`--name <name>\` or in your config file as \`name = \\"<name>\\"\`"`
			);
		});

		test("succeeds with positional version-id arg and --name arg", async () => {
			const result = runWrangler(
				"versions view 10000000-0000-0000-0000-000000000000 --name test-name  --experimental-gradual-rollouts"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
			"Version ID:  10000000-0000-0000-0000-000000000000
			Created:     1/1/2021, 12:00:00 AM
			Author:      Jean-Luc-Picard@federation.org
			Source:      Upload
			Tag:         -
			Message:     -
			"
		`);

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
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

			expect(std.out).toMatchInlineSnapshot(`
			"
			wrangler versions view <version-id>

			View the details of a specific version of your Worker [beta]

			Positionals:
			  version-id  The Worker Version ID to view  [string] [required]

			Flags:
			  -j, --experimental-json-config  Experimental: Support wrangler.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]

			Options:
			      --name  Name of the worker  [string]"
		`);

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(
				`"X [ERROR] Not enough non-option arguments: got 0, need at least 1"`
			);
		});

		test("succeeds with positional version-id arg only", async () => {
			const result = runWrangler(
				"versions view 10000000-0000-0000-0000-000000000000  --experimental-gradual-rollouts"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
			"Version ID:  10000000-0000-0000-0000-000000000000
			Created:     1/1/2021, 12:00:00 AM
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

			expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
			"X [ERROR] A request to the Cloudflare API (/accounts/some-account-id/workers/scripts/test-name/versions/00000000-0000-0000-0000-000000000000) failed.
			  If you think this is a bug, please open an issue at:
			  https://github.com/cloudflare/workers-sdk/issues/new/choose"
		`);

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});
	});
});
