import { normalizeOutput } from "../../../../e2e/helpers/normalize";
import { collectCLIOutput } from "../../helpers/collect-cli-output";
import { mockAccountId, mockApiToken } from "../../helpers/mock-account-id";
import {
	msw,
	mswGetVersion,
	mswListNewDeployments,
	mswListVersions,
} from "../../helpers/msw";
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
				"deployments status  --experimental-gradual-rollouts"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: You need to provide a name when deploying a worker. Either pass it as a cli arg with \`--name <name>\` or in your config file as \`name = "<name>"\`]`
			);

			expect(std.out).toMatchInlineSnapshot(`""`);

			expect(normalizeOutput(std.err)).toMatchInlineSnapshot(`""`);
		});

		test("prints latest deployment to stdout", async () => {
			const result = runWrangler(
				"deployments status --name test-name  --experimental-gradual-rollouts"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
			"Created:     2021-01-04T00:00:00.000Z
			Author:      Jean-Luc-Picard@federation.org
			Source:      api
			Message:     -
			Version(s):  (10%) 10000000-0000-0000-0000-000000000000
			                 Created:  2021-01-01T00:00:00.000Z
			                     Tag:  -
			                 Message:  -
			             
			             (90%) 20000000-0000-0000-0000-000000000000
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

		test("prints latest deployment to stdout", async () => {
			const result = runWrangler(
				"deployments status  --experimental-gradual-rollouts"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
			"Created:     2021-01-04T00:00:00.000Z
			Author:      Jean-Luc-Picard@federation.org
			Source:      api
			Message:     -
			Version(s):  (10%) 10000000-0000-0000-0000-000000000000
			                 Created:  2021-01-01T00:00:00.000Z
			                     Tag:  -
			                 Message:  -
			             
			             (90%) 20000000-0000-0000-0000-000000000000
			                 Created:  2021-01-01T00:00:00.000Z
			                     Tag:  -
			                 Message:  -
			"
		`);

			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});
});
