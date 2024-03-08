import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { msw, mswListVersions } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import writeWranglerToml from "../helpers/write-wrangler-toml";

describe("versions list", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const std = mockConsoleMethods();

	beforeEach(() => {
		msw.use(mswListVersions);
	});

	describe("without wrangler.toml", () => {
		test("fails with no args", async () => {
			const result = runWrangler(
				"versions list  --experimental-gradual-rollouts"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: You need to provide a name when deploying a worker. Either pass it as a cli arg with \`--name <name>\` or in your config file as \`name = "<name>"\`]`
			);

			expect(std.out).toMatchInlineSnapshot(`""`);

			expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mYou need to provide a name when deploying a worker. Either pass it as a cli arg with \`--name <name>\` or in your config file as \`name = \\"<name>\\"\`[0m

			"
		`);
		});

		test("prints versions to stdout", async () => {
			const result = runWrangler(
				"versions list --name test-name  --experimental-gradual-rollouts"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
			"Version ID:  40000000-0000-0000-0000-000000000000
			Created:     1/1/2021, 12:00:00 AM
			Author:      Jean-Luc-Picard@federation.org
			Source:      wrangler
			Tag:         -
			Message:     -

			Version ID:  30000000-0000-0000-0000-000000000000
			Created:     2/2/2021, 12:00:00 AM
			Author:      Kathryn-Janeway@federation.org
			Source:      wrangler
			Tag:         -
			Message:     Rolled back for this version

			Version ID:  20000000-0000-0000-0000-000000000000
			Created:     2/3/2021, 12:00:00 AM
			Author:      Kathryn-Janeway@federation.org
			Source:      wrangler
			Tag:         -
			Message:     -

			Version ID:  10000000-0000-0000-0000-000000000000
			Created:     1/4/2021, 12:00:00 AM
			Author:      Jean-Luc-Picard@federation.org
			Source:      wrangler
			Tag:         -
			Message:     -
			"
		`);

			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});

	describe("with wrangler.toml", () => {
		beforeEach(writeWranglerToml);

		test("prints versions to stdout", async () => {
			const result = runWrangler(
				"versions list  --experimental-gradual-rollouts"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
			"Version ID:  40000000-0000-0000-0000-000000000000
			Created:     1/1/2021, 12:00:00 AM
			Author:      Jean-Luc-Picard@federation.org
			Source:      wrangler
			Tag:         -
			Message:     -

			Version ID:  30000000-0000-0000-0000-000000000000
			Created:     2/2/2021, 12:00:00 AM
			Author:      Kathryn-Janeway@federation.org
			Source:      wrangler
			Tag:         -
			Message:     Rolled back for this version

			Version ID:  20000000-0000-0000-0000-000000000000
			Created:     2/3/2021, 12:00:00 AM
			Author:      Kathryn-Janeway@federation.org
			Source:      wrangler
			Tag:         -
			Message:     -

			Version ID:  10000000-0000-0000-0000-000000000000
			Created:     1/4/2021, 12:00:00 AM
			Author:      Jean-Luc-Picard@federation.org
			Source:      wrangler
			Tag:         -
			Message:     -
			"
		`);

			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});
});
