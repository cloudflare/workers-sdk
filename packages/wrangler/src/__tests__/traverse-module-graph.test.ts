import { writeFile } from "fs/promises";
import path from "path";
import dedent from "ts-dedent";
import traverseModuleGraph from "../traverse-module-graph";
import { runInTempDir } from "./helpers/run-in-tmp";

describe("traverse module graph", () => {
	runInTempDir();
	it("should error on dynamic variable imports", async () => {
		await writeFile(
			"./index.js",
			dedent`
			const package = 'example'
			export default {
				async fetch(request) {
					return await import(package)
				}
			}
			`
		);

		await expect(
			traverseModuleGraph(
				{
					file: path.join(process.cwd(), "./index.js"),
					directory: process.cwd(),
					format: "modules",
				},
				[]
			)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`"Your Worker contains a non string-literal dynamic import, which is not supported by Wrangler"`
		);
	});
	it("should not error on dynamic string-literal imports", async () => {
		await writeFile(
			"./index.js",
			dedent`
			export default {
				async fetch(request) {
					return await import('example')
				}
			}
		  `
		);

		await expect(
			traverseModuleGraph(
				{
					file: path.join(process.cwd(), "./index.js"),
					directory: process.cwd(),
					format: "modules",
				},
				[]
			)
		).resolves.toMatchObject({
			bundleType: "esm",
			dependencies: {},
			modules: [],
			sourceMapPath: undefined,
			stop: undefined,
		});
	});
});
