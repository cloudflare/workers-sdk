import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import {
	getDevVarsCandidatePaths,
	getEnvPaths,
	loadDevVars,
	loadEnv,
} from "../src/local-env";

describe("loadEnv", () => {
	runInTempDir();

	it("loads files with Vite precedence", async ({ expect }) => {
		writeFile(
			".env",
			[
				"HELPER=base",
				"SELECTED=$HELPER",
				"OVERRIDE=base",
				"BASE_ONLY=base",
			].join("\n")
		);
		writeFile(".env.local", "OVERRIDE=local\nLOCAL_ONLY=local");
		writeFile(".env.production", "OVERRIDE=mode\nMODE_ONLY=mode");
		writeFile(
			".env.production.local",
			"OVERRIDE=mode-local\nMODE_LOCAL_ONLY=mode-local"
		);

		vi.stubEnv("OVERRIDE", "process");
		const result = await loadEnv(process.cwd(), "production");

		expect(result.values).toMatchObject({
			HELPER: "base",
			SELECTED: "base",
			OVERRIDE: "process",
			BASE_ONLY: "base",
			LOCAL_ONLY: "local",
			MODE_ONLY: "mode",
			MODE_LOCAL_ONLY: "mode-local",
		});
		expect(result.sources).toMatchObject({
			HELPER: { type: "file", path: path.resolve(".env") },
			SELECTED: { type: "file", path: path.resolve(".env") },
			OVERRIDE: { type: "process" },
			BASE_ONLY: { type: "file", path: path.resolve(".env") },
			LOCAL_ONLY: { type: "file", path: path.resolve(".env.local") },
			MODE_ONLY: { type: "file", path: path.resolve(".env.production") },
			MODE_LOCAL_ONLY: {
				type: "file",
				path: path.resolve(".env.production.local"),
			},
		});
		expect(getEnvPaths(process.cwd(), "production")).toEqual([
			path.resolve(".env"),
			path.resolve(".env.local"),
			path.resolve(".env.production"),
			path.resolve(".env.production.local"),
		]);
	});

	it("expands variables progressively in declaration order", async ({
		expect,
	}) => {
		writeFile(".env", "FORWARD=$LATER\nLATER=later\nBACKWARD=$LATER");

		expect((await loadEnv(process.cwd())).values).toMatchObject({
			FORWARD: "",
			LATER: "later",
			BACKWARD: "later",
		});
	});

	it("does not expand an override using a variable introduced later", async ({
		expect,
	}) => {
		writeFile(".env", "TARGET=base");
		writeFile(".env.local", "SOURCE=local\nTARGET=$SOURCE");

		expect((await loadEnv(process.cwd())).values).toMatchObject({
			SOURCE: "local",
			TARGET: "",
		});
	});

	it("uses process values for references without expanding process values", async ({
		expect,
	}) => {
		writeFile(".env", "FROM_PROCESS=$PROCESS_HELPER");
		vi.stubEnv("PROCESS_HELPER", "process-value");
		vi.stubEnv("LITERAL", "$PROCESS_HELPER");

		const result = await loadEnv(process.cwd());

		expect(result.values).toMatchObject({
			FROM_PROCESS: "process-value",
			PROCESS_HELPER: "process-value",
			LITERAL: "$PROCESS_HELPER",
		});
		expect(process.env).toMatchObject({
			PROCESS_HELPER: "process-value",
			LITERAL: "$PROCESS_HELPER",
		});
	});

	it("loads only base files when mode is omitted", async ({ expect }) => {
		writeFile(".env", "VALUE=base");
		writeFile(".env.local", "VALUE=local");
		writeFile(".env.production", "VALUE=mode");

		const result = await loadEnv(process.cwd());

		expect(result.values.VALUE).toBe("local");
		expect(getEnvPaths(process.cwd())).toEqual([
			path.resolve(".env"),
			path.resolve(".env.local"),
		]);
	});

	it("disables file loading without disabling process values", async ({
		expect,
	}) => {
		writeFile(".env", "FILE_VALUE=file");
		vi.stubEnv("PROCESS_VALUE", "process");

		const result = await loadEnv(false);

		expect(result.values.PROCESS_VALUE).toBe("process");
		expect(result.values.FILE_VALUE).toBeUndefined();
		expect(getEnvPaths(false)).toEqual([]);
	});

	it("rejects local as a mode", async ({ expect }) => {
		await expect(loadEnv(process.cwd(), "local")).rejects.toThrow(
			'"local" cannot be used as a mode name'
		);
	});

	it.skipIf(process.platform === "win32")(
		"loads environment values from a FIFO",
		async ({ expect }) => {
			const fifoPath = path.resolve(".env");
			const created = spawnSync("mkfifo", [fifoPath]);
			expect(created.status).toBe(0);
			const writer = spawn(process.execPath, [
				"-e",
				"require('node:fs').writeFileSync(process.argv[1], 'FIFO_VALUE=fifo')",
				fifoPath,
			]);

			const result = await loadEnv(process.cwd());

			expect(result.values.FIFO_VALUE).toBe("fifo");
			writer.kill();
		}
	);
});

describe("loadDevVars", () => {
	runInTempDir();

	it("prefers one environment-specific .dev.vars file", async ({ expect }) => {
		writeFile(".dev.vars", "VALUE=base\nBASE_ONLY=base");
		writeFile(".dev.vars.staging", "VALUE=staging\nREFERENCE=$HELPER");
		writeFile(".env", "VALUE=env\nENV_ONLY=env");

		const result = await loadDevVars(process.cwd(), "staging");

		expect(result).toEqual({
			VALUE: "staging",
			REFERENCE: "$HELPER",
		});
		expect(getDevVarsCandidatePaths(process.cwd(), "staging")).toEqual([
			path.resolve(".dev.vars.staging"),
			path.resolve(".dev.vars"),
		]);
	});

	it("falls back to the base .dev.vars file", async ({ expect }) => {
		writeFile(".dev.vars", "VALUE=base");

		const result = await loadDevVars(process.cwd(), "staging");

		expect(result).toEqual({ VALUE: "base" });
	});

	it("returns undefined when .dev.vars is absent", async ({ expect }) => {
		writeFile(".env", "FILE_VALUE=file");

		expect(await loadDevVars(process.cwd())).toBeUndefined();
	});
});

function writeFile(filename: string, contents: string): void {
	fs.writeFileSync(path.resolve(filename), contents);
}
