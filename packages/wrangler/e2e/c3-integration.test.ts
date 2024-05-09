import { existsSync } from "node:fs";
import path from "node:path";
import shellac from "shellac";
import { fetch } from "undici";
import { beforeAll, describe, expect } from "vitest";
import { e2eTest } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";
import { makeRoot } from "./helpers/setup";
import { waitForReady } from "./helpers/wrangler";

describe.sequential("c3 integration", () => {
	let workerName: string;
	let root: string;
	let c3Packed: string;

	beforeAll(async () => {
		root = await makeRoot();
		workerName = generateResourceName("c3");

		const pathToC3 = path.resolve(__dirname, "../../create-cloudflare");
		const { stdout: version } = await shellac.in(pathToC3)`
			$ pnpm pack --pack-destination ./pack
			$ ls pack`;

		c3Packed = path.join(pathToC3, "pack", version);
	});

	e2eTest("init project via c3", async ({ run }) => {
		const env = {
			...process.env,
			WRANGLER_C3_COMMAND: `--package ${c3Packed} dlx create-cloudflare`,
			GIT_AUTHOR_NAME: "test-user",
			GIT_AUTHOR_EMAIL: "test-user@cloudflare.com",
			GIT_COMMITTER_NAME: "test-user",
			GIT_COMMITTER_EMAIL: "test-user@cloudflare.com",
		};

		const init = await run(`wrangler init ${workerName} --yes`, {
			env,
			cwd: root,
		});

		expect(init).toContain("APPLICATION CREATED");

		expect(existsSync(path.join(root, workerName))).toBe(true);
	});

	e2eTest("can run `wrangler dev` on generated worker", async ({ run }) => {
		const worker = run(`wrangler dev`, { cwd: path.join(root, workerName) });
		const { url } = await waitForReady(worker);
		const res = await fetch(url);
		expect(await res.text()).toBe("Hello World!");
	});
});
