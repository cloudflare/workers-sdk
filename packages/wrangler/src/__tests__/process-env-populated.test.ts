import assert from "node:assert";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import dedent from "ts-dedent";
import { bundleWorker } from "../deployment-bundle/bundle";
import { noopModuleCollector } from "../deployment-bundle/module-collection";
import { isProcessEnvPopulated } from "../process-env";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";

/*
 * This file contains inline comments with the word "javascript"
 * This signals to a compatible editor extension that the template string
 * contents should be syntax-highlighted as JavaScript. One such extension
 * is zjcompt.es6-string-javascript, but there are others.
 */

async function seedFs(files: Record<string, string>): Promise<void> {
	for (const [location, contents] of Object.entries(files)) {
		await mkdir(path.dirname(location), { recursive: true });
		await writeFile(location, contents);
	}
}

describe("isProcessEnvPopulated", () => {
	test("default", () => {
		expect(isProcessEnvPopulated(undefined, ["nodejs_compat"])).toBe(false);
	});

	test("future date", () => {
		expect(isProcessEnvPopulated("2026-01-01", ["nodejs_compat"])).toBe(true);
	});

	test("old date", () => {
		expect(isProcessEnvPopulated("2000-01-01", ["nodejs_compat"])).toBe(false);
	});

	test("switch date", () => {
		expect(isProcessEnvPopulated("2025-04-01", ["nodejs_compat"])).toBe(true);
	});

	test("old date, but with flag", () => {
		expect(
			isProcessEnvPopulated("2000-01-01", [
				"nodejs_compat",
				"nodejs_compat_populate_process_env",
			])
		).toBe(true);
	});

	test("old date, with disable flag", () => {
		expect(
			isProcessEnvPopulated("2000-01-01", [
				"nodejs_compat",
				"nodejs_compat_do_not_populate_process_env",
			])
		).toBe(false);
	});

	test("future date, but with disable flag", () => {
		expect(
			isProcessEnvPopulated("2026-01-01", [
				"nodejs_compat",
				"nodejs_compat_do_not_populate_process_env",
			])
		).toBe(false);
	});

	test("future date, with enable flag", () => {
		expect(
			isProcessEnvPopulated("2026-01-01", [
				"nodejs_compat",
				"nodejs_compat_populate_process_env",
			])
		).toBe(true);
	});

	test("future date without nodejs_compat", () => {
		expect(isProcessEnvPopulated("2026-01-01")).toBe(false);
	});

	test("future date, with enable flag but without nodejs_compat", () => {
		expect(
			isProcessEnvPopulated("2026-01-01", [
				"nodejs_compat_populate_process_env",
			])
		).toBe(false);
	});

	test("errors with disable and enable flags specified", () => {
		try {
			isProcessEnvPopulated("2024-01-01", [
				"nodejs_compat_populate_process_env",
				"nodejs_compat_do_not_populate_process_env",
			]);
			assert(false, "Unreachable");
		} catch (e) {
			expect(e).toMatchInlineSnapshot(
				`[Error: Can't both enable and disable a flag]`
			);
		}
	});
});
