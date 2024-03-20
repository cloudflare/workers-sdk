import crypto from "node:crypto";
import path from "node:path";
import shellac from "shellac";
import { beforeAll, chai, describe, expect, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { normalizeOutput } from "./helpers/normalize";
import { dedent, makeRoot, seed } from "./helpers/setup";
import { WRANGLER } from "./helpers/wrangler-command";

chai.config.truncateThreshold = 1e6;

function matchWhoamiEmail(stdout: string): string {
	return stdout.match(/associated with the email (.+?@.+?)!/)?.[1] as string;
}
function matchVersionId(stdout: string): string {
	return stdout.match(/Version ID:\s+([a-f\d-]+)/)?.[1] as string;
}

describe("versions deploy", () => {
	let root: string;
	let workerName: string;
	let workerPath: string;
	let workersDev: string | null = null;
	let runInRoot: typeof shellac;
	let runInWorker: typeof shellac;
	let normalize: (str: string) => string;
	let versionId1: string;
	let versionId2: string;

	beforeAll(async () => {
		root = await makeRoot();
		workerName = `tmp-e2e-wrangler-${crypto.randomBytes(4).toString("hex")}`;
		workerPath = path.join(root, workerName);
		runInRoot = shellac.in(root).env(process.env);
		runInWorker = shellac.in(workerPath).env(process.env);
		const email = matchWhoamiEmail(
			(await runInRoot`$ ${WRANGLER} whoami`).stdout
		);
		normalize = (str) =>
			normalizeOutput(str, {
				[workerName]: "tmp-e2e-wrangler",
				[email]: "person@example.com",
				[CLOUDFLARE_ACCOUNT_ID]: "CLOUDFLARE_ACCOUNT_ID",
			});
	}, 50_000);

	it("init worker", async () => {
		const init =
			await runInRoot`$ ${WRANGLER} init --yes --no-delegate-c3 ${workerName}`;

		expect(normalize(init.stdout)).toContain(
			"To publish your Worker to the Internet, run `npm run deploy`"
		);

		// TEMP: wrangler deploy needed for the first time to *create* the worker (will create 1 extra version + deployment in snapshots below)
		await runInWorker`$ ${WRANGLER} deploy`;
	});

	it("upload worker version (with message and tag)", async () => {
		const upload =
			await runInWorker`$ ${WRANGLER} versions upload --message "Upload via e2e test" --tag "e2e-upload"  --x-versions`;

		versionId1 = matchVersionId(upload.stdout);

		expect(normalize(upload.stdout)).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Version ID: 00000000-0000-0000-0000-000000000000
			Uploaded tmp-e2e-wrangler (TIMINGS)"
		`);
	});

	it("list 1 version", async () => {
		const list = await runInWorker`$ ${WRANGLER} versions list  --x-versions`;

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

	it("deploy worker version", async () => {
		const deploy =
			await runInWorker`$ ${WRANGLER} versions deploy ${versionId1}@100% --message "Deploy via e2e test" --yes  --x-versions`;

		expect(normalize(deploy.stdout)).toMatchInlineSnapshot(`
			"╭ Deploy Worker Versions by splitting traffic between multiple versions
			│
			├ Fetching latest deployment
			│ undefined
			│
			├ Your current deployment has 1 version(s):
			│
			│ (100%) 00000000-0000-0000-0000-000000000000
			│       Created:  TIMESTAMP
			│           Tag:  -
			│       Message:  -
			│
			├ Fetching deployable versions
			│ undefined
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
			│ undefined
			│
			│
			╰  SUCCESS  Deployed tmp-e2e-wrangler version 00000000-0000-0000-0000-000000000000 at 100% (TIMINGS)"
		`);
	});

	it("list 1 deployment", async () => {
		const list =
			await runInWorker`$ ${WRANGLER} deployments list  --x-versions`;

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
		expect(list.stderr).toMatchInlineSnapshot('""');

		expect(list.stdout).toContain(versionId1);
	});

	it("modify & upload worker version", async () => {
		await seed(workerPath, {
			"src/index.ts": dedent`
				export default {
					fetch(request) {
						return new Response("Hello World AGAIN!")
					}
				}`,
		});

		const upload =
			await runInWorker`$ ${WRANGLER} versions upload --message "Upload AGAIN via e2e test" --tag "e2e-upload-AGAIN"  --x-versions`;

		versionId2 = matchVersionId(upload.stdout);

		expect(normalize(upload.stdout)).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Version ID: 00000000-0000-0000-0000-000000000000
			Uploaded tmp-e2e-wrangler (TIMINGS)"
		`);
	});

	it("list 2 versions", async () => {
		const list = await runInWorker`$ ${WRANGLER} versions list  --x-versions`;

		expect(normalize(list.stdout)).toMatchInlineSnapshot(`
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

		expect(list.stdout).toMatch(/Message:\s+Upload AGAIN via e2e test/);
		expect(list.stdout).toMatch(/Tag:\s+e2e-upload-AGAIN/);
	});

	it("deploy worker version", async () => {
		const deploy =
			await runInWorker`$ ${WRANGLER} versions deploy ${versionId2}@100% --message "Deploy AGAIN via e2e test" --yes  --x-versions`;

		expect(normalize(deploy.stdout)).toMatchInlineSnapshot(`
			"╭ Deploy Worker Versions by splitting traffic between multiple versions
			│
			├ Fetching latest deployment
			│ undefined
			│
			├ Your current deployment has 1 version(s):
			│
			│ (100%) 00000000-0000-0000-0000-000000000000
			│       Created:  TIMESTAMP
			│           Tag:  e2e-upload
			│       Message:  Upload via e2e test
			│
			├ Fetching deployable versions
			│ undefined
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
			│ undefined
			│
			│
			╰  SUCCESS  Deployed tmp-e2e-wrangler version 00000000-0000-0000-0000-000000000000 at 100% (TIMINGS)"
		`);
	});

	it("list 2 deployments", async () => {
		const list =
			await runInWorker`$ ${WRANGLER} deployments list  --x-versions`;

		expect(normalize(list.stdout)).toMatchInlineSnapshot(`
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
		expect(list.stderr).toMatchInlineSnapshot('""');

		expect(list.stdout).toContain(versionId1);
		expect(list.stdout).toContain(versionId2);
	});

	// TODO: rollback, when supported for --x-versions

	it("delete worker", async () => {
		const { stdout, stderr } = await runInWorker`$ ${WRANGLER} delete`;

		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"? Are you sure you want to delete tmp-e2e-wrangler? This action cannot be undone.
			🤖 Using fallback value in non-interactive context: yes
			Successfully deleted tmp-e2e-wrangler"
		`);
		expect(stderr).toMatchInlineSnapshot('""');
	});
});
