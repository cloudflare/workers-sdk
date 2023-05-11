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

describe("publish", async () => {
	const root = await makeRoot();
	const workerName = `smoke-test-worker-${crypto
		.randomBytes(4)
		.toString("hex")}`;
	const workerPath = path.join(root, workerName);
	let workersDev: string | null = null;

	it("init worker", async () => {
		const { stdout } = await runIn(root, { [workerName]: "smoke-test-worker" })`
    $ ${RUN} init ${workerName}
    `;
		expect(stdout).toMatchInlineSnapshot(`
			"Using npm as package manager.
			✨ Created smoke-test-worker/wrangler.toml
			? Would you like to use git to manage this Worker?
			🤖 Using default value in non-interactive context: yes
			✨ Initialized git repository at smoke-test-worker
			? No package.json found. Would you like to create one?
			🤖 Using default value in non-interactive context: yes
			✨ Created smoke-test-worker/package.json
			? Would you like to use TypeScript?
			🤖 Using default value in non-interactive context: yes
			✨ Created smoke-test-worker/tsconfig.json
			? Would you like to create a Worker at smoke-test-worker/src/index.ts?
			🤖 Using default value in non-interactive context: Fetch handler
			✨ Created smoke-test-worker/src/index.ts
			? Would you like us to write your first test with Vitest?
			🤖 Using default value in non-interactive context: yes
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
	it("publish worker", async () => {
		const {
			stdout,
			stderr,
			raw: { stdout: rawStdout },
		} = await runIn(workerPath, { [workerName]: "smoke-test-worker" })`
	  $ ${RUN} publish
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

		await setTimeout(5_000);
		await expect(
			fetch(`https://${workerName}.${workersDev}`).then((r) => r.text())
		).resolves.toMatchInlineSnapshot('"Hello World!"');
	});
	it("modify & publish worker", async () => {
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
	  $ ${RUN} publish
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
