import path from "path";
import dedent from "ts-dedent";
import { defaultWranglerConfig } from "../config/config";
import { getEntry } from "../deployment-bundle/entry";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { seed } from "./helpers/seed";
import type { Config } from "../config/config";
import type { Entry } from "../deployment-bundle/entry";

function getConfig(): Config {
	return {
		...defaultWranglerConfig,
		projectRoot: process.cwd(),
	};
}

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
		const entry = await getEntry({ script: "index.ts" }, getConfig(), "deploy");
		expect(normalize(entry)).toMatchObject({
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
			getConfig(),
			"deploy"
		);
		expect(normalize(entry)).toMatchObject({
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
			{ ...getConfig(), main: "index.ts" },
			"deploy"
		);
		expect(normalize(entry)).toMatchObject({
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
			{ ...getConfig(), main: "src/index.ts" },
			"deploy"
		);
		expect(normalize(entry)).toMatchObject({
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
				...getConfig(),
				main: "src/index.ts",
				configPath: "other-worker/wrangler.toml",
				projectRoot: "other-worker",
			},
			"deploy"
		);
		expect(normalize(entry)).toMatchObject({
			file: "/tmp/dir/other-worker/src/index.ts",
			moduleRoot: "/tmp/dir/other-worker/src",
		});
	});
});
