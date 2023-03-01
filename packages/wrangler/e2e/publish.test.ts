import { mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { RUN, makeRoot, runIn } from "./util";
import { describe, expect, it } from "vitest";
import { setTimeout } from "node:timers/promises";

describe("publish", async () => {
	const root = await makeRoot();
	const workerName = `smoke-test-worker-${crypto
		.randomBytes(4)
		.toString("hex")}`;
	const workerPath = path.join(root, workerName);

	it("init worker", async () => {
		const { stdout, stderr } = await runIn(root)`
    $ ${RUN} init ${workerName}
    `;
		expect(stdout).toMatchInlineSnapshot(`
			"Using npm as package manager.
			✨ Created ${workerName}/wrangler.toml
			? Would you like to use git to manage this Worker?
			🤖 Using default value in non-interactive context: yes
			✨ Initialized git repository at ${workerName}
			? No package.json found. Would you like to create one?
			🤖 Using default value in non-interactive context: yes
			✨ Created ${workerName}/package.json
			? Would you like to use TypeScript?
			🤖 Using default value in non-interactive context: yes
			✨ Created ${workerName}/tsconfig.json
			? Would you like to create a Worker at ${workerName}/src/index.ts?
			🤖 Using default value in non-interactive context: Fetch handler
			✨ Created ${workerName}/src/index.ts
			? Would you like us to write your first test with Vitest?
			🤖 Using default value in non-interactive context: yes
			✨ Created ${workerName}/src/index.test.ts

			added (N) packages, and audited (N) packages in (TIMINGS)

			(N) packages are looking for funding
			  run \`npm fund\` for details

			found 0 vulnerabilities
			✨ Installed @cloudflare/workers-types, typescript, and vitest into devDependencies

			To start developing your Worker, run \`cd ${workerName} && npm start\`
			To start testing your Worker, run \`npm test\`
			To publish your Worker to the Internet, run \`npm run deploy\`"
		`);
		expect(stderr).toMatchInlineSnapshot(`
			"npm WARN deprecated rollup-plugin-inject@3.0.2: This package has been deprecated and is no longer maintained. Please use @rollup/plugin-inject.
			npm WARN deprecated sourcemap-codec@1.4.8: Please use @jridgewell/sourcemap-codec instead"
		`);
	});
	it("publish worker", async () => {
		const {
			stdout,
			stderr,
			raw: { stdout: rawStdout },
		} = await runIn(workerPath)`
	  $ ${RUN} publish
	`;
		expect(stdout).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded ${workerName} (TIMINGS)
			Published ${workerName} (TIMINGS)
			  https://${workerName}.SUBDOMAIN.workers.dev
			Current Deployment ID: 00000000-0000-0000-0000-000000000000"
		`);
		expect(stderr).toMatchInlineSnapshot('""');
		const subdomain = rawStdout.match(
			/https:\/\/smoke-test-worker-.+?\.(.+?\.workers\.dev)/
		)?.[1];

		await setTimeout(10_000);
		expect(
			fetch(`https://${workerName}.${subdomain}`).then((r) => r.text())
		).resolves.toMatchInlineSnapshot('"Hello World!"');
	});
	it("modify & publish worker", async () => {
		await writeFile(
			path.join(workerPath, "src/index.ts"),
			`
    export default {
      fetch(request) {
        return new Response("Updated Worker!")
      }
    }
    `
		);
		const {
			stdout,
			stderr,
			raw: { stdout: rawStdout },
		} = await runIn(workerPath)`
	  $ ${RUN} publish
	`;
		expect(stdout).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded ${workerName} (TIMINGS)
			Published ${workerName} (TIMINGS)
			  https://${workerName}.SUBDOMAIN.workers.dev
			Current Deployment ID: 00000000-0000-0000-0000-000000000000"
		`);
		expect(stderr).toMatchInlineSnapshot('""');
		const subdomain = rawStdout.match(
			/https:\/\/smoke-test-worker-.+?\.(.+?\.workers\.dev)/
		)?.[1];
		await setTimeout(10_000);
		expect(fetch(`https://${workerName}.${subdomain}`).then((r) => r.text()))
			.resolves.toMatchInlineSnapshot('"Updated Worker!"');
	});

	it("delete worker", async () => {
		const { stdout, stderr } = await runIn(workerPath)`
	  $ ${RUN} delete
	  `;
		expect(stdout).toMatchInlineSnapshot(`
			"? Are you sure you want to delete ${workerName}? This action cannot be undone.
			🤖 Using default value in non-interactive context: yes
			Successfully deleted ${workerName}"
		`);
		expect(stderr).toMatchInlineSnapshot('""');
	});
});
