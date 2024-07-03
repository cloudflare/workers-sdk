import { normalizeOutput } from "../../../../e2e/helpers/normalize";
import { collectCLIOutput } from "../../helpers/collect-cli-output";
import { mockAccountId, mockApiToken } from "../../helpers/mock-account-id";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { msw, mswGetVersion, mswListNewDeployments } from "../../helpers/msw";
import { runInTempDir } from "../../helpers/run-in-tmp";
import { runWrangler } from "../../helpers/run-wrangler";
import writeWranglerToml from "../../helpers/write-wrangler-toml";

describe("deployments list", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	mockConsoleMethods();
	const std = collectCLIOutput();

	beforeEach(() => {
		msw.use(mswListNewDeployments, mswGetVersion());
	});

	describe("without wrangler.toml", () => {
		test("fails with no args", async () => {
			const result = runWrangler(
				"deployments status  --experimental-gradual-rollouts"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: You need to provide a name of your worker. Either pass it as a cli arg with \`--name <name>\` or in your config file as \`name = "<name>"\`]`
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
			"
		`);

			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		test("prints latest deployment to stdout as --json", async () => {
			const result = runWrangler(
				"deployments status --name test-name --json  --experimental-versions"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
			"{
			  \\"id\\": \\"Galaxy-Class-test-name\\",
			  \\"source\\": \\"api\\",
			  \\"strategy\\": \\"percentage\\",
			  \\"author_email\\": \\"Jean-Luc-Picard@federation.org\\",
			  \\"created_on\\": \\"2021-01-04T00:00:00.000000Z\\",
			  \\"annotations\\": {
			    \\"workers/triggered_by\\": \\"rollback\\",
			    \\"workers/rollback_from\\": \\"MOCK-DEPLOYMENT-ID-2222\\"
			  },
			  \\"versions\\": [
			    {
			      \\"version_id\\": \\"10000000-0000-0000-0000-000000000000\\",
			      \\"percentage\\": 10
			    },
			    {
			      \\"version_id\\": \\"20000000-0000-0000-0000-000000000000\\",
			      \\"percentage\\": 90
			    }
			  ]
			}
			"
		`);
		});
	});

	describe("with wrangler.toml", () => {
		beforeEach(() => writeWranglerToml());

		test("prints latest deployment to stdout", async () => {
			const result = runWrangler(
				"deployments status  --experimental-gradual-rollouts"
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
			"
		`);

			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		test("prints latest deployment to stdout as --json", async () => {
			const result = runWrangler(
				"deployments status --json  --experimental-versions"
			);

			await expect(result).resolves.toBeUndefined();

			expect(std.out).toMatchInlineSnapshot(`
			"{
			  \\"id\\": \\"Galaxy-Class-test-name\\",
			  \\"source\\": \\"api\\",
			  \\"strategy\\": \\"percentage\\",
			  \\"author_email\\": \\"Jean-Luc-Picard@federation.org\\",
			  \\"created_on\\": \\"2021-01-04T00:00:00.000000Z\\",
			  \\"annotations\\": {
			    \\"workers/triggered_by\\": \\"rollback\\",
			    \\"workers/rollback_from\\": \\"MOCK-DEPLOYMENT-ID-2222\\"
			  },
			  \\"versions\\": [
			    {
			      \\"version_id\\": \\"10000000-0000-0000-0000-000000000000\\",
			      \\"percentage\\": 10
			    },
			    {
			      \\"version_id\\": \\"20000000-0000-0000-0000-000000000000\\",
			      \\"percentage\\": 90
			    }
			  ]
			}
			"
		`);
		});
	});
});
