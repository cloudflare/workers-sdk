import dedent from "ts-dedent";
import { chai, describe, expect, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";
import { normalizeOutput } from "./helpers/normalize";

chai.config.truncateThreshold = 1e6;

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
	}).replaceAll(/^Author:(\s+).+@.+$/gm, "Author:$1person@example.com");

describe("versions deploy", { timeout: TIMEOUT }, () => {
	let versionId0: string;
	let versionId1: string;
	let versionId2: string;
	const helper = new WranglerE2ETestHelper();

	it("deploy worker", async () => {
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
	});

	it("should upload 1st Worker version", async () => {
		const upload = await helper.run(
			`wrangler versions upload --message "Upload via e2e test" --tag "e2e-upload"  --x-versions`
		);

		versionId1 = matchVersionId(upload.stdout);

		expect(normalize(upload.stdout)).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Version ID: 00000000-0000-0000-0000-000000000000
			Uploaded tmp-e2e-worker-00000000-0000-0000-0000-000000000000 (TIMINGS)
			To deploy this version to production traffic use the command wrangler versions deploy --experimental-versions
			Changes to non-versioned settings (config properties 'logpush' or 'tail_consumers') take effect after your next deployment using the command wrangler versions deploy --experimental-versions
			Changes to triggers (routes, custom domains, cron schedules, etc) must be applied with the command wrangler triggers deploy --experimental-versions"
		`);
	});

	it("should list 1 version", async () => {
		const list = await helper.run(`wrangler versions list  --x-versions`);

		expect(normalize(list.stdout)).toMatchInlineSnapshot(`
			"Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (version_upload)
			Tag:         e2e-upload
			Message:     Upload via e2e test
			Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Upload
			Tag:         -
			Message:     -"
		`);

		expect(list.stdout).toMatch(/Message:\s+Upload via e2e test/);
		expect(list.stdout).toMatch(/Tag:\s+e2e-upload/);
	});

	it("should deploy 1st Worker version", async () => {
		const deploy = await helper.run(
			`wrangler versions deploy ${versionId1}@100% --message "Deploy via e2e test" --yes  --x-versions`
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
		const list = await helper.run(`wrangler deployments list  --x-versions`);

		expect(normalize(list.stdout)).toMatchInlineSnapshot(`
			"Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     Deploy via e2e test
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  e2e-upload
			                 Message:  Upload via e2e test
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Upload
			Message:     Automatic deployment on upload.
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  -
			                 Message:  -"
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
			`wrangler versions upload --message "Upload AGAIN via e2e test" --tag "e2e-upload-AGAIN"  --x-versions`
		);

		versionId2 = matchVersionId(upload.stdout);

		expect(normalize(upload.stdout)).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Version ID: 00000000-0000-0000-0000-000000000000
			Uploaded tmp-e2e-worker-00000000-0000-0000-0000-000000000000 (TIMINGS)
			To deploy this version to production traffic use the command wrangler versions deploy --experimental-versions
			Changes to non-versioned settings (config properties 'logpush' or 'tail_consumers') take effect after your next deployment using the command wrangler versions deploy --experimental-versions
			Changes to triggers (routes, custom domains, cron schedules, etc) must be applied with the command wrangler triggers deploy --experimental-versions"
		`);

		const versionsList = await helper.run(
			`wrangler versions list  --x-versions`
		);

		expect(normalize(versionsList.stdout)).toMatchInlineSnapshot(`
			"Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (version_upload)
			Tag:         e2e-upload-AGAIN
			Message:     Upload AGAIN via e2e test
			Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (version_upload)
			Tag:         e2e-upload
			Message:     Upload via e2e test
			Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Upload
			Tag:         -
			Message:     -"
		`);

		expect(versionsList.stdout).toMatch(/Message:\s+Upload AGAIN via e2e test/);
		expect(versionsList.stdout).toMatch(/Tag:\s+e2e-upload-AGAIN/);
	});

	it("should deploy 2nd Worker version", async () => {
		const deploy = await helper.run(
			`wrangler versions deploy ${versionId2}@100% --message "Deploy AGAIN via e2e test" --yes  --x-versions`
		);

		const deploymentsList = await helper.run(
			`wrangler deployments list  --x-versions`
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
			Source:      Unknown (deployment)
			Message:     Deploy AGAIN via e2e test
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  e2e-upload-AGAIN
			                 Message:  Upload AGAIN via e2e test
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
			Source:      Upload
			Message:     Automatic deployment on upload.
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  -
			                 Message:  -"
		`);

		expect(countOccurrences(deploymentsList.stdout, versionId0)).toBe(1); // once for regular deploy, only
		expect(countOccurrences(deploymentsList.stdout, versionId1)).toBe(1); // once for versions deploy, only
		expect(countOccurrences(deploymentsList.stdout, versionId2)).toBe(1); // once for versions deploy, only
	});

	it("should rollback to implicit Worker version (1st version)", async () => {
		const rollback = await helper.run(
			`wrangler rollback --message "Rollback via e2e test" --yes  --x-versions`
		);

		const versionsList = await helper.run(
			`wrangler versions list  --x-versions`
		);

		const deploymentsList = await helper.run(
			`wrangler deployments list  --x-versions`
		);

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
			? Please provide an optional message for this rollback (120 characters max)?
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
			╰  SUCCESS  Worker Version 00000000-0000-0000-0000-000000000000 has been deployed to 100% of traffic."
		`);

		expect(rollback.stdout).toContain(
			`Worker Version ${versionId1} has been deployed to 100% of traffic`
		);

		// list same versions as before (no new versions created)
		expect(normalize(versionsList.stdout)).toMatchInlineSnapshot(`
			"Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (version_upload)
			Tag:         e2e-upload-AGAIN
			Message:     Upload AGAIN via e2e test
			Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (version_upload)
			Tag:         e2e-upload
			Message:     Upload via e2e test
			Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Upload
			Tag:         -
			Message:     -"
		`);

		// list deployments with new rollback deployment of 1st version (1 new deployment created)
		expect(normalize(deploymentsList.stdout)).toMatchInlineSnapshot(`
			"Created:     TIMESTAMP
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
			Message:     Deploy AGAIN via e2e test
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  e2e-upload-AGAIN
			                 Message:  Upload AGAIN via e2e test
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
			Source:      Upload
			Message:     Automatic deployment on upload.
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  -
			                 Message:  -"
		`);

		expect(countOccurrences(deploymentsList.stdout, versionId0)).toBe(1); // once for regular deploy, only
		expect(countOccurrences(deploymentsList.stdout, versionId1)).toBe(2); // once for versions deploy, once for rollback
		expect(countOccurrences(deploymentsList.stdout, versionId2)).toBe(1); // once for versions deploy, only
	});

	it("should rollback to specific Worker version (0th version)", async () => {
		const rollback = await helper.run(
			`wrangler rollback ${versionId0} --message "Rollback to old version" --yes  --x-versions`
		);

		const versionsList = await helper.run(
			`wrangler versions list  --x-versions`
		);

		const deploymentsList = await helper.run(
			`wrangler deployments list  --x-versions`
		);

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
			? Please provide an optional message for this rollback (120 characters max)?
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
			╰  SUCCESS  Worker Version 00000000-0000-0000-0000-000000000000 has been deployed to 100% of traffic."
		`);

		expect(rollback.stdout).toContain(
			`Worker Version ${versionId0} has been deployed to 100% of traffic`
		);

		// list same versions as before (no new versions created)
		expect(normalize(versionsList.stdout)).toMatchInlineSnapshot(`
			"Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (version_upload)
			Tag:         e2e-upload-AGAIN
			Message:     Upload AGAIN via e2e test
			Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (version_upload)
			Tag:         e2e-upload
			Message:     Upload via e2e test
			Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Upload
			Tag:         -
			Message:     -"
		`);

		// list deployments with new rollback deployment of 0th version (1 new deployment created)
		expect(normalize(deploymentsList.stdout)).toMatchInlineSnapshot(`
			"Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (deployment)
			Message:     Rollback to old version
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  -
			                 Message:  -
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
			Message:     Deploy AGAIN via e2e test
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  e2e-upload-AGAIN
			                 Message:  Upload AGAIN via e2e test
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
			Source:      Upload
			Message:     Automatic deployment on upload.
			Version(s):  (100%) 00000000-0000-0000-0000-000000000000
			                 Created:  TIMESTAMP
			                     Tag:  -
			                 Message:  -"
		`);

		expect(countOccurrences(deploymentsList.stdout, versionId0)).toBe(2); // once for regular deploy, once for rollback
		expect(countOccurrences(deploymentsList.stdout, versionId1)).toBe(2); // once for versions deploy, once for rollback
		expect(countOccurrences(deploymentsList.stdout, versionId2)).toBe(1); // once for versions deploy, only
	});

	it("should delete Worker", async () => {
		const { stdout } = await helper.run(`wrangler delete`);

		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"? Are you sure you want to delete tmp-e2e-worker-00000000-0000-0000-0000-000000000000? This action cannot be undone.
			🤖 Using fallback value in non-interactive context: yes
			Successfully deleted tmp-e2e-worker-00000000-0000-0000-0000-000000000000"
		`);
	});
});
