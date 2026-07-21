import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { removeDir } from "@cloudflare/workers-utils";
import { afterEach, describe, it } from "vitest";

describe("pages-functions CLI", () => {
	let testDir: string;

	afterEach(async () => {
		if (testDir && existsSync(testDir)) {
			await removeDir(testDir);
		}
	});

	it("writes imported modules to the output directory", ({ expect }) => {
		testDir = mkdtempSync(join(tmpdir(), "pages-functions-cli-test-"));
		const functionsDir = join(testDir, "functions");
		const outputDir = join(testDir, "dist");
		mkdirSync(functionsDir, { recursive: true });
		writeFileSync(
			join(functionsDir, "index.ts"),
			`import wasm from "./module.wasm";
			export const onRequest = () => new Response(wasm);`
		);
		writeFileSync(join(functionsDir, "module.wasm"), "wasm contents");

		execFileSync(
			process.execPath,
			[
				resolve(import.meta.dirname, "../../dist/cli.mjs"),
				"build",
				functionsDir,
				"--outdir",
				outputDir,
			],
			{ stdio: "pipe" }
		);

		const bundle = readFileSync(join(outputDir, "index.js"), "utf-8");
		const moduleName = bundle.match(
			/from "(\.\/[a-f0-9]{8}-module\.wasm)"/
		)?.[1];
		expect(moduleName).toBeDefined();
		expect(readFileSync(join(outputDir, moduleName ?? ""), "utf-8")).toBe(
			"wasm contents"
		);
	});
});
