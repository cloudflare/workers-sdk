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
	it.each([
		[
			"--script index.ts",
			{
				"index.ts": dedent/* javascript */ `
						export default {
							fetch() {

							}
						}
					`,
			},
			{ script: "index.ts" },
			{},
			{
				directory: "/tmp/dir",
				file: "/tmp/dir/index.ts",
				moduleRoot: "/tmp/dir",
			},
		],
		[
			"--script src/index.ts",
			{
				"src/index.ts": dedent/* javascript */ `
						export default {
							fetch() {

							}
						}
					`,
			},
			{ script: "src/index.ts" },
			{},
			{
				directory: "/tmp/dir",
				file: "/tmp/dir/src/index.ts",
				moduleRoot: "/tmp/dir/src",
			},
		],
		[
			"main = index.ts",
			{
				"index.ts": dedent/* javascript */ `
						export default {
							fetch() {

							}
						}
					`,
			},
			{},
			{ main: "index.ts" },
			{
				directory: "/tmp/dir",
				file: "/tmp/dir/index.ts",
				moduleRoot: "/tmp/dir",
			},
		],
		[
			"main = src/index.ts",
			{
				"src/index.ts": dedent/* javascript */ `
						export default {
							fetch() {

							}
						}
					`,
			},
			{},
			{ main: "src/index.ts" },
			{
				directory: "/tmp/dir",
				file: "/tmp/dir/src/index.ts",
				moduleRoot: "/tmp/dir/src",
			},
		],
		[
			"main = src/index.ts w/ configPath",
			{
				"other-worker/src/index.ts": dedent/* javascript */ `
						export default {
							fetch() {

							}
						}
					`,
			},
			{},
			{
				main: "src/index.ts",
				configPath: "other-worker/wrangler.toml",
			},
			{
				directory: "/tmp/dir/other-worker",
				file: "/tmp/dir/other-worker/src/index.ts",
				moduleRoot: "/tmp/dir/other-worker/src",
			},
		],
	])("%s", async (_name, files, args, config, result) => {
		await seed(files);
		const entry = await getEntry(
			args,
			{ ...defaultWranglerConfig, ...config },
			"deploy"
		);
		expect(normalize(entry)).toMatchObject(result);
	});
});
