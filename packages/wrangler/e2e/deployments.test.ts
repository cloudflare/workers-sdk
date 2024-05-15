import assert from "node:assert";
import path from "node:path";
import dedent from "ts-dedent";
import { fetch } from "undici";
import { beforeAll, describe, expect } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { e2eTest } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";
import { normalizeOutput } from "./helpers/normalize";
import { retry } from "./helpers/retry";
import { makeRoot, seed } from "./helpers/setup";
import { runWrangler } from "./helpers/wrangler";

function matchWhoamiEmail(stdout: string): string {
	return stdout.match(/associated with the email (.+?@.+?)!/)?.[1] as string;
}

describe("deployments", () => {
	let root: string;
	let workerName: string;
	let workerPath: string;
	let normalize: (str: string) => string;
	let deployedUrl: string;

	beforeAll(async () => {
		root = await makeRoot();

		workerName = generateResourceName();
		workerPath = path.join(root, workerName);
		const email = matchWhoamiEmail(await runWrangler(`wrangler whoami`));
		normalize = (str) =>
			normalizeOutput(str, {
				[email]: "person@example.com",
				[CLOUDFLARE_ACCOUNT_ID]: "CLOUDFLARE_ACCOUNT_ID",
			});
	}, 50_000);

	e2eTest("init worker", async ({ run }) => {
		const { readUntil } = run(
			`wrangler init --yes --no-delegate-c3 ${workerName}`,
			{ cwd: root }
		);

		await readUntil(
			/To publish your Worker to the Internet, run `npm run deploy`/,
			// This can be very slow, so give it the same timeout as the test itself
			120_000
		);
	});

	e2eTest("deploy worker", async ({ run }) => {
		const { readUntil } = run(`wrangler deploy`, { cwd: workerPath });

		const match = await readUntil(
			/(?<url>https:\/\/tmp-e2e-.+?\..+?\.workers\.dev)/
		);
		assert(match.groups);
		deployedUrl = match.groups.url;

		const { text } = await retry(
			(s) => s.status !== 200,
			async () => {
				const r = await fetch(deployedUrl);
				return { text: await r.text(), status: r.status };
			}
		);
		expect(text).toMatchInlineSnapshot('"Hello World!"');
	});

	e2eTest("list 1 deployment", async ({ run }) => {
		const { readUntil } = run(`wrangler deployments list`, { cwd: workerPath });

		await readUntil(/Upload from Wrangler 🤠/);
		await readUntil(/🟩 Active/);
	});

	e2eTest("modify & deploy worker", async ({ run }) => {
		await seed(workerPath, {
			"src/index.ts": dedent`
        export default {
          fetch(request) {
            return new Response("Updated Worker!")
          }
        }`,
		});
		const { readUntil } = run(`wrangler deploy`, { cwd: workerPath });

		const match = await readUntil(
			/(?<url>https:\/\/tmp-e2e-.+?\..+?\.workers\.dev)/
		);
		assert(match.groups);
		deployedUrl = match.groups.url;

		const { text } = await retry(
			(s) => s.status !== 200 || s.text === "Hello World!",
			async () => {
				const r = await fetch(deployedUrl);
				return { text: await r.text(), status: r.status };
			}
		);
		expect(text).toMatchInlineSnapshot('"Updated Worker!"');
	});

	e2eTest("list 2 deployments", async ({ run }) => {
		const dep = await run(`wrangler deployments list`, { cwd: workerPath });
		expect(normalize(dep)).toMatchInlineSnapshot(`
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
	});

	e2eTest("rollback", async ({ run }) => {
		const { readUntil } = run(`wrangler rollback --message "A test message"`, {
			cwd: workerPath,
		});

		await readUntil(/Successfully rolled back/);
	});

	e2eTest("list deployments", async ({ run }) => {
		const dep = await run(`wrangler deployments list`, { cwd: workerPath });
		expect(normalize(dep)).toMatchInlineSnapshot(`
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
	});

	e2eTest("delete worker", async ({ run }) => {
		const { readUntil } = run(`wrangler delete`, { cwd: workerPath });

		await readUntil(/Successfully deleted/);
		const status = await retry(
			(s) => s === 200 || s === 500,
			() => fetch(deployedUrl).then((r) => r.status)
		);
		expect(status).toBe(404);
	});
});
