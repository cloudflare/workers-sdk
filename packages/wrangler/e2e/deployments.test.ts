import crypto from "node:crypto";
import path from "node:path";
import shellac from "shellac";
import dedent from "ts-dedent";
import { fetch } from "undici";
import { beforeAll, describe, expect, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { normalizeOutput } from "./helpers/normalize";
import { retry } from "./helpers/retry";
import { makeRoot, seed } from "./helpers/setup";
import { WRANGLER } from "./helpers/wrangler";

function matchWorkersDev(stdout: string): string {
	return stdout.match(
		/https:\/\/tmp-e2e-wrangler-.+?\.(.+?\.workers\.dev)/
	)?.[1] as string;
}

function matchWhoamiEmail(stdout: string): string {
	return stdout.match(/associated with the email (.+?@.+?)!/)?.[1] as string;
}

describe("deployments", () => {
	let root: string;
	let workerName: string;
	let workerPath: string;
	let workersDev: string | null = null;
	let runInRoot: typeof shellac;
	let runInWorker: typeof shellac;
	let normalize: (str: string) => string;

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
		const { stdout } =
			await runInRoot`$ ${WRANGLER} init --yes --no-delegate-c3 ${workerName}`;
		expect(normalize(stdout)).toContain(
			"To publish your Worker to the Internet, run `npm run deploy`"
		);
	});

	it("deploy worker", async () => {
		const { stdout } = await runInWorker`$ ${WRANGLER} deploy`;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded tmp-e2e-wrangler (TIMINGS)
			Published tmp-e2e-wrangler (TIMINGS)
			  https://tmp-e2e-wrangler.SUBDOMAIN.workers.dev
			Current Deployment ID: 00000000-0000-0000-0000-000000000000
			Current Version ID: 00000000-0000-0000-0000-000000000000
			Note: Deployment ID has been renamed to Version ID. Deployment ID is present to maintain compatibility with the previous behavior of this command. This output will change in a future version of Wrangler. To learn more visit: https://developers.cloudflare.com/workers/configuration/versions-and-deployments"
		`);
		workersDev = matchWorkersDev(stdout);

		const { text } = await retry(
			(s) => s.status !== 200,
			async () => {
				const r = await fetch(`https://${workerName}.${workersDev}`);
				return { text: await r.text(), status: r.status };
			}
		);
		expect(text).toMatchInlineSnapshot('"Hello World!"');
	});

	it("list 1 deployment", async () => {
		const { stdout, stderr } = await runInWorker`
	  $ ${WRANGLER} deployments list
	`;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose
			Deployment ID: 00000000-0000-0000-0000-000000000000
			Version ID:    00000000-0000-0000-0000-000000000000
			Created on:    TIMESTAMP
			Author:        person@example.com
			Source:        Upload from Wrangler 🤠
			🟩 Active
			Note: Deployment ID has been renamed to Version ID. Deployment ID is present to maintain compatibility with the previous behavior of this command. This output will change in a future version of Wrangler. To learn more visit: https://developers.cloudflare.com/workers/configuration/versions-and-deployments"
		`);
		expect(stderr).toMatchInlineSnapshot('""');
	});

	it("modify & deploy worker", async () => {
		await seed(workerPath, {
			"src/index.ts": dedent`
        export default {
          fetch(request) {
            return new Response("Updated Worker!")
          }
        }`,
		});
		const { stdout, stderr } = await runInWorker`$ ${WRANGLER} deploy`;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded tmp-e2e-wrangler (TIMINGS)
			Published tmp-e2e-wrangler (TIMINGS)
			  https://tmp-e2e-wrangler.SUBDOMAIN.workers.dev
			Current Deployment ID: 00000000-0000-0000-0000-000000000000
			Current Version ID: 00000000-0000-0000-0000-000000000000
			Note: Deployment ID has been renamed to Version ID. Deployment ID is present to maintain compatibility with the previous behavior of this command. This output will change in a future version of Wrangler. To learn more visit: https://developers.cloudflare.com/workers/configuration/versions-and-deployments"
		`);
		expect(stderr).toMatchInlineSnapshot('""');
		workersDev = matchWorkersDev(stdout);

		const { text } = await retry(
			(s) => s.status !== 200 || s.text === "Hello World!",
			async () => {
				const r = await fetch(`https://${workerName}.${workersDev}`);
				return { text: await r.text(), status: r.status };
			}
		);
		expect(text).toMatchInlineSnapshot('"Updated Worker!"');
	});

	it("list 2 deployments", async () => {
		const { stdout, stderr } =
			await runInWorker`$ ${WRANGLER} deployments list`;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose
			Deployment ID: 00000000-0000-0000-0000-000000000000
			Version ID:    00000000-0000-0000-0000-000000000000
			Created on:    TIMESTAMP
			Author:        person@example.com
			Source:        Upload from Wrangler 🤠
			Deployment ID: 00000000-0000-0000-0000-000000000000
			Version ID:    00000000-0000-0000-0000-000000000000
			Created on:    TIMESTAMP
			Author:        person@example.com
			Source:        Upload from Wrangler 🤠
			🟩 Active
			Note: Deployment ID has been renamed to Version ID. Deployment ID is present to maintain compatibility with the previous behavior of this command. This output will change in a future version of Wrangler. To learn more visit: https://developers.cloudflare.com/workers/configuration/versions-and-deployments"
		`);
		expect(stderr).toMatchInlineSnapshot('""');
	});

	it("rollback", async () => {
		const { stdout, stderr } =
			await runInWorker`$ ${WRANGLER} rollback --message "A test message"`;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"🚧\`wrangler rollback\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose
			Successfully rolled back to Deployment ID: 00000000-0000-0000-0000-000000000000
			Current Deployment ID: 00000000-0000-0000-0000-000000000000
			Current Version ID: 00000000-0000-0000-0000-000000000000
			Note: Deployment ID has been renamed to Version ID. Deployment ID is present to maintain compatibility with the previous behavior of this command. This output will change in a future version of Wrangler. To learn more visit: https://developers.cloudflare.com/workers/configuration/versions-and-deployments"
		`);
		expect(stderr).toMatchInlineSnapshot('""');
	});

	it("list deployments", async () => {
		const { stdout, stderr } =
			await runInWorker`$ ${WRANGLER} deployments list`;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"🚧\`wrangler deployments\` is a beta command. Please report any issues to https://github.com/cloudflare/workers-sdk/issues/new/choose
			Deployment ID: 00000000-0000-0000-0000-000000000000
			Version ID:    00000000-0000-0000-0000-000000000000
			Created on:    TIMESTAMP
			Author:        person@example.com
			Source:        Upload from Wrangler 🤠
			Deployment ID: 00000000-0000-0000-0000-000000000000
			Version ID:    00000000-0000-0000-0000-000000000000
			Created on:    TIMESTAMP
			Author:        person@example.com
			Source:        Upload from Wrangler 🤠
			Deployment ID: 00000000-0000-0000-0000-000000000000
			Version ID:    00000000-0000-0000-0000-000000000000
			Created on:    TIMESTAMP
			Author:        person@example.com
			Source:        Rollback from Wrangler 🤠
			Rollback from: 00000000-0000-0000-0000-000000000000
			Message:       A test message
			🟩 Active
			Note: Deployment ID has been renamed to Version ID. Deployment ID is present to maintain compatibility with the previous behavior of this command. This output will change in a future version of Wrangler. To learn more visit: https://developers.cloudflare.com/workers/configuration/versions-and-deployments"
		`);
		expect(stderr).toMatchInlineSnapshot('""');
	});

	it("delete worker", async () => {
		const { stdout, stderr } = await runInWorker`$ ${WRANGLER} delete`;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"? Are you sure you want to delete tmp-e2e-wrangler? This action cannot be undone.
			🤖 Using fallback value in non-interactive context: yes
			Successfully deleted tmp-e2e-wrangler"
		`);
		expect(stderr).toMatchInlineSnapshot('""');
		const status = await retry(
			(s) => s === 200 || s === 500,
			() => fetch(`https://${workerName}.${workersDev}`).then((r) => r.status)
		);
		expect(status).toBe(404);
	});
});
