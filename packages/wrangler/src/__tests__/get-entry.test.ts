import { writeFile } from "fs/promises";
import path from "path";
import dedent from "ts-dedent";
import { Config } from "../config";
import { defaultWranglerConfig } from "../config/config";
import { Entry, getEntry } from "../deployment-bundle/entry";
import guessWorkerFormat from "../deployment-bundle/guess-worker-format";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { seed } from "./helpers/seed";

function normalize(entry: Entry): Entry {
	return JSON.parse(
		JSON.stringify(entry).replaceAll(process.cwd(), "/tmp/dir")
	);
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
			directory: "/tmp/dir",
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
			directory: "/tmp/dir",
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
			directory: "/tmp/dir",
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
			directory: "/tmp/dir",
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
			},
			"deploy"
		);
		expect(normalize(entry)).toMatchObject({
			directory: "/tmp/dir/other-worker",
			file: "/tmp/dir/other-worker/src/index.ts",
			moduleRoot: "/tmp/dir/other-worker/src",
		});
	});
});
