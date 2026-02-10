import path from "node:path";
import { defaultWranglerConfig } from "@cloudflare/workers-utils";
import { seed } from "@cloudflare/workers-utils/test-helpers";
import dedent from "ts-dedent";
/* eslint-disable workers-sdk/no-vitest-import-expect -- helper functions with expect */
import { describe, expect, it } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { getEntry } from "../deployment-bundle/entry";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import type { Entry } from "../deployment-bundle/entry";

function normalize(entry: Entry): Entry {
	const tmpDir = process.cwd();
	const tmpDirName = path.basename(tmpDir);

	return Object.fromEntries(
		Object.entries(entry).map(([k, v]) => [
			k,
			typeof v === "string"
				? v
						.replaceAll("\\", "/")
						.replace(new RegExp(`(.*${tmpDirName})`), `/tmp/dir`)
				: v,
		])
	) as Entry;
}

describe("getEntry()", () => {
	runInTempDir();
	mockConsoleMethods();

	it("--script index.ts", async () => {
		await seed({
			"index.ts": dedent/* javascript */ `
							export default {
								fetch() {

								}
							}
						`,
		});
		const entry = await getEntry(
			{ script: "index.ts" },
			defaultWranglerConfig,
			"deploy"
		);
		expect(normalize(entry)).toMatchObject({
			projectRoot: "/tmp/dir",
			file: "/tmp/dir/index.ts",
			moduleRoot: "/tmp/dir",
		});
	});

	it("--script src/index.ts", async () => {
		await seed({
			"src/index.ts": dedent/* javascript */ `
							export default {
								fetch() {

								}
							}
						`,
		});
		const entry = await getEntry(
			{ script: "src/index.ts" },
			defaultWranglerConfig,
			"deploy"
		);
		expect(normalize(entry)).toMatchObject({
			projectRoot: "/tmp/dir",
			file: "/tmp/dir/src/index.ts",
			moduleRoot: "/tmp/dir/src",
		});
	});

	it("main = index.ts", async () => {
		await seed({
			"index.ts": dedent/* javascript */ `
							export default {
								fetch() {

								}
							}
						`,
		});
		const entry = await getEntry(
			{},
			{ ...defaultWranglerConfig, main: "index.ts" },
			"deploy"
		);
		expect(normalize(entry)).toMatchObject({
			projectRoot: "/tmp/dir",
			file: "/tmp/dir/index.ts",
			moduleRoot: "/tmp/dir",
		});
	});

	it("main = src/index.ts", async () => {
		await seed({
			"src/index.ts": dedent/* javascript */ `
							export default {
								fetch() {

								}
							}
						`,
		});
		const entry = await getEntry(
			{},
			{ ...defaultWranglerConfig, main: "src/index.ts" },
			"deploy"
		);
		expect(normalize(entry)).toMatchObject({
			projectRoot: "/tmp/dir",
			file: "/tmp/dir/src/index.ts",
			moduleRoot: "/tmp/dir/src",
		});
	});

	it("main = src/index.ts w/ configPath", async () => {
		await seed({
			"other-worker/src/index.ts": dedent/* javascript */ `
							export default {
								fetch() {

								}
							}
						`,
		});
		const entry = await getEntry(
			{},
			{
				...defaultWranglerConfig,
				main: "src/index.ts",
				configPath: "other-worker/wrangler.toml",
				userConfigPath: "other-worker/wrangler.toml",
			},
			"deploy"
		);
		expect(normalize(entry)).toMatchObject({
			projectRoot: "/tmp/dir/other-worker",
			file: "/tmp/dir/other-worker/src/index.ts",
			moduleRoot: "/tmp/dir/other-worker/src",
		});
	});
});
