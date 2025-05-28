import { execSync } from "node:child_process";
import fs from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { setTimeout } from "node:timers/promises";
import { afterAll, beforeAll, describe, test } from "vitest";
import {
	fetchJson,
	prepareSeed,
	runLongLived,
	testSeed,
	waitForReady,
} from "./helpers.js";

const commands = ["dev", "buildAndPreview"] as const;

// These tests focus on mixed mode which require an authed connection to the CF API
// They are skipped if you have not provided the necessary account id and api token.
describe.skipIf(
	!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN
)("mixed-mode tests", () => {
	const remoteWorkerName = "tmp-e2e-vite-plugin-mixed-mode-remote-worker";
	const alternativeRemoteWorkerName =
		"tmp-e2e-vite-plugin-mixed-mode-remote-worker-alt";

	const projectPath = testSeed("mixed-mode", "pnpm");

	beforeAll(() => {
		const tmp = fs.mkdtempSync(`${os.tmpdir()}/vite-plugin-e2e-tmp`);
		[
			{
				name: remoteWorkerName,
				content:
					"export default { fetch() { return new Response('Hello from a remote worker'); } };",
			},
			{
				name: alternativeRemoteWorkerName,
				content:
					"export default { fetch() { return new Response('Hello from an alternative remote worker'); } };",
			},
		].forEach((worker) => {
			fs.writeFileSync(`${tmp}/index.js`, worker.content);
			execSync(
				`npx wrangler deploy index.js --name ${worker.name} --compatibility-date 2025-01-01`,
				{ cwd: tmp }
			);
		});
	}, 35_000);

	afterAll(() => {
		[remoteWorkerName, alternativeRemoteWorkerName].forEach((worker) => {
			execSync(`npx wrangler delete --name ${worker}`);
		});
	});

	describe.each(commands)('with "%s" command', (command) => {
		test("can fetch from both local (/auxiliary) and remote workers", async ({
			expect,
		}) => {
			const proc = await runLongLived("pnpm", command, projectPath);
			const url = await waitForReady(proc);
			expect(await fetchJson(url)).toEqual({
				localWorkerResponse: {
					remoteWorkerResponse: "Hello from an alternative remote worker",
				},
				remoteWorkerResponse: "Hello from a remote worker",
			});
		});
	});

	test("reflects changes applied during dev", async ({ expect }) => {
		const seedObj = prepareSeed("mixed-mode", "pnpm");
		await seedObj.seed();

		const proc = await runLongLived("pnpm", "dev", seedObj.projectPath);
		const url = await waitForReady(proc);
		expect(await fetchJson(url)).toEqual({
			localWorkerResponse: {
				remoteWorkerResponse: "Hello from an alternative remote worker",
			},
			remoteWorkerResponse: "Hello from a remote worker",
		});

		const entryWorkerPath = `${seedObj.projectPath}/entry-worker/src/index.ts`;
		const entryWorkerContent = await readFile(entryWorkerPath, "utf8");

		await writeFile(
			entryWorkerPath,
			entryWorkerContent
				.replace("localWorkerResponse: await", "localWorkerResponseJson: await")
				.replace(
					"remoteWorkerResponse: await",
					"remoteWorkerResponseText: await"
				),
			"utf8"
		);

		await setTimeout(500);

		expect(await fetchJson(url)).toEqual({
			localWorkerResponseJson: {
				remoteWorkerResponse: "Hello from an alternative remote worker",
			},
			remoteWorkerResponseText: "Hello from a remote worker",
		});

		await seedObj.cleanup();
	});
});
