import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fetch } from "undici";
import { assert, beforeAll, describe, expect, it } from "vitest";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";

// TODO: Investigate why this is really flaky on windows
describe.runIf(process.platform !== "win32")("c3 integration", () => {
	const helper = new WranglerE2ETestHelper();
	const workerName = generateResourceName("c3");
	let c3Packed: string;

	beforeAll(async () => {
		const pathToC3 = path.resolve(__dirname, "../../create-cloudflare");
		execSync("pnpm pack --pack-destination ./pack", { cwd: pathToC3 });
		const versions = execSync("ls -1 pack", {
			encoding: "utf-8",
			cwd: pathToC3,
		});
		const version = versions.trim().split("\n").at(-1); // get last version
		assert(version);
		c3Packed = path.join(pathToC3, "pack", version);
	});

	it("init project via c3", async () => {
		const env = {
			...process.env,
			WRANGLER_C3_COMMAND: `--package ${c3Packed} dlx create-cloudflare`,
			GIT_AUTHOR_NAME: "test-user",
			GIT_AUTHOR_EMAIL: "test-user@cloudflare.com",
			GIT_COMMITTER_NAME: "test-user",
			GIT_COMMITTER_EMAIL: "test-user@cloudflare.com",
		};

		await helper.run(`wrangler init ${workerName} --yes`, {
			env,
		});

		expect(
			readFileSync(
				path.join(helper.tmpPath, workerName, "wrangler.jsonc"),
				"utf8"
			)
		).not.toContain("<TBD>");
	});

	it("can run `wrangler dev` on generated worker", async () => {
		const worker = helper.runLongLived(`wrangler dev`, {
			cwd: path.join(helper.tmpPath, workerName),
		});
		const { url } = await worker.waitForReady();
		const res = await fetch(url);
		expect(await res.text()).toContain("Hello, World!");
	});
});
