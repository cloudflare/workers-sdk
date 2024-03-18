import { normalizeOutput } from "../../../e2e/helpers/normalize";
import { collectCLIOutput } from "../helpers/collect-cli-output";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { msw, mswListVersions } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import writeWranglerToml from "../helpers/write-wrangler-toml";

describe("versions list", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const std = collectCLIOutput();

	beforeEach(() => {
		msw.use(mswListVersions);
	});

	describe("without wrangler.toml", () => {
		test("fails with no args", async () => {
			const result = runWrangler(
				"versions list  --experimental-gradual-rollouts"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: You need to provide a name of your worker. Either pass it as a cli arg with \`--name <name>\` or in your config file as \`name = "<name>"\`]`
			);

			expect(std.out).toMatchInlineSnapshot(`""`);

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("prints versions to stdout", async () => {
			const result = runWrangler(
				"versions list --name test-name  --experimental-gradual-rollouts"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
			"Version ID:  40000000-0000-0000-0000-000000000000
			Created:     2021-01-01T00:00:00.000Z
			Author:      Jean-Luc-Picard@federation.org
			Source:      Upload
			Tag:         -
			Message:     -

			Version ID:  30000000-0000-0000-0000-000000000000
			Created:     2021-02-02T00:00:00.000Z
			Author:      Kathryn-Janeway@federation.org
			Source:      Rollback
			Tag:         -
			Message:     Rolled back for this version

			Version ID:  20000000-0000-0000-0000-000000000000
			Created:     2021-02-03T00:00:00.000Z
			Author:      Kathryn-Janeway@federation.org
			Source:      Wrangler 🤠
			Tag:         -
			Message:     -

			Version ID:  10000000-0000-0000-0000-000000000000
			Created:     2021-01-04T00:00:00.000Z
			Author:      Jean-Luc-Picard@federation.org
			Source:      Rollback
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
			Created:     2021-01-01T00:00:00.000Z
			Author:      Jean-Luc-Picard@federation.org
			Source:      Upload
			Tag:         -
			Message:     -

			Version ID:  30000000-0000-0000-0000-000000000000
			Created:     2021-02-02T00:00:00.000Z
			Author:      Kathryn-Janeway@federation.org
			Source:      Rollback
			Tag:         -
			Message:     Rolled back for this version

			Version ID:  20000000-0000-0000-0000-000000000000
			Created:     2021-02-03T00:00:00.000Z
			Author:      Kathryn-Janeway@federation.org
			Source:      Wrangler 🤠
			Tag:         -
			Message:     -

			Version ID:  10000000-0000-0000-0000-000000000000
			Created:     2021-01-04T00:00:00.000Z
			Author:      Jean-Luc-Picard@federation.org
			Source:      Rollback
			Tag:         -
			Message:     -

			"
		`);

			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});
});
