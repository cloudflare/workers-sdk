import { INCONSISTENT_EXPORTS_ACROSS_VERSIONS_CODE } from "@cloudflare/deploy-helpers";
import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, it, test, vi } from "vitest";
import { normalizeOutput } from "../../../e2e/helpers/normalize";
import {
	assignAndDistributePercentages,
	parseTagSpecs,
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
	createFetchResult,
	msw,
	mswGetVersion,
	mswListNewDeployments,
	mswListVersions,
	mswPatchNonVersionedScriptSettings,
	mswPostNewDeployment,
	mswSuccessDeploymentScriptMetadata,
} from "../helpers/msw";
import { mswListNewDeploymentsLatestFiftyFifty } from "../helpers/msw/handlers/versions";
import { runWrangler } from "../helpers/run-wrangler";
import { writeWorkerSource } from "../helpers/write-worker-source";

// MSW handler that returns the full annotations for version 30000000-... when
// fetched individually (GET /versions/:id). The generic mswGetVersion() mock
// returns no annotations, but the real API returns the same data as the list
// endpoint. Used in tests that skip fetchDeployableVersions (--yes + explicit IDs).
const mswGetVersion30000000 = http.get(
	"*/accounts/:accountId/workers/scripts/:workerName/versions/30000000-0000-0000-0000-000000000000",
	() =>
		HttpResponse.json(
			createFetchResult({
				id: "30000000-0000-0000-0000-000000000000",
				number: "NCC-74656",
				annotations: {
					"workers/triggered_by": "rollback",
					"workers/rollback_from": "MOCK-DEPLOYMENT-ID-1111",
					"workers/message": "Rolled back for this version",
				},
				metadata: {
					author_id: "Kathryn-Jane-Gamma-6-0-7-3",
					author_email: "Kathryn-Janeway@federation.org",
					source: "wrangler",
					created_on: "2021-02-02T00:00:00.000000Z",
					modified_on: "2021-02-02T00:00:00.000000Z",
				},
				resources: {
					bindings: [],
					script: {
						etag: "aaabbbccc",
						handlers: ["fetch"],
						last_deployed_from: "api",
					},
					script_runtime: {
						compatibility_date: "2020-01-01",
						compatibility_flags: [],
						usage_model: "standard",
						limits: { cpu_ms: 50 },
					},
				},
			})
		)
);

// MSW handler for the deployable-versions endpoint (GET /versions?deployable=true)
// returning versions that carry `workers/tag` annotations, used to test
// `versions deploy --version-tag <version-tag>`.
const mswListVersionsWithTags = http.get(
	"*/accounts/:accountId/workers/scripts/:workerName/versions",
	() =>
		HttpResponse.json(
			createFetchResult({
				items: [
					{
						id: "10000000-0000-0000-0000-000000000000",
						number: "1",
						annotations: {
							"workers/triggered_by": "upload",
							"workers/tag": "abc1234",
						},
						metadata: {
							author_id: "Picard-Gamma-6-0-7-3",
							author_email: "Jean-Luc-Picard@federation.org",
							source: "wrangler",
							created_on: "2021-01-01T00:00:00.000000Z",
							modified_on: "2021-01-01T00:00:00.000000Z",
						},
					},
					{
						id: "20000000-0000-0000-0000-000000000000",
						number: "2",
						annotations: {
							"workers/triggered_by": "upload",
							"workers/tag": "def5678",
						},
						metadata: {
							author_id: "Picard-Gamma-6-0-7-3",
							author_email: "Jean-Luc-Picard@federation.org",
							source: "wrangler",
							created_on: "2021-01-02T00:00:00.000000Z",
							modified_on: "2021-01-02T00:00:00.000000Z",
						},
					},
				],
			})
		)
);

// MSW handler where two deployable versions share the same `workers/tag`,
// used to test the ambiguity error.
const mswListVersionsWithDuplicateTags = http.get(
	"*/accounts/:accountId/workers/scripts/:workerName/versions",
	() =>
		HttpResponse.json(
			createFetchResult({
				items: [
					{
						id: "10000000-0000-0000-0000-000000000000",
						number: "1",
						annotations: {
							"workers/triggered_by": "upload",
							"workers/tag": "dupe",
						},
						metadata: {
							author_id: "Picard-Gamma-6-0-7-3",
							author_email: "Jean-Luc-Picard@federation.org",
							source: "wrangler",
							created_on: "2021-01-01T00:00:00.000000Z",
							modified_on: "2021-01-01T00:00:00.000000Z",
						},
					},
					{
						id: "20000000-0000-0000-0000-000000000000",
						number: "2",
						annotations: {
							"workers/triggered_by": "upload",
							"workers/tag": "dupe",
						},
						metadata: {
							author_id: "Picard-Gamma-6-0-7-3",
							author_email: "Jean-Luc-Picard@federation.org",
							source: "wrangler",
							created_on: "2021-01-02T00:00:00.000000Z",
							modified_on: "2021-01-02T00:00:00.000000Z",
						},
					},
				],
			})
		)
);

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
		test("should warn user when worker has deployment with multiple versions", async ({
			expect,
		}) => {
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
		test("succeeds with --name arg", async ({ expect }) => {
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
				├ Fetching versions
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

		test("fails without --name arg", async ({ expect }) => {
			const result = runWrangler(
				"versions deploy 10000000-0000-0000-0000-000000000000 --yes"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: You need to provide a name for your Worker. Either pass it as a CLI arg with \`--name <name>\` or set the \`name\` field in your Wrangler configuration file (e.g. wrangler.json).]`
			);
		});
	});

	describe("with wrangler.toml", () => {
		beforeEach(() => writeWranglerConfig());

		test("no args", async ({ expect }) => {
			const result = runWrangler("versions deploy --yes");

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: You must select at least 1 version to deploy. Provide a version using positional args (e.g. \`wrangler versions deploy <version-id>\`), --version-id, or --version-tag.]`
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
				├ Fetching versions
				│
				├ Which version(s) do you want to deploy?
				├ 0 Worker Version(s) selected
				│"
			`);
		});

		test("1 version @ (implicit) 100%", async ({ expect }) => {
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
				├ Fetching versions
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

		test("1 version @ (implicit) 100% without --yes", async ({ expect }) => {
			const result = runWrangler(
				"versions deploy 10000000-0000-0000-0000-000000000000"
			);

			await expect(result).resolves.toBeUndefined();

			const output = normalizeOutput(cliStd.out);
			expect(output).toContain(
				"SUCCESS  Deployed test-name version 00000000-0000-0000-0000-000000000000 at 100%"
			);
			expect(output).not.toContain(
				"Use SPACE to select/unselect version(s) and ENTER to submit."
			);
		});

		test("1 version @ (explicit) 100%", async ({ expect }) => {
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
				├ Fetching versions
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

		test("2 versions @ (implicit) 50% each", async ({ expect }) => {
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
				├ Fetching versions
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

		test("1 version @ (explicit) 100%", async ({ expect }) => {
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
				├ Fetching versions
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

		test("2 versions @ (explicit) 30% + (implicit) 70%", async ({ expect }) => {
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
				├ Fetching versions
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

		test("2 versions @ (explicit) 40% + (explicit) 60%", async ({ expect }) => {
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
				├ Fetching versions
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

		test("2 versions @ (explicit) 40% + (explicit) 60% without --yes", async ({
			expect,
		}) => {
			const result = runWrangler(
				"versions deploy 10000000-0000-0000-0000-000000000000@40% 20000000-0000-0000-0000-000000000000@60%"
			);

			await expect(result).resolves.toBeUndefined();

			const output = normalizeOutput(cliStd.out);
			expect(output).toContain(
				"SUCCESS  Deployed test-name version 00000000-0000-0000-0000-000000000000 at 40% and version 00000000-0000-0000-0000-000000000000 at 60%"
			);
			expect(output).not.toContain(
				"Use SPACE to select/unselect version(s) and ENTER to submit."
			);
		});

		test("--version-id and --percentage without --yes", async ({ expect }) => {
			const result = runWrangler(
				"versions deploy --version-id 10000000-0000-0000-0000-000000000000 --percentage 100"
			);

			await expect(result).resolves.toBeUndefined();

			const output = normalizeOutput(cliStd.out);
			expect(output).toContain(
				"SUCCESS  Deployed test-name version 00000000-0000-0000-0000-000000000000 at 100%"
			);
			expect(output).not.toContain(
				"Use SPACE to select/unselect version(s) and ENTER to submit."
			);
		});

		describe("max versions restrictions (temp)", () => {
			test("2+ versions fails", async ({ expect }) => {
				msw.use(mswGetVersion30000000);
				const result = runWrangler(
					"versions deploy 10000000-0000-0000-0000-000000000000 20000000-0000-0000-0000-000000000000 30000000-0000-0000-0000-000000000000 --yes"
				);

				await expect(result).rejects.toMatchInlineSnapshot(
					`[Error: Too many versions selected. You can deploy at most 2 version(s) at a time. Please remove some versions and try again.]`
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
					├ Fetching versions
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

			test("--max-versions allows > 2 versions", async ({ expect }) => {
				msw.use(mswGetVersion30000000);
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
					├ Fetching versions
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

		test("with a message", async ({ expect }) => {
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
				├ Fetching versions
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

		test("with logpush in wrangler.toml", async ({ expect }) => {
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
				├ Fetching versions
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

		test("with observability disabled in wrangler.toml", async ({ expect }) => {
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
				├ Fetching versions
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

		test("with logpush, tail_consumers, and observability in wrangler.toml", async ({
			expect,
		}) => {
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
				├ Fetching versions
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

		test("with logpush, streaming_tail_consumers, and observability in wrangler.toml", async ({
			expect,
		}) => {
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
				├ Fetching versions
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

		test("fails for non-existent versionId", async ({ expect }) => {
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
				├ Fetching versions
				│"
			`);
		});

		test("fails if --percentage > 100", async ({ expect }) => {
			const result = runWrangler(
				"versions deploy 10000000-0000-0000-0000-000000000000 --percentage 101 --yes"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: The --percentage value 101% is out of range. Percentages must be between 0 and 100.]`
			);

			expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`""`);
		});

		test("fails if --percentage < 0", async ({ expect }) => {
			const result = runWrangler(
				"versions deploy 10000000-0000-0000-0000-000000000000 --percentage -1 --yes"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: The --percentage value -1% is out of range. Percentages must be between 0 and 100.]`
			);

			expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`""`);
		});

		test("fails if version-spec percentage > 100", async ({ expect }) => {
			const result = runWrangler(
				"versions deploy 10000000-0000-0000-0000-000000000000 --percentage 101 --yes"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: The --percentage value 101% is out of range. Percentages must be between 0 and 100.]`
			);

			expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`""`);
		});

		test("fails if version-spec percentage < 0", async ({ expect }) => {
			const result = runWrangler(
				"versions deploy 10000000-0000-0000-0000-000000000000 --percentage -1 --yes"
			);

			await expect(result).rejects.toMatchInlineSnapshot(
				`[Error: The --percentage value -1% is out of range. Percentages must be between 0 and 100.]`
			);

			expect(normalizeOutput(cliStd.out)).toMatchInlineSnapshot(`""`);
		});

		describe("multi-env warning", () => {
			it("should warn if the wrangler config contains environments but none was specified in the command", async ({
				expect,
			}) => {
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
					  the target environment using the \`-e|--env\` flag or CLOUDFLARE_ENV env variable.
					  If your intention is to use the top-level environment of your configuration simply pass an empty
					  string to the flag to target such environment. For example \`--env=""\`.

					"
				`);
			});

			it("should not warn if the wrangler config contains environments and one was specified in the command", async ({
				expect,
			}) => {
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

			it("should not warn if the wrangler config doesn't contain environments and none was specified in the command", async ({
				expect,
			}) => {
				writeWranglerConfig();

				await runWrangler(
					"versions deploy 10000000-0000-0000-0000-000000000000 --yes"
				);

				expect(consoleStd.warn).toMatchInlineSnapshot(`""`);
			});

			it("should not warn if the wrangler config contains environments and CLOUDFLARE_ENV is set", async ({
				expect,
			}) => {
				vi.stubEnv("CLOUDFLARE_ENV", "test");
				writeWranglerConfig({
					env: {
						test: {},
					},
				});

				await runWrangler(
					"versions deploy 10000000-0000-0000-0000-000000000000 --yes"
				);

				expect(consoleStd.warn).toMatchInlineSnapshot(`""`);
			});

			it('should not warn if --env="" is passed to explicitly target the top-level environment', async ({
				expect,
			}) => {
				writeWranglerConfig({
					env: {
						test: {},
					},
				});

				await runWrangler(
					'versions deploy 10000000-0000-0000-0000-000000000000 --yes --env=""'
				);

				expect(consoleStd.warn).toMatchInlineSnapshot(`""`);
			});
		});

		describe("deploy by tag", () => {
			type DeployedVersion = { version_id: string; percentage: number };

			// Captures the versions sent to the create-deployment endpoint so we can
			// assert that the tag was resolved to the correct Version ID.
			function captureDeployment() {
				const captured: { versions?: DeployedVersion[] } = {};
				msw.use(
					http.post(
						"*/accounts/:accountId/workers/scripts/:workerName/deployments",
						async ({ request }) => {
							const body = (await request.json()) as {
								versions: DeployedVersion[];
							};
							captured.versions = body.versions;
							return HttpResponse.json(
								createFetchResult({ id: "mock-new-deployment-id" })
							);
						}
					)
				);
				return captured;
			}

			test("resolves a single tag to its Version ID and deploys it", async ({
				expect,
			}) => {
				writeWranglerConfig();
				msw.use(mswListVersionsWithTags);
				const captured = captureDeployment();

				await expect(
					runWrangler("versions deploy --version-tag def5678@100% --yes")
				).resolves.toBeUndefined();

				expect(captured.versions).toEqual([
					{
						version_id: "20000000-0000-0000-0000-000000000000",
						percentage: 100,
					},
				]);

				const output = normalizeOutput(cliStd.out);
				expect(output).toContain("Resolving tags to versions");
				expect(output).toContain("SUCCESS  Deployed test-name version");
			});

			test("splits traffic between multiple tags using shorthand percentages", async ({
				expect,
			}) => {
				writeWranglerConfig();
				msw.use(mswListVersionsWithTags);
				const captured = captureDeployment();

				await expect(
					runWrangler(
						"versions deploy --version-tag abc1234@40% --version-tag def5678@60% --yes"
					)
				).resolves.toBeUndefined();

				expect(captured.versions).toEqual([
					{
						version_id: "10000000-0000-0000-0000-000000000000",
						percentage: 40,
					},
					{
						version_id: "20000000-0000-0000-0000-000000000000",
						percentage: 60,
					},
				]);
			});

			test("can be combined with a Version ID", async ({ expect }) => {
				writeWranglerConfig();
				msw.use(mswListVersionsWithTags);
				const captured = captureDeployment();

				await expect(
					runWrangler(
						"versions deploy 10000000-0000-0000-0000-000000000000@30% --version-tag def5678@70% --yes"
					)
				).resolves.toBeUndefined();

				expect(captured.versions).toEqual([
					{
						version_id: "10000000-0000-0000-0000-000000000000",
						percentage: 30,
					},
					{
						version_id: "20000000-0000-0000-0000-000000000000",
						percentage: 70,
					},
				]);
			});

			test("errors when no deployable version matches the tag", async ({
				expect,
			}) => {
				writeWranglerConfig();
				msw.use(mswListVersionsWithTags);

				await expect(
					runWrangler("versions deploy --version-tag nope@100% --yes")
				).rejects.toMatchInlineSnapshot(`
					[Error: No deployable version found with tag "nope".
					Tags can only be resolved against recent (deployable) versions. Run \`wrangler versions list\` to see available versions, or deploy by Version ID directly.]
				`);
			});

			test("errors when a tag matches multiple versions", async ({
				expect,
			}) => {
				writeWranglerConfig();
				msw.use(mswListVersionsWithDuplicateTags);

				await expect(
					runWrangler("versions deploy --version-tag dupe@100% --yes")
				).rejects.toMatchInlineSnapshot(`
					[Error: Tag "dupe" matches multiple versions:
					  - 20000000-0000-0000-0000-000000000000
					  - 10000000-0000-0000-0000-000000000000
					Deploy by Version ID directly to disambiguate.]
				`);
			});
		});

		describe("EWC error mapping", () => {
			// EWC server message from
			// edgeworker-config-service!9919 — surfaced verbatim by wrangler
			// before the renderer appends actionable next-steps.
			const serverMessage =
				"All versions in a multi-version deployment must declare identical `exports`. Deploy the version that changes `exports` at 100% first, then split traffic.";

			test("surfaces a friendly error when EWC rejects multi-version exports as inconsistent (code 100405)", async ({
				expect,
			}) => {
				writeWranglerConfig();

				msw.use(
					http.post(
						"*/accounts/:accountId/workers/scripts/:scriptName/deployments",
						() =>
							HttpResponse.json(
								createFetchResult(null, false, [
									{
										code: INCONSISTENT_EXPORTS_ACROSS_VERSIONS_CODE,
										message: serverMessage,
									},
								]),
								{ status: 400 }
							),
						{ once: true }
					)
				);

				await expect(
					runWrangler(
						"versions deploy 10000000-0000-0000-0000-000000000000@50% 20000000-0000-0000-0000-000000000000@50% --yes"
					)
				).rejects.toThrow(
					// Both the server message and the suggested next-step
					// should appear in the final user-facing error.
					/Deploy the version that changes `exports` at 100% first[\s\S]*wrangler versions deploy <new-version-id>@100%/
				);
			});

			test("includes a link to the gradual-deployments docs", async ({
				expect,
			}) => {
				writeWranglerConfig();

				msw.use(
					http.post(
						"*/accounts/:accountId/workers/scripts/:scriptName/deployments",
						() =>
							HttpResponse.json(
								createFetchResult(null, false, [
									{
										code: INCONSISTENT_EXPORTS_ACROSS_VERSIONS_CODE,
										message: serverMessage,
									},
								]),
								{ status: 400 }
							),
						{ once: true }
					)
				);

				await expect(
					runWrangler(
						"versions deploy 10000000-0000-0000-0000-000000000000@50% 20000000-0000-0000-0000-000000000000@50% --yes"
					)
				).rejects.toThrow(
					/developers\.cloudflare\.com\/workers\/configuration\/versions-and-deployments\/gradual-deployments/
				);
			});

			test("does not remap unrelated EWC errors", async ({ expect }) => {
				writeWranglerConfig();

				// A different EWC error code must pass through untransformed —
				// the catch block falls through to `throw e`, surfacing the
				// original APIError (and its notes) from the cfetch layer.
				msw.use(
					http.post(
						"*/accounts/:accountId/workers/scripts/:scriptName/deployments",
						() =>
							HttpResponse.json(
								createFetchResult(null, false, [
									{
										code: 10001,
										message: "some other API error",
									},
								]),
								{ status: 500 }
							)
					)
				);

				// The original API error is re-thrown verbatim — its `.message`
				// is the request-URL line. Most importantly the friendly
				// "What to do" copy is NOT applied to unrelated codes.
				const rejection = runWrangler(
					"versions deploy 10000000-0000-0000-0000-000000000000@50% 20000000-0000-0000-0000-000000000000@50% --yes"
				);
				await expect(rejection).rejects.toThrow(
					/A request to the Cloudflare API .* failed/
				);
				await expect(rejection).rejects.not.toThrow(
					/Deploy the version that changes `exports` at 100% first/
				);
			});
		});
	});
});

describe("units", () => {
	describe("parseVersionSpecs", () => {
		test("no args", ({ expect }) => {
			const result = parseVersionSpecs({});

			expect(result).toMatchObject(new Map());
		});

		test("1 positional arg", ({ expect }) => {
			const result = parseVersionSpecs({
				versionSpecs: ["10000000-0000-0000-0000-000000000000@10%"],
			});

			expect(Object.fromEntries(result)).toMatchObject({
				"10000000-0000-0000-0000-000000000000": 10,
			});
		});
		test("2 positional args", ({ expect }) => {
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

		test("1 pair of named args", ({ expect }) => {
			const result = parseVersionSpecs({
				percentage: [10],
				versionId: ["10000000-0000-0000-0000-000000000000"],
			});

			expect(Object.fromEntries(result)).toMatchObject({
				"10000000-0000-0000-0000-000000000000": 10,
			});
		});
		test("2 pairs of named args", ({ expect }) => {
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
		test("unpaired named args", ({ expect }) => {
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

	describe("parseTagSpecs", () => {
		test("no args", ({ expect }) => {
			const result = parseTagSpecs({});

			expect(result).toMatchObject(new Map());
		});

		test("tag without percentage", ({ expect }) => {
			const result = parseTagSpecs({ versionTag: ["abc1234"] });

			expect(Object.fromEntries(result)).toMatchObject({ abc1234: null });
		});

		test("tag with percentage shorthand", ({ expect }) => {
			const result = parseTagSpecs({ versionTag: ["abc1234@100%"] });

			expect(Object.fromEntries(result)).toMatchObject({ abc1234: 100 });
		});

		test("multiple tags with percentages", ({ expect }) => {
			const result = parseTagSpecs({
				versionTag: ["abc1234@40%", "def5678@60%"],
			});

			expect(Object.fromEntries(result)).toMatchObject({
				abc1234: 40,
				def5678: 60,
			});
		});

		test("tag containing @ with a percentage splits on the last @", ({
			expect,
		}) => {
			const result = parseTagSpecs({ versionTag: ["v1.0@beta@100%"] });

			expect(Object.fromEntries(result)).toMatchObject({ "v1.0@beta": 100 });
		});

		test("tag containing @ without a percentage is kept whole", ({
			expect,
		}) => {
			const result = parseTagSpecs({ versionTag: ["v1.0@beta"] });

			expect(Object.fromEntries(result)).toMatchObject({ "v1.0@beta": null });
		});

		test("trailing @ keeps a percentage-like tag whole with no percentage", ({
			expect,
		}) => {
			const result = parseTagSpecs({ versionTag: ["build@2@"] });

			expect(Object.fromEntries(result)).toMatchObject({ "build@2": null });
		});

		test("throws on empty tag", ({ expect }) => {
			expect(() => parseTagSpecs({ versionTag: ["@100%"] })).toThrow(
				`Could not parse a tag from --version-tag arg "@100%".`
			);
		});

		test("throws on out-of-range percentage", ({ expect }) => {
			expect(() => parseTagSpecs({ versionTag: ["abc1234@101%"] })).toThrow(
				`Percentage value 101% (from --version-tag arg "abc1234@101%") is out of range. Percentages must be between 0 and 100.`
			);
		});

		test("treats a non-numeric @ suffix as part of the tag", ({ expect }) => {
			const result = parseTagSpecs({ versionTag: ["abc1234@oops"] });

			expect(Object.fromEntries(result)).toMatchObject({
				"abc1234@oops": null,
			});
		});
	});

	describe("assignAndDistributePercentages distributes remaining share of 100%", () => {
		test.for([
			{
				description: "from 1 specified value across 1 unspecified value",
				versionIds: ["v1", "v2"],
				optionalVersionTraffic: { v1: 10 },
				expected: { v1: 10, v2: 90 },
			},
			{
				description: "from 1 specified value across 2 unspecified values",
				versionIds: ["v1", "v2", "v3"],
				optionalVersionTraffic: { v1: 10 },
				expected: { v1: 10, v2: 45, v3: 45 },
			},
			{
				description: "from 2 specified values across 1 unspecified value",
				versionIds: ["v1", "v2", "v3"],
				optionalVersionTraffic: { v1: 10, v2: 60 },
				expected: { v1: 10, v2: 60, v3: 30 },
			},
			{
				description: "from 2 specified values across 2 unspecified values",
				versionIds: ["v1", "v2", "v3", "v4"],
				optionalVersionTraffic: { v1: 10, v2: 60 },
				expected: { v1: 10, v2: 60, v3: 15, v4: 15 },
			},
			{
				description: "limited to specified versionIds",
				versionIds: ["v1", "v3"],
				optionalVersionTraffic: { v1: 10, v2: 70 },
				expected: { v1: 10, v3: 90 },
			},
			{
				description: "zero when no share remains",
				versionIds: ["v1", "v2", "v3"],
				optionalVersionTraffic: { v1: 10, v2: 90 },
				expected: { v1: 10, v2: 90, v3: 0 },
			},
			{
				description: "unchanged when fully specified (adding to 100)",
				versionIds: ["v1", "v2"],
				optionalVersionTraffic: { v1: 10, v2: 90 },
				expected: { v1: 10, v2: 90 },
			},
			{
				description: "unchanged when fully specified (adding to < 100)",
				versionIds: ["v1", "v2"],
				optionalVersionTraffic: { v1: 10, v2: 20 },
				expected: { v1: 10, v2: 20 },
			},
		])(
			" $description",
			({ versionIds, optionalVersionTraffic, expected }, { expect }) => {
				const result = assignAndDistributePercentages(
					versionIds,
					new Map(Object.entries(optionalVersionTraffic))
				);

				expect(Object.fromEntries(result)).toMatchObject(expected);
			}
		);
	});

	describe("summariseVersionTraffic", () => {
		test("none unspecified", ({ expect }) => {
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

		test("subtotal above 100", ({ expect }) => {
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

		test("subtotal below 100", ({ expect }) => {
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

		test("counts unspecified", ({ expect }) => {
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
		test("errors if subtotal above max", ({ expect }) => {
			expect(() =>
				validateTrafficSubtotal(101, { min: 0, max: 100 })
			).toThrowErrorMatchingInlineSnapshot(
				`[Error: The specified traffic percentages add up to 101%, which exceeds the maximum of 100%. Reduce one or more percentages so they sum to at most 100%.]`
			);
		});
		test("errors if subtotal below min", ({ expect }) => {
			expect(() =>
				validateTrafficSubtotal(-1, { min: 0, max: 100 })
			).toThrowErrorMatchingInlineSnapshot(
				`[Error: The specified traffic percentages add up to -1%, which is below the minimum of 0%. Increase one or more percentages so they sum to at least 0%.]`
			);
		});
		test("different error message if min === max", ({ expect }) => {
			expect(() =>
				validateTrafficSubtotal(101, { min: 100, max: 100 })
			).toThrowErrorMatchingInlineSnapshot(
				`[Error: The specified traffic percentages add up to 101%, but must total exactly 100%. Adjust the --percentage values or version-spec percentages so they sum to 100%.]`
			);
		});
		test("no error if subtotal above max but not above max + EPSILON", ({
			expect,
		}) => {
			expect(() => validateTrafficSubtotal(100.001)).not.toThrow();

			expect(() =>
				validateTrafficSubtotal(100.01)
			).toThrowErrorMatchingInlineSnapshot(
				`[Error: The specified traffic percentages add up to 100.01%, but must total exactly 100%. Adjust the --percentage values or version-spec percentages so they sum to 100%.]`
			);
		});
		test("no error if subtotal below min but not below min - EPSILON", ({
			expect,
		}) => {
			expect(() => validateTrafficSubtotal(99.999)).not.toThrow();

			expect(() =>
				validateTrafficSubtotal(99.99)
			).toThrowErrorMatchingInlineSnapshot(
				`[Error: The specified traffic percentages add up to 99.99%, but must total exactly 100%. Adjust the --percentage values or version-spec percentages so they sum to 100%.]`
			);
		});
	});
});
