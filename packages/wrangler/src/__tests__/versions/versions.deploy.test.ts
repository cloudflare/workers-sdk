import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
/* eslint-disable workers-sdk/no-vitest-import-expect -- uses test.each patterns */
import { beforeEach, describe, expect, it, test } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { normalizeOutput } from "../../../e2e/helpers/normalize";
import {
	assignAndDistributePercentages,
	parseVersionSpecs,
	summariseVersionTraffic,
	validateTrafficSubtotal,
} from "../../versions/deploy";
import { collectCLIOutput } from "../helpers/collect-cli-output";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockUploadWorkerRequest } from "../helpers/mock-upload-worker";
import {
	mockGetWorkerSubdomain,
	mockSubDomainRequest,
} from "../helpers/mock-workers-subdomain";
import {
	msw,
	mswGetVersion,
	mswListNewDeployments,
	mswListVersions,
	mswPatchNonVersionedScriptSettings,
	mswPostNewDeployment,
	mswSuccessDeploymentScriptMetadata,
} from "../helpers/msw";
import { mswListNewDeploymentsLatestFiftyFifty } from "../helpers/msw/handlers/versions";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { writeWorkerSource } from "../helpers/write-worker-source";

describe("versions deploy", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	mockConsoleMethods();
	const consoleStd = mockConsoleMethods();
	const cliStd = collectCLIOutput();
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		setIsTTY(false);
		msw.use(
			mswListNewDeployments,
			mswListVersions,
			mswGetVersion(),
			mswPostNewDeployment,
			mswPatchNonVersionedScriptSettings,
			...mswSuccessDeploymentScriptMetadata
		);
	});

	describe("legacy deploy", () => {
		test("should warn user when worker has deployment with multiple versions", async () => {
			msw.use(
				...mswSuccessDeploymentScriptMetadata,
				...mswListNewDeploymentsLatestFiftyFifty
			);
			writeWranglerConfig();
			writeWorkerSource();
			mockUploadWorkerRequest();
			mockGetWorkerSubdomain({ enabled: true });
			mockSubDomainRequest();

			await runWrangler("deploy ./index");

			expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`
				"╭  WARNING  Your last deployment has multiple versions. To progress that deployment use "wrangler versions deploy" instead.
				│
				├ Your last deployment has 2 version(s):
				│
				│ (50%) test-name:version:0
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				│ (50%) test-name:version:1
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				├ "wrangler deploy" will upload a new version and deploy it globally immediately.
				Are you sure you want to continue?
				│ yes
				│"
			`);
		});
	});

	describe("without wrangler.toml", () => {
		test("succeeds with --name arg", async () => {
			const result = runWrangler(
				"versions deploy 10000000-0000-0000-0000-000000000000 --name named-worker --yes"
			);

			await expect(result).resolves.toMatchInlineSnapshot(`undefined`);

			expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`
				"╭ Deploy Worker Versions by splitting traffic between multiple versions
				│
				├ Fetching latest deployment
				│
				├ Your current deployment has 2 version(s):
				│
				│ (10%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				│ (90%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				├ Fetching deployable versions
				│
				├ Which version(s) do you want to deploy?
				├ 1 Worker Version(s) selected
				│
				├     Worker Version 1:  00000000-0000-0000-0000-000000000000
				│              Created:  TIMESTAMP
				│                  Tag:  -
				│              Message:  -
				│
				├ What percentage of traffic should Worker Version 1 receive?
				├ 100% of traffic
				├
				├ Add a deployment message (skipped)
				│
				├ Deploying 1 version(s)
				│
				│ No non-versioned settings to sync. Skipping...
				│
				╰  SUCCESS  Deployed named-worker version 00000000-0000-0000-0000-000000000000 at 100% (TIMINGS)"
			`);

			expect(normalizeOutput(cliStd.out)).toContain(
				"No non-versioned settings to sync. Skipping..."
			);
		});

		test("fails without --name arg", async () => {
			const result = runWrangler(
				"versions deploy 10000000-0000-0000-0000-000000000000 --yes"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: You need to provide a name of your worker. Either pass it as a cli arg with \`--name <name>\` or in your config file as \`name = "<name>"\`]`
			);
		});
	});

	describe("with wrangler.toml", () => {
		beforeEach(() => writeWranglerConfig());

		test("no args", async () => {
			const result = runWrangler("versions deploy --yes");

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: You must select at least 1 version to deploy.]`
			);

			expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`
				"╭ Deploy Worker Versions by splitting traffic between multiple versions
				│
				├ Fetching latest deployment
				│
				├ Your current deployment has 2 version(s):
				│
				│ (10%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				│ (90%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				├ Fetching deployable versions
				│
				├ Which version(s) do you want to deploy?
				├ 0 Worker Version(s) selected
				│"
			`);
		});

		test("1 version @ (implicit) 100%", async () => {
			const result = runWrangler(
				"versions deploy 10000000-0000-0000-0000-000000000000 --yes"
			);

			await expect(result).resolves.toBeUndefined();

			expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`
				"╭ Deploy Worker Versions by splitting traffic between multiple versions
				│
				├ Fetching latest deployment
				│
				├ Your current deployment has 2 version(s):
				│
				│ (10%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				│ (90%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				├ Fetching deployable versions
				│
				├ Which version(s) do you want to deploy?
				├ 1 Worker Version(s) selected
				│
				├     Worker Version 1:  00000000-0000-0000-0000-000000000000
				│              Created:  TIMESTAMP
				│                  Tag:  -
				│              Message:  -
				│
				├ What percentage of traffic should Worker Version 1 receive?
				├ 100% of traffic
				├
				├ Add a deployment message (skipped)
				│
				├ Deploying 1 version(s)
				│
				│ No non-versioned settings to sync. Skipping...
				│
				╰  SUCCESS  Deployed test-name version 00000000-0000-0000-0000-000000000000 at 100% (TIMINGS)"
			`);
		});

		test("1 version @ (explicit) 100%", async () => {
			const result = runWrangler(
				"versions deploy 10000000-0000-0000-0000-000000000000@100% --yes"
			);

			await expect(result).resolves.toBeUndefined();

			expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`
				"╭ Deploy Worker Versions by splitting traffic between multiple versions
				│
				├ Fetching latest deployment
				│
				├ Your current deployment has 2 version(s):
				│
				│ (10%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				│ (90%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				├ Fetching deployable versions
				│
				├ Which version(s) do you want to deploy?
				├ 1 Worker Version(s) selected
				│
				├     Worker Version 1:  00000000-0000-0000-0000-000000000000
				│              Created:  TIMESTAMP
				│                  Tag:  -
				│              Message:  -
				│
				├ What percentage of traffic should Worker Version 1 receive?
				├ 100% of traffic
				├
				├ Add a deployment message (skipped)
				│
				├ Deploying 1 version(s)
				│
				│ No non-versioned settings to sync. Skipping...
				│
				╰  SUCCESS  Deployed test-name version 00000000-0000-0000-0000-000000000000 at 100% (TIMINGS)"
			`);
		});

		test("2 versions @ (implicit) 50% each", async () => {
			const result = runWrangler(
				"versions deploy 10000000-0000-0000-0000-000000000000 20000000-0000-0000-0000-000000000000 --yes"
			);

			await expect(result).resolves.toBeUndefined();

			expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`
				"╭ Deploy Worker Versions by splitting traffic between multiple versions
				│
				├ Fetching latest deployment
				│
				├ Your current deployment has 2 version(s):
				│
				│ (10%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				│ (90%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				├ Fetching deployable versions
				│
				├ Which version(s) do you want to deploy?
				├ 2 Worker Version(s) selected
				│
				├     Worker Version 1:  00000000-0000-0000-0000-000000000000
				│              Created:  TIMESTAMP
				│                  Tag:  -
				│              Message:  -
				│
				├     Worker Version 2:  00000000-0000-0000-0000-000000000000
				│              Created:  TIMESTAMP
				│                  Tag:  -
				│              Message:  -
				│
				├ What percentage of traffic should Worker Version 1 receive?
				├ 50% of traffic
				├
				├ What percentage of traffic should Worker Version 2 receive?
				├ 50% of traffic
				├
				├ Add a deployment message (skipped)
				│
				├ Deploying 2 version(s)
				│
				│ No non-versioned settings to sync. Skipping...
				│
				╰  SUCCESS  Deployed test-name version 00000000-0000-0000-0000-000000000000 at 50% and version 00000000-0000-0000-0000-000000000000 at 50% (TIMINGS)"
			`);
		});

		test("1 version @ (explicit) 100%", async () => {
			const result = runWrangler(
				"versions deploy 10000000-0000-0000-0000-000000000000@100% --yes"
			);

			await expect(result).resolves.toBeUndefined();

			expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`
				"╭ Deploy Worker Versions by splitting traffic between multiple versions
				│
				├ Fetching latest deployment
				│
				├ Your current deployment has 2 version(s):
				│
				│ (10%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				│ (90%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				├ Fetching deployable versions
				│
				├ Which version(s) do you want to deploy?
				├ 1 Worker Version(s) selected
				│
				├     Worker Version 1:  00000000-0000-0000-0000-000000000000
				│              Created:  TIMESTAMP
				│                  Tag:  -
				│              Message:  -
				│
				├ What percentage of traffic should Worker Version 1 receive?
				├ 100% of traffic
				├
				├ Add a deployment message (skipped)
				│
				├ Deploying 1 version(s)
				│
				│ No non-versioned settings to sync. Skipping...
				│
				╰  SUCCESS  Deployed test-name version 00000000-0000-0000-0000-000000000000 at 100% (TIMINGS)"
			`);
		});

		test("2 versions @ (explicit) 30% + (implicit) 70%", async () => {
			const result = runWrangler(
				"versions deploy 10000000-0000-0000-0000-000000000000@30% 20000000-0000-0000-0000-000000000000 --yes"
			);

			await expect(result).resolves.toBeUndefined();

			expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`
				"╭ Deploy Worker Versions by splitting traffic between multiple versions
				│
				├ Fetching latest deployment
				│
				├ Your current deployment has 2 version(s):
				│
				│ (10%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				│ (90%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				├ Fetching deployable versions
				│
				├ Which version(s) do you want to deploy?
				├ 2 Worker Version(s) selected
				│
				├     Worker Version 1:  00000000-0000-0000-0000-000000000000
				│              Created:  TIMESTAMP
				│                  Tag:  -
				│              Message:  -
				│
				├     Worker Version 2:  00000000-0000-0000-0000-000000000000
				│              Created:  TIMESTAMP
				│                  Tag:  -
				│              Message:  -
				│
				├ What percentage of traffic should Worker Version 1 receive?
				├ 30% of traffic
				├
				├ What percentage of traffic should Worker Version 2 receive?
				├ 70% of traffic
				├
				├ Add a deployment message (skipped)
				│
				├ Deploying 2 version(s)
				│
				│ No non-versioned settings to sync. Skipping...
				│
				╰  SUCCESS  Deployed test-name version 00000000-0000-0000-0000-000000000000 at 30% and version 00000000-0000-0000-0000-000000000000 at 70% (TIMINGS)"
			`);
		});

		test("2 versions @ (explicit) 40% + (explicit) 60%", async () => {
			const result = runWrangler(
				"versions deploy 10000000-0000-0000-0000-000000000000@40% 20000000-0000-0000-0000-000000000000@60% --yes"
			);

			await expect(result).resolves.toBeUndefined();

			expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`
				"╭ Deploy Worker Versions by splitting traffic between multiple versions
				│
				├ Fetching latest deployment
				│
				├ Your current deployment has 2 version(s):
				│
				│ (10%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				│ (90%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				├ Fetching deployable versions
				│
				├ Which version(s) do you want to deploy?
				├ 2 Worker Version(s) selected
				│
				├     Worker Version 1:  00000000-0000-0000-0000-000000000000
				│              Created:  TIMESTAMP
				│                  Tag:  -
				│              Message:  -
				│
				├     Worker Version 2:  00000000-0000-0000-0000-000000000000
				│              Created:  TIMESTAMP
				│                  Tag:  -
				│              Message:  -
				│
				├ What percentage of traffic should Worker Version 1 receive?
				├ 40% of traffic
				├
				├ What percentage of traffic should Worker Version 2 receive?
				├ 60% of traffic
				├
				├ Add a deployment message (skipped)
				│
				├ Deploying 2 version(s)
				│
				│ No non-versioned settings to sync. Skipping...
				│
				╰  SUCCESS  Deployed test-name version 00000000-0000-0000-0000-000000000000 at 40% and version 00000000-0000-0000-0000-000000000000 at 60% (TIMINGS)"
			`);
		});

		describe("max versions restrictions (temp)", () => {
			test("2+ versions fails", async () => {
				const result = runWrangler(
					"versions deploy 10000000-0000-0000-0000-000000000000 20000000-0000-0000-0000-000000000000 30000000-0000-0000-0000-000000000000 --yes"
				);

				await expect(result).rejects.toMatchInlineSnapshot(
					`[Error: You must select at most 2 versions to deploy.]`
				);

				expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`
					"╭ Deploy Worker Versions by splitting traffic between multiple versions
					│
					├ Fetching latest deployment
					│
					├ Your current deployment has 2 version(s):
					│
					│ (10%) 00000000-0000-0000-0000-000000000000
					│       Created:  TIMESTAMP
					│           Tag:  -
					│       Message:  -
					│
					│ (90%) 00000000-0000-0000-0000-000000000000
					│       Created:  TIMESTAMP
					│           Tag:  -
					│       Message:  -
					│
					├ Fetching deployable versions
					│
					├ Which version(s) do you want to deploy?
					├ 3 Worker Version(s) selected
					│
					├     Worker Version 1:  00000000-0000-0000-0000-000000000000
					│              Created:  TIMESTAMP
					│                  Tag:  -
					│              Message:  -
					│
					├     Worker Version 2:  00000000-0000-0000-0000-000000000000
					│              Created:  TIMESTAMP
					│                  Tag:  -
					│              Message:  -
					│
					├     Worker Version 3:  00000000-0000-0000-0000-000000000000
					│              Created:  TIMESTAMP
					│                  Tag:  -
					│              Message:  Rolled back for this version
					│"
				`);
			});

			test("--max-versions allows > 2 versions", async () => {
				const result = runWrangler(
					"versions deploy 10000000-0000-0000-0000-000000000000 20000000-0000-0000-0000-000000000000 30000000-0000-0000-0000-000000000000 --max-versions=3 --yes"
				);

				await expect(result).resolves.toBeUndefined();

				expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`
					"╭ Deploy Worker Versions by splitting traffic between multiple versions
					│
					├ Fetching latest deployment
					│
					├ Your current deployment has 2 version(s):
					│
					│ (10%) 00000000-0000-0000-0000-000000000000
					│       Created:  TIMESTAMP
					│           Tag:  -
					│       Message:  -
					│
					│ (90%) 00000000-0000-0000-0000-000000000000
					│       Created:  TIMESTAMP
					│           Tag:  -
					│       Message:  -
					│
					├ Fetching deployable versions
					│
					├ Which version(s) do you want to deploy?
					├ 3 Worker Version(s) selected
					│
					├     Worker Version 1:  00000000-0000-0000-0000-000000000000
					│              Created:  TIMESTAMP
					│                  Tag:  -
					│              Message:  -
					│
					├     Worker Version 2:  00000000-0000-0000-0000-000000000000
					│              Created:  TIMESTAMP
					│                  Tag:  -
					│              Message:  -
					│
					├     Worker Version 3:  00000000-0000-0000-0000-000000000000
					│              Created:  TIMESTAMP
					│                  Tag:  -
					│              Message:  Rolled back for this version
					│
					├ What percentage of traffic should Worker Version 1 receive?
					├ 33.333% of traffic
					├
					├ What percentage of traffic should Worker Version 2 receive?
					├ 33.334% of traffic
					├
					├ What percentage of traffic should Worker Version 3 receive?
					├ 33.333% of traffic
					├
					├ Add a deployment message (skipped)
					│
					├ Deploying 3 version(s)
					│
					│ No non-versioned settings to sync. Skipping...
					│
					╰  SUCCESS  Deployed test-name version 00000000-0000-0000-0000-000000000000 at 33.333%, version 00000000-0000-0000-0000-000000000000 at 33.334%, and version 00000000-0000-0000-0000-000000000000 at 33.333% (TIMINGS)"
				`);

				expect(normalizeOutput(cliStd.err)).toMatchInlineSnapshot(`""`);
			});
		});

		test("with a message", async () => {
			const result = runWrangler(
				"versions deploy 10000000-0000-0000-0000-000000000000 --message 'My versioned deployment message' --yes"
			);

			await expect(result).resolves.toBeUndefined();

			expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`
				"╭ Deploy Worker Versions by splitting traffic between multiple versions
				│
				├ Fetching latest deployment
				│
				├ Your current deployment has 2 version(s):
				│
				│ (10%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				│ (90%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				├ Fetching deployable versions
				│
				├ Which version(s) do you want to deploy?
				├ 1 Worker Version(s) selected
				│
				├     Worker Version 1:  00000000-0000-0000-0000-000000000000
				│              Created:  TIMESTAMP
				│                  Tag:  -
				│              Message:  -
				│
				├ What percentage of traffic should Worker Version 1 receive?
				├ 100% of traffic
				├
				├ Add a deployment message
				│ Deployment message My versioned deployment message
				│
				├ Deploying 1 version(s)
				│
				│ No non-versioned settings to sync. Skipping...
				│
				╰  SUCCESS  Deployed test-name version 00000000-0000-0000-0000-000000000000 at 100% (TIMINGS)"
			`);
		});

		test("with logpush in wrangler.toml", async () => {
			writeWranglerConfig({
				logpush: true,
			});

			const result = runWrangler(
				"versions deploy 10000000-0000-0000-0000-000000000000 --yes"
			);

			await expect(result).resolves.toBeUndefined();

			expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`
				"╭ Deploy Worker Versions by splitting traffic between multiple versions
				│
				├ Fetching latest deployment
				│
				├ Your current deployment has 2 version(s):
				│
				│ (10%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				│ (90%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				├ Fetching deployable versions
				│
				├ Which version(s) do you want to deploy?
				├ 1 Worker Version(s) selected
				│
				├     Worker Version 1:  00000000-0000-0000-0000-000000000000
				│              Created:  TIMESTAMP
				│                  Tag:  -
				│              Message:  -
				│
				├ What percentage of traffic should Worker Version 1 receive?
				├ 100% of traffic
				├
				├ Add a deployment message (skipped)
				│
				├ Deploying 1 version(s)
				│
				├ Syncing non-versioned settings
				│
				│ Synced non-versioned settings:
				│                      logpush:  true
				│                observability:  <skipped>
				│               tail_consumers:  <skipped>
				│     streaming_tail_consumers:  <skipped>
				│
				╰  SUCCESS  Deployed test-name version 00000000-0000-0000-0000-000000000000 at 100% (TIMINGS)"
			`);
		});

		test("with observability disabled in wrangler.toml", async () => {
			writeWranglerConfig({
				observability: {
					enabled: false,
				},
			});

			const result = runWrangler(
				"versions deploy 10000000-0000-0000-0000-000000000000 --yes"
			);

			await expect(result).resolves.toBeUndefined();

			expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`
				"╭ Deploy Worker Versions by splitting traffic between multiple versions
				│
				├ Fetching latest deployment
				│
				├ Your current deployment has 2 version(s):
				│
				│ (10%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				│ (90%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				├ Fetching deployable versions
				│
				├ Which version(s) do you want to deploy?
				├ 1 Worker Version(s) selected
				│
				├     Worker Version 1:  00000000-0000-0000-0000-000000000000
				│              Created:  TIMESTAMP
				│                  Tag:  -
				│              Message:  -
				│
				├ What percentage of traffic should Worker Version 1 receive?
				├ 100% of traffic
				├
				├ Add a deployment message (skipped)
				│
				├ Deploying 1 version(s)
				│
				├ Syncing non-versioned settings
				│
				│ Synced non-versioned settings:
				│                      logpush:  <skipped>
				│                observability:  enabled:  false
				│               tail_consumers:  <skipped>
				│     streaming_tail_consumers:  <skipped>
				│
				╰  SUCCESS  Deployed test-name version 00000000-0000-0000-0000-000000000000 at 100% (TIMINGS)"
			`);
		});

		test("with logpush, tail_consumers, and observability in wrangler.toml", async () => {
			writeWranglerConfig({
				logpush: false,
				observability: {
					enabled: true,
					head_sampling_rate: 0.5,
				},
				tail_consumers: [
					{ service: "worker-1" },
					{ service: "worker-2", environment: "preview" },
					{ service: "worker-3", environment: "staging" },
				],
			});

			const result = runWrangler(
				"versions deploy 10000000-0000-0000-0000-000000000000 --yes"
			);

			await expect(result).resolves.toBeUndefined();

			expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`
				"╭ Deploy Worker Versions by splitting traffic between multiple versions
				│
				├ Fetching latest deployment
				│
				├ Your current deployment has 2 version(s):
				│
				│ (10%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				│ (90%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				├ Fetching deployable versions
				│
				├ Which version(s) do you want to deploy?
				├ 1 Worker Version(s) selected
				│
				├     Worker Version 1:  00000000-0000-0000-0000-000000000000
				│              Created:  TIMESTAMP
				│                  Tag:  -
				│              Message:  -
				│
				├ What percentage of traffic should Worker Version 1 receive?
				├ 100% of traffic
				├
				├ Add a deployment message (skipped)
				│
				├ Deploying 1 version(s)
				│
				├ Syncing non-versioned settings
				│
				│ Synced non-versioned settings:
				│                      logpush:  false
				│                observability:  enabled:             true
				│                                head_sampling_rate:  0.5
				│               tail_consumers:  worker-1
				│                                worker-2 (preview)
				│                                worker-3 (staging)
				│     streaming_tail_consumers:  <skipped>
				│
				╰  SUCCESS  Deployed test-name version 00000000-0000-0000-0000-000000000000 at 100% (TIMINGS)"
			`);
		});

		test("with logpush, streaming_tail_consumers, and observability in wrangler.toml", async () => {
			writeWranglerConfig({
				logpush: false,
				observability: {
					enabled: true,
					head_sampling_rate: 0.5,
				},
				streaming_tail_consumers: [
					{ service: "streaming-worker-1" },
					{ service: "streaming-worker-2" },
					{ service: "streaming-worker-3" },
				],
			});

			const result = runWrangler(
				"versions deploy 10000000-0000-0000-0000-000000000000 --yes"
			);

			await expect(result).resolves.toBeUndefined();

			expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`
				"╭ Deploy Worker Versions by splitting traffic between multiple versions
				│
				├ Fetching latest deployment
				│
				├ Your current deployment has 2 version(s):
				│
				│ (10%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				│ (90%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				├ Fetching deployable versions
				│
				├ Which version(s) do you want to deploy?
				├ 1 Worker Version(s) selected
				│
				├     Worker Version 1:  00000000-0000-0000-0000-000000000000
				│              Created:  TIMESTAMP
				│                  Tag:  -
				│              Message:  -
				│
				├ What percentage of traffic should Worker Version 1 receive?
				├ 100% of traffic
				├
				├ Add a deployment message (skipped)
				│
				├ Deploying 1 version(s)
				│
				├ Syncing non-versioned settings
				│
				│ Synced non-versioned settings:
				│                      logpush:  false
				│                observability:  enabled:             true
				│                                head_sampling_rate:  0.5
				│               tail_consumers:  <skipped>
				│     streaming_tail_consumers:  streaming-worker-1
				│                                streaming-worker-2
				│                                streaming-worker-3
				│
				╰  SUCCESS  Deployed test-name version 00000000-0000-0000-0000-000000000000 at 100% (TIMINGS)"
			`);
		});

		test("fails for non-existent versionId", async () => {
			const result = runWrangler(
				"versions deploy ffffffff-ffff-ffff-ffff-ffffffffffff --yes"
			);

			// TODO: could do with a better error message but this will suffice for now (this error isn't possible in the interactive flow)
			await expect(result).rejects.toMatchInlineSnapshot(
				`[APIError: A request to the Cloudflare API (/accounts/some-account-id/workers/scripts/test-name/versions/ffffffff-ffff-ffff-ffff-ffffffffffff) failed.]`
			);

			expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`
				"╭ Deploy Worker Versions by splitting traffic between multiple versions
				│
				├ Fetching latest deployment
				│
				├ Your current deployment has 2 version(s):
				│
				│ (10%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				│ (90%) 00000000-0000-0000-0000-000000000000
				│       Created:  TIMESTAMP
				│           Tag:  -
				│       Message:  -
				│
				├ Fetching deployable versions
				│"
			`);
		});

		test("fails if --percentage > 100", async () => {
			const result = runWrangler(
				"versions deploy 10000000-0000-0000-0000-000000000000 --percentage 101 --yes"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: Percentage value (101%) must be between 0 and 100.]`
			);

			expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`""`);
		});

		test("fails if --percentage < 0", async () => {
			const result = runWrangler(
				"versions deploy 10000000-0000-0000-0000-000000000000 --percentage -1 --yes"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: Percentage value (-1%) must be between 0 and 100.]`
			);

			expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`""`);
		});

		test("fails if version-spec percentage > 100", async () => {
			const result = runWrangler(
				"versions deploy 10000000-0000-0000-0000-000000000000 --percentage 101 --yes"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: Percentage value (101%) must be between 0 and 100.]`
			);

			expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`""`);
		});

		test("fails if version-spec percentage < 0", async () => {
			const result = runWrangler(
				"versions deploy 10000000-0000-0000-0000-000000000000 --percentage -1 --yes"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: Percentage value (-1%) must be between 0 and 100.]`
			);

			expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`""`);
		});

		describe("multi-env warning", () => {
			it("should warn if the wrangler config contains environments but none was specified in the command", async () => {
				writeWranglerConfig({
					env: {
						test: {},
					},
				});

				await runWrangler(
					"versions deploy 10000000-0000-0000-0000-000000000000 --yes"
				);

				expect(consoleStd.warn).toMatchInlineSnapshot(`
					"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mMultiple environments are defined in the Wrangler configuration file, but no target environment was specified for the versions deploy command.[0m

					  To avoid unintentional changes to the wrong environment, it is recommended to explicitly specify
					  the target environment using the \`-e|--env\` flag.
					  If your intention is to use the top-level environment of your configuration simply pass an empty
					  string to the flag to target such environment. For example \`--env=""\`.

					"
				`);
			});

			it("should not warn if the wrangler config contains environments and one was specified in the command", async () => {
				writeWranglerConfig({
					env: {
						test: {},
					},
				});

				await runWrangler(
					"versions deploy 10000000-0000-0000-0000-000000000000 --yes --env test"
				);

				expect(consoleStd.warn).toMatchInlineSnapshot(`""`);
			});

			it("should not warn if the wrangler config doesn't contain environments and none was specified in the command", async () => {
				writeWranglerConfig();

				await runWrangler(
					"versions deploy 10000000-0000-0000-0000-000000000000 --yes"
				);

				expect(consoleStd.warn).toMatchInlineSnapshot(`""`);
			});
		});
	});
});

describe("units", () => {
	describe("parseVersionSpecs", () => {
		test("no args", () => {
			const result = parseVersionSpecs({});

			expect(result).toMatchObject(new Map());
		});

		test("1 positional arg", () => {
			const result = parseVersionSpecs({
				versionSpecs: ["10000000-0000-0000-0000-000000000000@10%"],
			});

			expect(Object.fromEntries(result)).toMatchObject({
				"10000000-0000-0000-0000-000000000000": 10,
			});
		});
		test("2 positional args", () => {
			const result = parseVersionSpecs({
				versionSpecs: [
					"10000000-0000-0000-0000-000000000000@10%",
					"20000000-0000-0000-0000-000000000000@90%",
				],
			});

			expect(Object.fromEntries(result)).toMatchObject({
				"10000000-0000-0000-0000-000000000000": 10,
				"20000000-0000-0000-0000-000000000000": 90,
			});
		});

		test("1 pair of named args", () => {
			const result = parseVersionSpecs({
				percentage: [10],
				versionId: ["10000000-0000-0000-0000-000000000000"],
			});

			expect(Object.fromEntries(result)).toMatchObject({
				"10000000-0000-0000-0000-000000000000": 10,
			});
		});
		test("2 pairs of named args", () => {
			const result = parseVersionSpecs({
				percentage: [10, 90],
				versionId: [
					"10000000-0000-0000-0000-000000000000",
					"20000000-0000-0000-0000-000000000000",
				],
			});

			expect(Object.fromEntries(result)).toMatchObject({
				"10000000-0000-0000-0000-000000000000": 10,
				"20000000-0000-0000-0000-000000000000": 90,
			});
		});
		test("unpaired named args", () => {
			const result = parseVersionSpecs({
				percentage: [10],
				versionId: [
					"10000000-0000-0000-0000-000000000000",
					"20000000-0000-0000-0000-000000000000",
				],
			});

			expect(Object.fromEntries(result)).toMatchObject({
				"10000000-0000-0000-0000-000000000000": 10,
				"20000000-0000-0000-0000-000000000000": null,
			});
		});
	});

	describe("assignAndDistributePercentages distributes remaining share of 100%", () => {
		test.each`
			description                                              | versionIds                  | optionalVersionTraffic | expected
			${"from 1 specified value across 1 unspecified value"}   | ${["v1", "v2"]}             | ${{ v1: 10 }}          | ${{ v1: 10, v2: 90 }}
			${"from 1 specified value across 2 unspecified values"}  | ${["v1", "v2", "v3"]}       | ${{ v1: 10 }}          | ${{ v1: 10, v2: 45, v3: 45 }}
			${"from 2 specified values across 1 unspecified value"}  | ${["v1", "v2", "v3"]}       | ${{ v1: 10, v2: 60 }}  | ${{ v1: 10, v2: 60, v3: 30 }}
			${"from 2 specified values across 2 unspecified values"} | ${["v1", "v2", "v3", "v4"]} | ${{ v1: 10, v2: 60 }}  | ${{ v1: 10, v2: 60, v3: 15, v4: 15 }}
			${"limited to specified versionIds"}                     | ${["v1", "v3"]}             | ${{ v1: 10, v2: 70 }}  | ${{ v1: 10, v3: 90 }}
			${"zero when no share remains"}                          | ${["v1", "v2", "v3"]}       | ${{ v1: 10, v2: 90 }}  | ${{ v1: 10, v2: 90, v3: 0 }}
			${"unchanged when fully specified (adding to 100)"}      | ${["v1", "v2"]}             | ${{ v1: 10, v2: 90 }}  | ${{ v1: 10, v2: 90 }}
			${"unchanged when fully specified (adding to < 100)"}    | ${["v1", "v2"]}             | ${{ v1: 10, v2: 20 }}  | ${{ v1: 10, v2: 20 }}
		`(" $description", ({ versionIds, optionalVersionTraffic, expected }) => {
			const result = assignAndDistributePercentages(
				versionIds,
				new Map(Object.entries(optionalVersionTraffic))
			);

			expect(Object.fromEntries(result)).toMatchObject(expected);
		});
	});

	describe("summariseVersionTraffic", () => {
		test("none unspecified", () => {
			const result = summariseVersionTraffic(
				new Map(
					Object.entries({
						v1: 10,
						v2: 90,
					})
				),
				["v1", "v2"]
			);

			expect(result).toMatchObject({
				subtotal: 100,
				unspecifiedCount: 0,
			});
		});

		test("subtotal above 100", () => {
			const result = summariseVersionTraffic(
				new Map(
					Object.entries({
						v1: 30,
						v2: 90,
					})
				),
				["v1", "v2"]
			);

			expect(result).toMatchObject({
				subtotal: 120,
				unspecifiedCount: 0,
			});
		});

		test("subtotal below 100", () => {
			const result = summariseVersionTraffic(
				new Map(
					Object.entries({
						v1: 10,
						v2: 50,
					})
				),
				["v1", "v2"]
			);

			expect(result).toMatchObject({
				subtotal: 60,
				unspecifiedCount: 0,
			});
		});

		test("counts unspecified", () => {
			const result = summariseVersionTraffic(
				new Map(
					Object.entries({
						v1: 10,
						v2: 50,
					})
				),
				["v1", "v2", "v3", "v4"]
			);

			expect(result).toMatchObject({
				subtotal: 60,
				unspecifiedCount: 2,
			});
		});
	});

	describe("validateTrafficSubtotal", () => {
		test("errors if subtotal above max", () => {
			expect(() =>
				validateTrafficSubtotal(101, { min: 0, max: 100 })
			).toThrowErrorMatchingInlineSnapshot(
				`[Error: Sum of specified percentages (101%) must be at most 100%]`
			);
		});
		test("errors if subtotal below min", () => {
			expect(() =>
				validateTrafficSubtotal(-1, { min: 0, max: 100 })
			).toThrowErrorMatchingInlineSnapshot(
				`[Error: Sum of specified percentages (-1%) must be at least 0%]`
			);
		});
		test("different error message if min === max", () => {
			expect(() =>
				validateTrafficSubtotal(101, { min: 100, max: 100 })
			).toThrowErrorMatchingInlineSnapshot(
				`[Error: Sum of specified percentages (101%) must be 100%]`
			);
		});
		test("no error if subtotal above max but not above max + EPSILON", () => {
			expect(() => validateTrafficSubtotal(100.001)).not.toThrow();

			expect(() =>
				validateTrafficSubtotal(100.01)
			).toThrowErrorMatchingInlineSnapshot(
				`[Error: Sum of specified percentages (100.01%) must be 100%]`
			);
		});
		test("no error if subtotal below min but not below min - EPSILON", () => {
			expect(() => validateTrafficSubtotal(99.999)).not.toThrow();

			expect(() =>
				validateTrafficSubtotal(99.99)
			).toThrowErrorMatchingInlineSnapshot(
				`[Error: Sum of specified percentages (99.99%) must be 100%]`
			);
		});
	});
});
