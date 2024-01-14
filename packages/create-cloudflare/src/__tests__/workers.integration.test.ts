import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getWorkerdCompatibilityDate } from "helpers/command";
import { readFile, writeFile } from "helpers/files";
import { describe, test, afterEach, beforeEach, expect } from "vitest";
import * as workers from "../workers";
import { createTestContext } from "./helpers";
import type { C3Context } from "types";

describe("updateWranglerToml", () => {
	let ctx: C3Context;
	let tmpDirPath: string;
	let wranglerTomlPath: string;

	beforeEach(() => {
		ctx = createTestContext();
		tmpDirPath = mkdtempSync(join(tmpdir(), `c3-tests-updateWranglerToml`));
		wranglerTomlPath = join(tmpDirPath, "wrangler.toml");
		ctx.project.path = tmpDirPath;
	});

	afterEach(() => {
		rmSync(tmpDirPath, { recursive: true, force: true });
	});

	test("placeholder replacement", async () => {
		const toml = `
name = "<TBD>"
main = "src/index.ts"
compatibility_date = "<TBD>"
	  `;

		writeFile(wranglerTomlPath, toml);
		await workers.updateWranglerToml(ctx);

		const newToml = readFile(wranglerTomlPath);
		expect(newToml).toMatch(`name = "${ctx.project.name}"`);
		expect(newToml).toMatch(`main = "src/index.ts"`);
		expect(newToml).toMatch(
			`compatibility_date = "${await getWorkerdCompatibilityDate()}"`
		);
	});

	test("empty replacement", async () => {
		const toml = `
name =
main = "src/index.js"
compatibility_date =
    `;

		writeFile(wranglerTomlPath, toml);
		await workers.updateWranglerToml(ctx);

		const newToml = readFile(wranglerTomlPath);
		expect(newToml).toMatch(`name = "${ctx.project.name}"`);
		expect(newToml).toMatch(`main = "src/index.js"`);
		expect(newToml).toMatch(
			`compatibility_date = "${await getWorkerdCompatibilityDate()}"`
		);
	});

	test("empty string replacement", async () => {
		const toml = `
name = "" # todo
main = "src/index.js"
    `;

		writeFile(wranglerTomlPath, toml);
		await workers.updateWranglerToml(ctx);

		const newToml = readFile(wranglerTomlPath);
		expect(newToml).toMatch(`name = "${ctx.project.name}"`);
	});

	test("string literal replacement", async () => {
		const toml = `
name = "my-cool-worker"
main = "src/index.ts"
    `;

		writeFile(wranglerTomlPath, toml);
		await workers.updateWranglerToml(ctx);

		const newToml = readFile(wranglerTomlPath);
		expect(newToml).toMatch(`name = "${ctx.project.name}"`);
	});

	test("replace old compatibility date", async () => {
		const toml = `
name = "super-old-worker"
main = "src/index.js"
compatibility_date = "2001-10-12"
    `;

		writeFile(wranglerTomlPath, toml);
		await workers.updateWranglerToml(ctx);

		const newToml = readFile(wranglerTomlPath);
		expect(newToml).toMatch(
			`compatibility_date = "${await getWorkerdCompatibilityDate()}"`
		);
	});

	test("missing name and compat date", async () => {
		const toml = `
main = "src/index.ts"
    `;

		writeFile(wranglerTomlPath, toml);
		await workers.updateWranglerToml(ctx);

		const newToml = readFile(wranglerTomlPath);
		expect(newToml).toMatch(`name = "${ctx.project.name}"`);
		expect(newToml).toMatch(
			`compatibility_date = "${await getWorkerdCompatibilityDate()}"`
		);
	});
});
