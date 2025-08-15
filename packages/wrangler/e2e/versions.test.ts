import { readFile } from "fs/promises";
import path from "path";
import dedent from "ts-dedent";
import { beforeAll, describe, expect, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";
import { normalizeOutput } from "./helpers/normalize";

function matchVersionId(stdout: string): string {
	return stdout.match(/Version ID:\s+([a-f\d-]+)/)?.[1] as string;
}
function countOccurrences(stdout: string, substring: string) {
	return stdout.split(substring).length - 1;
}

const TIMEOUT = 50_000;
const workerName = generateResourceName();
const normalize = (str: string) =>
	normalizeOutput(str, {
		[CLOUDFLARE_ACCOUNT_ID]: "CLOUDFLARE_ACCOUNT_ID",
	}).replaceAll(/^Author:.*$/gm, "Author:      person@example.com");

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)(
	"versions deploy",
	{ timeout: TIMEOUT },
	() => {
		let versionId0: string;
		let versionId1: string;
		let versionId2: string;
		let helper: WranglerE2ETestHelper;

		beforeAll(async () => {
			helper = new WranglerE2ETestHelper();
			await helper.seed({
				"wrangler.toml": dedent`
							name = "${workerName}"
							main = "src/index.ts"
							compatibility_date = "2023-01-01"
					`,
				"src/index.ts": dedent`
							export default {
								fetch(request) {
									return new Response("Hello World!")
								}
							}`,
				"package.json": dedent`
							{
								"name": "${workerName}",
								"version": "0.0.0",
								"private": true
							}
							`,
			});
			// TEMP: regular deploy needed for the first time to *create* the worker (will create 1 extra version + deployment in snapshots below)
			const deploy = await helper.run("wrangler deploy");
			versionId0 = matchVersionId(deploy.stdout);
		}, 30_000);

		it("should upload 1st Worker version", async () => {
			const upload = await helper.run(
				`wrangler versions upload --message "Upload via e2e test" --tag "e2e-upload"`
			);

			versionId1 = matchVersionId(upload.stdout);

			expect(normalize(upload.stdout)).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: (TIMINGS)
			Uploaded tmp-e2e-worker-00000000-0000-0000-0000-000000000000 (TIMINGS)
			Worker Version ID: 00000000-0000-0000-0000-000000000000
			Version Preview URL: https://tmp-e2e-worker-PREVIEW-URL.SUBDOMAIN.workers.dev
			To deploy this version to production traffic use the command wrangler versions deploy
			Changes to non-versioned settings (config properties 'logpush' or 'tail_consumers') take effect after your next deployment using the command wrangler versions deploy
			Changes to triggers (routes, custom domains, cron schedules, etc) must be applied with the command wrangler triggers deploy"
		`);
		});

		it("should list 1 version", async () => {
			const list = await helper.run(`wrangler versions list`);

			expect(normalize(list.stdout)).toMatchInlineSnapshot(`
			"Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Upload
			Tag:         -
			Message:     -
			Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (version_upload)
			Tag:         e2e-upload
			Message:     Upload via e2e test"
		`);

			expect(list.stdout).toMatch(/Message:\s+Upload via e2e test/);
			expect(list.stdout).toMatch(/Tag:\s+e2e-upload/);
		});

		it("should deploy 1st Worker version", async () => {
			const deploy = await helper.run(
				`wrangler versions deploy ${versionId1}@100% --message "Deploy via e2e test" --yes`
			);

			expect(normalize(deploy.stdout)).toMatchInlineSnapshot(`
			"╭ Deploy Worker Versions by splitting traffic between multiple versions
			│
			├ Fetching latest deployment
			│
			├ Your current deployment has 1 version(s):
			│
			│ (100%) 00000000-0000-0000-0000-000000000000
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
			│                  Tag:  e2e-upload
			│              Message:  Upload via e2e test
			│
			├ What percentage of traffic should Worker Version 1 receive?
			├ 100% of traffic
			├
			├ Add a deployment message
			│ Deployment message Deploy via e2e test
			│
			├ Deploying 1 version(s)
			│
			│ No non-versioned settings to sync. Skipping...
			│
			╰  SUCCESS  Deployed tmp-e2e-worker-00000000-0000-0000-0000-000000000000 version 00000000-0000-0000-0000-000000000000 at 100% (TIMINGS)"
		`);
		});

		it("should list 1 deployment", async () => {
			const list = await helper.run(`wrangler deployments list`);

			expect(normalize(list.stdout)).toMatchInlineSnapshot(`
			"Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Upload
			Message:     Automatic deployment on upload.
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  -
			                 Message:  -
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     Deploy via e2e test
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  e2e-upload
			                 Message:  Upload via e2e test"
		`);

			expect(list.stdout).toContain(versionId1);
		});

		it("should modify & upload 2nd Worker version", async () => {
			await helper.seed({
				"src/index.ts": dedent`
				export default {
					fetch(request) {
						return new Response("Hello World AGAIN!")
					}
				}`,
			});

			const upload = await helper.run(
				`wrangler versions upload --message "Upload AGAIN via e2e test" --tag "e2e-upload-AGAIN"`
			);

			versionId2 = matchVersionId(upload.stdout);

			expect(normalize(upload.stdout)).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: (TIMINGS)
			Uploaded tmp-e2e-worker-00000000-0000-0000-0000-000000000000 (TIMINGS)
			Worker Version ID: 00000000-0000-0000-0000-000000000000
			Version Preview URL: https://tmp-e2e-worker-PREVIEW-URL.SUBDOMAIN.workers.dev
			To deploy this version to production traffic use the command wrangler versions deploy
			Changes to non-versioned settings (config properties 'logpush' or 'tail_consumers') take effect after your next deployment using the command wrangler versions deploy
			Changes to triggers (routes, custom domains, cron schedules, etc) must be applied with the command wrangler triggers deploy"
		`);

			const versionsList = await helper.run(`wrangler versions list`);

			expect(normalize(versionsList.stdout)).toMatchInlineSnapshot(`
			"Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Upload
			Tag:         -
			Message:     -
			Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (version_upload)
			Tag:         e2e-upload
			Message:     Upload via e2e test
			Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (version_upload)
			Tag:         e2e-upload-AGAIN
			Message:     Upload AGAIN via e2e test"
		`);

			expect(versionsList.stdout).toMatch(
				/Message:\s+Upload AGAIN via e2e test/
			);
			expect(versionsList.stdout).toMatch(/Tag:\s+e2e-upload-AGAIN/);
		});

		it("should deploy 2nd Worker version", async () => {
			const deploy = await helper.run(
				`wrangler versions deploy ${versionId2}@100% --message "Deploy AGAIN via e2e test" --yes`
			);

			const deploymentsList = await helper.run(`wrangler deployments list`);

			expect(normalize(deploy.stdout)).toMatchInlineSnapshot(`
			"╭ Deploy Worker Versions by splitting traffic between multiple versions
			│
			├ Fetching latest deployment
			│
			├ Your current deployment has 1 version(s):
			│
			│ (100%) 00000000-0000-0000-0000-000000000000
			│       Created:  TIMESTAMP
			│           Tag:  e2e-upload
			│       Message:  Upload via e2e test
			│
			├ Fetching deployable versions
			│
			├ Which version(s) do you want to deploy?
			├ 1 Worker Version(s) selected
			│
			├     Worker Version 1:  00000000-0000-0000-0000-000000000000
			│              Created:  TIMESTAMP
			│                  Tag:  e2e-upload-AGAIN
			│              Message:  Upload AGAIN via e2e test
			│
			├ What percentage of traffic should Worker Version 1 receive?
			├ 100% of traffic
			├
			├ Add a deployment message
			│ Deployment message Deploy AGAIN via e2e test
			│
			├ Deploying 1 version(s)
			│
			│ No non-versioned settings to sync. Skipping...
			│
			╰  SUCCESS  Deployed tmp-e2e-worker-00000000-0000-0000-0000-000000000000 version 00000000-0000-0000-0000-000000000000 at 100% (TIMINGS)"
		`);

			// list 2 deployments (+ old deployment)
			expect(normalize(deploymentsList.stdout)).toMatchInlineSnapshot(`
			"Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Upload
			Message:     Automatic deployment on upload.
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  -
			                 Message:  -
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     Deploy via e2e test
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  e2e-upload
			                 Message:  Upload via e2e test
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     Deploy AGAIN via e2e test
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  e2e-upload-AGAIN
			                 Message:  Upload AGAIN via e2e test"
		`);

			expect(countOccurrences(deploymentsList.stdout, versionId0)).toBe(1); // once for regular deploy, only
			expect(countOccurrences(deploymentsList.stdout, versionId1)).toBe(1); // once for versions deploy, only
			expect(countOccurrences(deploymentsList.stdout, versionId2)).toBe(1); // once for versions deploy, only
		});

		it("should rollback to implicit Worker version (1st version)", async () => {
			const rollback = await helper.run(
				`wrangler rollback --message "Rollback via e2e test" --yes`
			);

			const versionsList = await helper.run(`wrangler versions list`);

			const deploymentsList = await helper.run(`wrangler deployments list`);

			expect(normalize(rollback.stdout)).toMatchInlineSnapshot(`
			"├ Fetching latest deployment
			│
			├ Your current deployment has 1 version(s):
			│
			│ (100%) 00000000-0000-0000-0000-000000000000
			│       Created:  TIMESTAMP
			│           Tag:  e2e-upload-AGAIN
			│       Message:  Upload AGAIN via e2e test
			│
			├ Finding latest stable Worker Version to rollback to
			│
			│
			? Please provide an optional message for this rollback (120 characters max)
			🤖 Using default value in non-interactive context: Rollback via e2e test
			│
			├  WARNING  You are about to rollback to Worker Version 00000000-0000-0000-0000-000000000000.
			│ This will immediately replace the current deployment and become the active deployment across all your deployed triggers.
			│ However, your local development environment will not be affected by this rollback.
			│ Rolling back to a previous deployment will not rollback any of the bound resources (Durable Object, D1, R2, KV, etc).
			│
			│ (100%) 00000000-0000-0000-0000-000000000000
			│       Created:  TIMESTAMP
			│           Tag:  e2e-upload
			│       Message:  Upload via e2e test
			│
			? Are you sure you want to deploy this Worker Version to 100% of traffic?
			🤖 Using fallback value in non-interactive context: yes
			Performing rollback...
			│
			╰  SUCCESS  Worker Version 00000000-0000-0000-0000-000000000000 has been deployed to 100% of traffic.
			Current Version ID: 00000000-0000-0000-0000-000000000000"
		`);

			expect(rollback.stdout).toContain(
				`Worker Version ${versionId1} has been deployed to 100% of traffic`
			);

			// list same versions as before (no new versions created)
			expect(normalize(versionsList.stdout)).toMatchInlineSnapshot(`
			"Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Upload
			Tag:         -
			Message:     -
			Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (version_upload)
			Tag:         e2e-upload
			Message:     Upload via e2e test
			Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (version_upload)
			Tag:         e2e-upload-AGAIN
			Message:     Upload AGAIN via e2e test"
		`);

			// list deployments with new rollback deployment of 1st version (1 new deployment created)
			expect(normalize(deploymentsList.stdout)).toMatchInlineSnapshot(`
			"Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Upload
			Message:     Automatic deployment on upload.
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  -
			                 Message:  -
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     Deploy via e2e test
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  e2e-upload
			                 Message:  Upload via e2e test
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     Deploy AGAIN via e2e test
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  e2e-upload-AGAIN
			                 Message:  Upload AGAIN via e2e test
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     Rollback via e2e test
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  e2e-upload
			                 Message:  Upload via e2e test"
		`);

			expect(countOccurrences(deploymentsList.stdout, versionId0)).toBe(1); // once for regular deploy, only
			expect(countOccurrences(deploymentsList.stdout, versionId1)).toBe(2); // once for versions deploy, once for rollback
			expect(countOccurrences(deploymentsList.stdout, versionId2)).toBe(1); // once for versions deploy, only
		});

		it("should rollback to specific Worker version (0th version)", async () => {
			const rollback = await helper.run(
				`wrangler rollback ${versionId0} --message "Rollback to old version" --yes`
			);

			const versionsList = await helper.run(`wrangler versions list`);

			const deploymentsList = await helper.run(`wrangler deployments list`);

			expect(normalize(rollback.stdout)).toMatchInlineSnapshot(`
			"├ Fetching latest deployment
			│
			├ Your current deployment has 1 version(s):
			│
			│ (100%) 00000000-0000-0000-0000-000000000000
			│       Created:  TIMESTAMP
			│           Tag:  e2e-upload
			│       Message:  Upload via e2e test
			│
			? Please provide an optional message for this rollback (120 characters max)
			🤖 Using default value in non-interactive context: Rollback to old version
			│
			├  WARNING  You are about to rollback to Worker Version 00000000-0000-0000-0000-000000000000.
			│ This will immediately replace the current deployment and become the active deployment across all your deployed triggers.
			│ However, your local development environment will not be affected by this rollback.
			│ Rolling back to a previous deployment will not rollback any of the bound resources (Durable Object, D1, R2, KV, etc).
			│
			│ (100%) 00000000-0000-0000-0000-000000000000
			│       Created:  TIMESTAMP
			│           Tag:  -
			│       Message:  -
			│
			? Are you sure you want to deploy this Worker Version to 100% of traffic?
			🤖 Using fallback value in non-interactive context: yes
			Performing rollback...
			│
			╰  SUCCESS  Worker Version 00000000-0000-0000-0000-000000000000 has been deployed to 100% of traffic.
			Current Version ID: 00000000-0000-0000-0000-000000000000"
		`);

			expect(rollback.stdout).toContain(
				`Worker Version ${versionId0} has been deployed to 100% of traffic`
			);

			// list same versions as before (no new versions created)
			expect(normalize(versionsList.stdout)).toMatchInlineSnapshot(`
			"Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Upload
			Tag:         -
			Message:     -
			Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (version_upload)
			Tag:         e2e-upload
			Message:     Upload via e2e test
			Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (version_upload)
			Tag:         e2e-upload-AGAIN
			Message:     Upload AGAIN via e2e test"
		`);

			// list deployments with new rollback deployment of 0th version (1 new deployment created)
			expect(normalize(deploymentsList.stdout)).toMatchInlineSnapshot(`
			"Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Upload
			Message:     Automatic deployment on upload.
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  -
			                 Message:  -
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     Deploy via e2e test
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  e2e-upload
			                 Message:  Upload via e2e test
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     Deploy AGAIN via e2e test
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  e2e-upload-AGAIN
			                 Message:  Upload AGAIN via e2e test
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     Rollback via e2e test
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  e2e-upload
			                 Message:  Upload via e2e test
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     Rollback to old version
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  -
			                 Message:  -"
		`);

			expect(countOccurrences(deploymentsList.stdout, versionId0)).toBe(2); // once for regular deploy, once for rollback
			expect(countOccurrences(deploymentsList.stdout, versionId1)).toBe(2); // once for versions deploy, once for rollback
			expect(countOccurrences(deploymentsList.stdout, versionId2)).toBe(1); // once for versions deploy, only
		});

		it("fails to upload if using Workers Sites", async () => {
			await helper.seed({
				"wrangler.toml": dedent`
                name = "${workerName}"
                main = "src/index.ts"
                compatibility_date = "2023-01-01"

                [site]
                bucket = "./public"
            `,
				"src/index.ts": dedent`
                export default {
                    fetch(request) {
                        return new Response("Hello World!")
                    }
                }
            `,
				"package.json": dedent`
                {
                    "name": "${workerName}",
                    "version": "0.0.0",
                    "private": true
                }
            `,
			});

			const upload = await helper.run(`wrangler versions upload`);

			expect(normalize(upload.output)).toMatchInlineSnapshot(`
			"X [ERROR] Workers Sites does not support uploading versions through \`wrangler versions upload\`. You must use \`wrangler deploy\` instead.
			🪵  Logs were written to "<LOG>""
		`);
		});

		it("should upload version of Worker with assets", async () => {
			await helper.seed({
				"wrangler.toml": dedent`
	            name = "${workerName}"
	            compatibility_date = "2023-01-01"

	            [assets]
	            directory = "./public"
	        `,
				"public/asset.txt": `beep boop`,
				"package.json": dedent`
	            {
	                "name": "${workerName}",
	                "version": "0.0.0",
	                "private": true
	            }
	        `,
			});

			const upload = await helper.run(
				`wrangler versions upload --message "Upload via e2e test" --tag "e2e-upload-assets"`
			);

			expect(normalize(upload.stdout)).toMatchInlineSnapshot(`
			"🌀 Building list of assets...
			✨ Read 1 file from the assets directory /tmpdir
			🌀 Starting asset upload...
			🌀 Found 1 new or modified static asset to upload. Proceeding with upload...
			+ /asset.txt
			Uploaded 1 of 1 assets
			✨ Success! Uploaded 1 file (TIMINGS)
			Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: (TIMINGS)
			Uploaded tmp-e2e-worker-00000000-0000-0000-0000-000000000000 (TIMINGS)
			Worker Version ID: 00000000-0000-0000-0000-000000000000
			Version Preview URL: https://tmp-e2e-worker-PREVIEW-URL.SUBDOMAIN.workers.dev
			To deploy this version to production traffic use the command wrangler versions deploy
			Changes to non-versioned settings (config properties 'logpush' or 'tail_consumers') take effect after your next deployment using the command wrangler versions deploy
			Changes to triggers (routes, custom domains, cron schedules, etc) must be applied with the command wrangler triggers deploy"
		`);
		});

		it("should upload version of Worker with assets only", async () => {
			await helper.seed({
				"wrangler.toml": dedent`
					name = "${workerName}"
					compatibility_date = "2023-01-01"

					[assets]
					directory = "./public"
				`,
				"public/asset.txt": `beep boop beep boop`,
				"package.json": dedent`
					{
						"name": "${workerName}",
						"version": "0.0.0",
						"private": true
					}
				`,
			});

			const upload = await helper.run(
				`wrangler versions upload --message "Upload via e2e test" --tag "e2e-upload-assets"`
			);

			expect(normalize(upload.stdout)).toMatchInlineSnapshot(`
				"🌀 Building list of assets...
				✨ Read 1 file from the assets directory /tmpdir
				🌀 Starting asset upload...
				🌀 Found 1 new or modified static asset to upload. Proceeding with upload...
				+ /asset.txt
				Uploaded 1 of 1 assets
				✨ Success! Uploaded 1 file (TIMINGS)
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: (TIMINGS)
				Uploaded tmp-e2e-worker-00000000-0000-0000-0000-000000000000 (TIMINGS)
				Worker Version ID: 00000000-0000-0000-0000-000000000000
				Version Preview URL: https://tmp-e2e-worker-PREVIEW-URL.SUBDOMAIN.workers.dev
				To deploy this version to production traffic use the command wrangler versions deploy
				Changes to non-versioned settings (config properties 'logpush' or 'tail_consumers') take effect after your next deployment using the command wrangler versions deploy
				Changes to triggers (routes, custom domains, cron schedules, etc) must be applied with the command wrangler triggers deploy"
			`);

			const versionsView = await helper.run(
				`wrangler versions view ${matchVersionId(upload.stdout)}`
			);
			expect(normalize(versionsView.stdout)).toMatchInlineSnapshot(`
				"Version ID:  00000000-0000-0000-0000-000000000000
				Created:     TIMESTAMP
				Author:      person@example.com
				Source:      Unknown (version_upload)
				Tag:         e2e-upload-assets
				Message:     Upload via e2e test
				------------------------------------------------------------
				Compatibility Date:  2023-01-01"
			`);
		});

		it("should include version preview url in output file", async () => {
			const outputFile = path.join(helper.tmpPath, "output.jsonnd");
			const upload = await helper.run(
				`wrangler versions upload --message "Upload via e2e test" --tag "e2e-upload"`,
				{
					env: {
						...process.env,
						WRANGLER_OUTPUT_FILE_PATH: outputFile,
					},
				}
			);

			versionId1 = matchVersionId(upload.stdout);

			const output = await readFile(outputFile, "utf8");

			expect(JSON.parse(normalizeOutput(output.split("\n")[1]))).toMatchObject({
				preview_url: "https://tmp-e2e-worker-PREVIEW-URL.SUBDOMAIN.workers.dev",
			});
		});

		it("should delete Worker", async () => {
			const { stdout } = await helper.run(`wrangler delete`);

			expect(normalize(stdout)).toMatchInlineSnapshot(`
			"? Are you sure you want to delete tmp-e2e-worker-00000000-0000-0000-0000-000000000000? This action cannot be undone.
			🤖 Using fallback value in non-interactive context: yes
			Successfully deleted tmp-e2e-worker-00000000-0000-0000-0000-000000000000"
		`);
		});
	}
);
