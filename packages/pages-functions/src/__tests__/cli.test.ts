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

	function setupTestDir(): {
		functionsDir: string;
		outputDir: string;
	} {
		testDir = mkdtempSync(join(tmpdir(), "pages-functions-cli-test-"));
		const functionsDir = join(testDir, "functions");
		const outputDir = join(testDir, "dist");
		mkdirSync(functionsDir, { recursive: true });
		return { functionsDir, outputDir };
	}

	function runCli(...args: string[]) {
		execFileSync(
			process.execPath,
			[resolve(import.meta.dirname, "../../dist/cli.mjs"), ...args],
			{ stdio: "pipe" }
		);
	}

	it("writes imported modules to the output directory", ({ expect }) => {
		const { functionsDir, outputDir } = setupTestDir();
		writeFileSync(
			join(functionsDir, "index.ts"),
			`import wasm from "./module.wasm";
			export const onRequest = () => new Response(wasm);`
		);
		writeFileSync(join(functionsDir, "module.wasm"), "wasm contents");

		runCli("build", functionsDir, "--outdir", outputDir);

		const bundle = readFileSync(join(outputDir, "index.js"), "utf-8");
		const moduleName = bundle.match(
			/from "(\.\/[a-f0-9]{8}-module\.wasm)"/
		)?.[1];
		expect(moduleName).toBeDefined();
		expect(readFileSync(join(outputDir, moduleName ?? ""), "utf-8")).toBe(
			"wasm contents"
		);
	});

	it("does not write _routes.json by default", ({ expect }) => {
		const { functionsDir, outputDir } = setupTestDir();
		writeFileSync(
			join(functionsDir, "index.ts"),
			`export const onRequest = () => new Response("ok");`
		);

		runCli("build", functionsDir, "--outdir", outputDir);

		expect(existsSync(join(outputDir, "_routes.json"))).toBe(false);
	});

	it("writes _routes.json when --routes-output is passed", ({ expect }) => {
		const { functionsDir, outputDir } = setupTestDir();
		writeFileSync(
			join(functionsDir, "hello.ts"),
			`export const onRequest = () => new Response("hello");`
		);
		const routesPath = join(outputDir, "_routes.json");

		runCli(
			"build",
			functionsDir,
			"--outdir",
			outputDir,
			"--routes-output",
			routesPath
		);

		expect(existsSync(routesPath)).toBe(true);
		const routesJSON = JSON.parse(readFileSync(routesPath, "utf-8"));
		expect(routesJSON.version).toBeDefined();
		expect(routesJSON.include).toEqual(expect.arrayContaining(["/hello"]));
		expect(routesJSON.exclude).toEqual(expect.arrayContaining([]));
	});
});
