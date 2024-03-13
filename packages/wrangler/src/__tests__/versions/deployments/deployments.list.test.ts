import { normalizeOutput } from "../../../../e2e/helpers/normalize";
import { collectCLIOutput } from "../../helpers/collect-cli-output";
import { mockAccountId, mockApiToken } from "../../helpers/mock-account-id";
import { msw, mswGetVersion, mswListNewDeployments } from "../../helpers/msw";
import { runInTempDir } from "../../helpers/run-in-tmp";
import { runWrangler } from "../../helpers/run-wrangler";
import writeWranglerToml from "../../helpers/write-wrangler-toml";

describe("deployments list", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const std = collectCLIOutput();

	beforeEach(() => {
		msw.use(mswListNewDeployments, mswGetVersion);
	});

	describe("without wrangler.toml", () => {
		test("fails with no args", async () => {
			const result = runWrangler(
				"deployments list  --experimental-gradual-rollouts"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: You need to provide a name of your worker. Either pass it as a cli arg with \`--name <name>\` or in your config file as \`name = "<name>"\`]`
			);

			expect(std.out).toMatchInlineSnapshot(`""`);

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("prints deployments to stdout", async () => {
			const result = runWrangler(
				"deployments list --name test-name  --experimental-gradual-rollouts"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
			"Created:     2021-01-04T00:00:00.000Z
			Author:      Jean-Luc-Picard@federation.org
			Source:      Rollback
			Message:     -
			Version(s):  (10%) 10000000-0000-0000-0000-000000000000
			                 Created:  2021-01-01T00:00:00.000Z
			                     Tag:  -
			                 Message:  -
			             
			             (90%) 20000000-0000-0000-0000-000000000000
			                 Created:  2021-01-01T00:00:00.000Z
			                     Tag:  -
			                 Message:  -

			Created:     2021-01-01T00:00:00.000Z
			Author:      Jean-Luc-Picard@federation.org
			Source:      Upload
			Message:     -
			Version(s):  (20%) 10000000-0000-0000-0000-000000000000
			                 Created:  2021-01-01T00:00:00.000Z
			                     Tag:  -
			                 Message:  -
			             
			             (80%) 20000000-0000-0000-0000-000000000000
			                 Created:  2021-01-01T00:00:00.000Z
			                     Tag:  -
			                 Message:  -

			Created:     2021-02-02T00:00:00.000Z
			Author:      Kathryn-Janeway@federation.org
			Source:      Rollback
			Message:     Rolled back for this version
			Version(s):  (30%) 10000000-0000-0000-0000-000000000000
			                 Created:  2021-01-01T00:00:00.000Z
			                     Tag:  -
			                 Message:  -
			             
			             (70%) 20000000-0000-0000-0000-000000000000
			                 Created:  2021-01-01T00:00:00.000Z
			                     Tag:  -
			                 Message:  -

			Created:     2021-02-03T00:00:00.000Z
			Author:      Kathryn-Janeway@federation.org
			Source:      Wrangler 🤠
			Message:     -
			Version(s):  (40%) 10000000-0000-0000-0000-000000000000
			                 Created:  2021-01-01T00:00:00.000Z
			                     Tag:  -
			                 Message:  -
			             
			             (60%) 20000000-0000-0000-0000-000000000000
			                 Created:  2021-01-01T00:00:00.000Z
			                     Tag:  -
			                 Message:  -
			"
		`);

			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});

	describe("with wrangler.toml", () => {
		beforeEach(writeWranglerToml);

		test("prints deployments to stdout", async () => {
			const result = runWrangler(
				"deployments list  --experimental-gradual-rollouts"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
			"Created:     2021-01-04T00:00:00.000Z
			Author:      Jean-Luc-Picard@federation.org
			Source:      Rollback
			Message:     -
			Version(s):  (10%) 10000000-0000-0000-0000-000000000000
			                 Created:  2021-01-01T00:00:00.000Z
			                     Tag:  -
			                 Message:  -
			             
			             (90%) 20000000-0000-0000-0000-000000000000
			                 Created:  2021-01-01T00:00:00.000Z
			                     Tag:  -
			                 Message:  -

			Created:     2021-01-01T00:00:00.000Z
			Author:      Jean-Luc-Picard@federation.org
			Source:      Upload
			Message:     -
			Version(s):  (20%) 10000000-0000-0000-0000-000000000000
			                 Created:  2021-01-01T00:00:00.000Z
			                     Tag:  -
			                 Message:  -
			             
			             (80%) 20000000-0000-0000-0000-000000000000
			                 Created:  2021-01-01T00:00:00.000Z
			                     Tag:  -
			                 Message:  -

			Created:     2021-02-02T00:00:00.000Z
			Author:      Kathryn-Janeway@federation.org
			Source:      Rollback
			Message:     Rolled back for this version
			Version(s):  (30%) 10000000-0000-0000-0000-000000000000
			                 Created:  2021-01-01T00:00:00.000Z
			                     Tag:  -
			                 Message:  -
			             
			             (70%) 20000000-0000-0000-0000-000000000000
			                 Created:  2021-01-01T00:00:00.000Z
			                     Tag:  -
			                 Message:  -

			Created:     2021-02-03T00:00:00.000Z
			Author:      Kathryn-Janeway@federation.org
			Source:      Wrangler 🤠
			Message:     -
			Version(s):  (40%) 10000000-0000-0000-0000-000000000000
			                 Created:  2021-01-01T00:00:00.000Z
			                     Tag:  -
			                 Message:  -
			             
			             (60%) 20000000-0000-0000-0000-000000000000
			                 Created:  2021-01-01T00:00:00.000Z
			                     Tag:  -
			                 Message:  -
			"
		`);

			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});
});
