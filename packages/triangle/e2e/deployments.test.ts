import crypto from "node:crypto";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { fetch } from "undici";
import { describe, expect, it } from "vitest";
import { RUN, runIn } from "./helpers/run";
import { dedent, makeRoot, seed } from "./helpers/setup";

function matchWorkersDev(stdout: string): string {
	return stdout.match(
		/https:\/\/smoke-test-worker-.+?\.(.+?\.workers\.dev)/
	)?.[1] as string;
}

function matchWhoamiEmail(stdout: string): string {
	return stdout.match(/associated with the email (.+?@.+?)!/)?.[1] as string;
}

async function getEmail(root: string) {
	const { stdout } = await runIn(root)`
    $ ${RUN} whoami
  `;
	return matchWhoamiEmail(stdout);
}

describe("deployments", async () => {
	const root = await makeRoot();
	const workerName = `smoke-test-worker-${crypto
		.randomBytes(4)
		.toString("hex")}`;
	const workerPath = path.join(root, workerName);
	let workersDev: string | null = null;

	const email = await getEmail(root);

	it("init worker", async () => {
		const { stdout } = await runIn(root, { [workerName]: "smoke-test-worker" })`
    $ ${RUN} init --yes --no-delegate-c3 ${workerName}
    `;
		expect(stdout).toMatchInlineSnapshot(`
			"Using npm as package manager.
			✨ Created smoke-test-worker/triangle.toml
			✨ Initialized git repository at smoke-test-worker
			✨ Created smoke-test-worker/package.json
			✨ Created smoke-test-worker/tsconfig.json
			✨ Created smoke-test-worker/src/index.ts
			Your project will use Vitest to run your tests.
			✨ Created smoke-test-worker/src/index.test.ts

			added (N) packages, and audited (N) packages in (TIMINGS)

			(N) packages are looking for funding
			  run \`npm fund\` for details

			found 0 vulnerabilities
			✨ Installed @cloudflare/workers-types, typescript, and vitest into devDependencies

			To start developing your Worker, run \`cd smoke-test-worker && npm start\`
			To start testing your Worker, run \`npm test\`
			To publish your Worker to the Internet, run \`npm run deploy\`"
		`);
	});
	it("deploy worker", async () => {
		const {
			stdout,
			stderr,
			raw: { stdout: rawStdout },
		} = await runIn(workerPath, { [workerName]: "smoke-test-worker" })`
	  $ ${RUN} deploy
	`;
		expect(stdout).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded smoke-test-worker (TIMINGS)
			Published smoke-test-worker (TIMINGS)
			  https://smoke-test-worker.SUBDOMAIN.workers.dev
			Current Deployment ID: 00000000-0000-0000-0000-000000000000"
		`);
		expect(stderr).toMatchInlineSnapshot('""');
		workersDev = matchWorkersDev(rawStdout);

		await setTimeout(2_000);
		await expect(
			fetch(`https://${workerName}.${workersDev}`).then((r) => r.text())
		).resolves.toMatchInlineSnapshot('"Hello World!"');
	});

	it("list 1 deployment", async () => {
		const { stdout, stderr } = await runIn(workerPath, {
			[workerName]: "smoke-test-worker",
			[email]: "person@example.com",
		})`
	  $ ${RUN} deployments list
	`;
		expect(stdout).toMatchInlineSnapshot(`
			"🚧\`triangle deployments\` is a beta command. Please report any issues to https://github.com/khulnasoft/workers-sdk/issues/new/choose


			Deployment ID: 00000000-0000-0000-0000-000000000000
			Created on:    TIMESTAMP
			Author:        person@example.com
			Source:        Upload from Triangle 🤠
			🟩 Active"
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
		const {
			stdout,
			stderr,
			raw: { stdout: rawStdout },
		} = await runIn(workerPath, { [workerName]: "smoke-test-worker" })`
	  $ ${RUN} deploy
	`;
		expect(stdout).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded smoke-test-worker (TIMINGS)
			Published smoke-test-worker (TIMINGS)
			  https://smoke-test-worker.SUBDOMAIN.workers.dev
			Current Deployment ID: 00000000-0000-0000-0000-000000000000"
		`);
		expect(stderr).toMatchInlineSnapshot('""');
		workersDev = matchWorkersDev(rawStdout);

		await setTimeout(10_000);
		await expect(
			fetch(`https://${workerName}.${workersDev}`).then((r) => r.text())
		).resolves.toMatchInlineSnapshot('"Updated Worker!"');
	});

	it("list 2 deployments", async () => {
		const { stdout, stderr } = await runIn(workerPath, {
			[workerName]: "smoke-test-worker",
			[email]: "person@example.com",
		})`
	  $ ${RUN} deployments list
	`;
		expect(stdout).toMatchInlineSnapshot(`
			"🚧\`triangle deployments\` is a beta command. Please report any issues to https://github.com/khulnasoft/workers-sdk/issues/new/choose


			Deployment ID: 00000000-0000-0000-0000-000000000000
			Created on:    TIMESTAMP
			Author:        person@example.com
			Source:        Upload from Triangle 🤠

			Deployment ID: 00000000-0000-0000-0000-000000000000
			Created on:    TIMESTAMP
			Author:        person@example.com
			Source:        Upload from Triangle 🤠
			🟩 Active"
		`);
		expect(stderr).toMatchInlineSnapshot('""');
	});

	it("rollback", async () => {
		const { stdout, stderr } = await runIn(workerPath, {
			[workerName]: "smoke-test-worker",
			[email]: "person@example.com",
		})`
	  $ ${RUN} rollback --message "A test message"
	`;
		expect(stdout).toMatchInlineSnapshot(`
			"🚧\`triangle rollback\` is a beta command. Please report any issues to https://github.com/khulnasoft/workers-sdk/issues/new/choose


			Successfully rolled back to Deployment ID: 00000000-0000-0000-0000-000000000000
			Current Deployment ID: 00000000-0000-0000-0000-000000000000"
		`);
		expect(stderr).toMatchInlineSnapshot('""');
	});

	it("list deployments", async () => {
		const { stdout, stderr } = await runIn(workerPath, {
			[workerName]: "smoke-test-worker",
			[email]: "person@example.com",
		})`
	  $ ${RUN} deployments list
	`;
		expect(stdout).toMatchInlineSnapshot(`
			"🚧\`triangle deployments\` is a beta command. Please report any issues to https://github.com/khulnasoft/workers-sdk/issues/new/choose


			Deployment ID: 00000000-0000-0000-0000-000000000000
			Created on:    TIMESTAMP
			Author:        person@example.com
			Source:        Upload from Triangle 🤠

			Deployment ID: 00000000-0000-0000-0000-000000000000
			Created on:    TIMESTAMP
			Author:        person@example.com
			Source:        Upload from Triangle 🤠

			Deployment ID: 00000000-0000-0000-0000-000000000000
			Created on:    TIMESTAMP
			Author:        person@example.com
			Source:        Rollback from Triangle 🤠
			Rollback from: 00000000-0000-0000-0000-000000000000
			Message:       A test message
			🟩 Active"
		`);
		expect(stderr).toMatchInlineSnapshot('""');
	});

	it("delete worker", async () => {
		const { stdout, stderr } = await runIn(workerPath, {
			[workerName]: "smoke-test-worker",
		})`
	  $ ${RUN} delete
	  `;
		expect(stdout).toMatchInlineSnapshot(`
			"? Are you sure you want to delete smoke-test-worker? This action cannot be undone.
			🤖 Using default value in non-interactive context: yes
			Successfully deleted smoke-test-worker"
		`);
		expect(stderr).toMatchInlineSnapshot('""');
		await setTimeout(10_000);
		await expect(
			fetch(`https://${workerName}.${workersDev}`).then((r) => r.status)
		).resolves.toBe(404);
	});
});
