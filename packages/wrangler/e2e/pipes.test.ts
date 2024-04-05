import crypto from "node:crypto";
import path from "node:path";
import shellac from "shellac";
import { beforeAll, chai, describe, expect, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { normalizeOutput } from "./helpers/normalize";
import { makeRoot, seed } from "./helpers/setup";
import { WRANGLER } from "./helpers/wrangler-command";

chai.config.truncateThreshold = 1e6;

function matchWhoamiEmail(stdout: string): string {
	return stdout.match(/associated with the email (.+?@.+?)!/)?.[1] as string;
}
function matchVersionId(stdout: string): string {
	return stdout.match(/Version ID:\s+([a-f\d-]+)/)?.[1] as string;
}
function matchDeploymentId(stdout: string): string {
	return stdout.match(/Deployment ID:\s+([a-f\d-]+)/)?.[1] as string;
}
function countOccurences(stdout: string, substring: string) {
	return stdout.split(substring).length - 1;
}

describe("piping wrangler output", () => {
	let root: string;
	let workerName: string;
	let workerPath: string;
	let runInRoot: typeof shellac;
	let runInWorker: typeof shellac;
	let normalize: (str: string) => string;
	let versionId0: string;
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
			await runInRoot`$ ${WRANGLER} init ${workerName} --yes --no-delegate-c3`;

		expect(normalize(init.stdout)).toContain(
			"To publish your Worker to the Internet, run `npm run deploy`"
		);

		// TEMP: regular deploy needed for the first time to *create* the worker (will create 1 extra version + deployment in snapshots below)
		const deploy = await runInWorker`$ ${WRANGLER} deploy`;

		// upload a few versions to fetch from the API later
		const upload1 =
			await runInWorker`$ ${WRANGLER} versions upload --x-versions`;
		const upload2 =
			await runInWorker`$ ${WRANGLER} versions upload --x-versions`;

		versionId0 = matchDeploymentId(deploy.stdout);
		versionId1 = matchVersionId(upload1.stdout);
		versionId2 = matchVersionId(upload2.stdout);
	});

	it("pipe versions list to `jq` and get latest Version Id", async () => {
		const list =
			await runInWorker`$ ${WRANGLER} versions list --json  --x-versions | jq '.[0].id'`;

		expect(normalize(list.stdout)).toMatchInlineSnapshot(`""00000000-0000-0000-0000-000000000000""`);

		const latestVersionId = JSON.parse(list.stdout);
		expect(latestVersionId).toBe(versionId2);
	});

	it("pipe versions list to `head`", async () => {
		const list =
			await runInWorker`$ ${WRANGLER} versions list  --x-versions | head`;

		expect(normalize(list.stdout)).toMatchInlineSnapshot(`
			"Version ID:  00000000-0000-0000-0000-000000000000
			Created:     TIMESTAMP
			Author:      person@example.com
			Source:      Unknown (version_upload)
			Tag:         -
			Message:     -
			Version ID:  00000000-0000-0000-0000-000000000000"
		`);
	});
});
