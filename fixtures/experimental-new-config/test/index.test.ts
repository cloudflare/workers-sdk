import childProcess from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { removeDir } from "@fixture/shared/src/fs-helpers";
import { afterAll, beforeAll, describe, test } from "vitest";
import {
	runWranglerDev,
	wranglerEntryPath,
} from "../../shared/src/run-wrangler-long-lived";

const fixtureDir = path.resolve(__dirname, "..");

/**
 * Spawn `wrangler` synchronously inside the given working directory.
 */
function spawnWrangler(cwd: string, args: string[]) {
	return childProcess.spawnSync(
		process.execPath,
		[wranglerEntryPath, ...args],
		{
			cwd,
			env: {
				...process.env,
				WRANGLER_LOG_PATH: "",
				NO_COLOR: "1",
				FORCE_COLOR: "0",
			},
		}
	);
}

async function getTmpDir() {
	return fs.mkdtemp(path.join(os.tmpdir(), "wrangler-new-config-"));
}

/**
 * Stage the fixture in a temporary directory. Symlinks `node_modules` so
 * the staged cloudflare.config.ts can resolve `wrangler/experimental-config`.
 */
async function stageFixture(): Promise<string> {
	const tmp = await getTmpDir();
	for (const name of [
		"package.json",
		"src",
		"cloudflare.config.ts",
		"wrangler.config.ts",
		"worker-configuration.d.ts",
		"tsconfig.json",
		"tsconfig.node.json",
		"tsconfig.worker.json",
	]) {
		const srcPath = path.join(fixtureDir, name);
		if (existsSync(srcPath)) {
			await fs.cp(srcPath, path.join(tmp, name), { recursive: true });
		}
	}
	// Symlink the fixture's node_modules so package resolution works.
	const fixtureNodeModules = path.join(fixtureDir, "node_modules");
	if (existsSync(fixtureNodeModules)) {
		await fs.symlink(fixtureNodeModules, path.join(tmp, "node_modules"), "dir");
	}
	return tmp;
}

describe("--x-new-config deploy --dry-run", () => {
	test("builds successfully and emits the worker bundle", async ({
		expect,
	}) => {
		const tmpDir = await stageFixture();
		try {
			const outDir = path.join(tmpDir, "out");
			const result = spawnWrangler(tmpDir, [
				"deploy",
				"--x-new-config",
				"--dry-run",
				`--outdir=${outDir}`,
			]);
			expect(result.status, result.stderr.toString()).toBe(0);
			expect(existsSync(path.join(outDir, "index.js"))).toBe(true);
		} finally {
			removeDir(tmpDir, { fireAndForget: true });
		}
	});

	test("rejects --config when used with --x-new-config", async ({ expect }) => {
		const tmpDir = await stageFixture();
		try {
			const result = spawnWrangler(tmpDir, [
				"deploy",
				"--x-new-config",
				"--config",
				"./some-other.jsonc",
				"--dry-run",
			]);
			expect(result.status).not.toBe(0);
			expect(result.stderr.toString()).toContain(
				"--config is not supported with --x-new-config"
			);
		} finally {
			removeDir(tmpDir, { fireAndForget: true });
		}
	});

	test("rejects on out-of-scope commands (kv namespace list)", async ({
		expect,
	}) => {
		const tmpDir = await stageFixture();
		try {
			const result = spawnWrangler(tmpDir, [
				"kv",
				"namespace",
				"list",
				"--x-new-config",
			]);
			expect(result.status).not.toBe(0);
			expect(result.stderr.toString()).toContain(
				"--x-new-config is currently only supported for wrangler dev, build, deploy, versions upload, and versions deploy"
			);
		} finally {
			removeDir(tmpDir, { fireAndForget: true });
		}
	});

	test("rejects wrangler types --x-new-config", async ({ expect }) => {
		const tmpDir = await stageFixture();
		try {
			const result = spawnWrangler(tmpDir, ["types", "--x-new-config"]);
			expect(result.status).not.toBe(0);
			const stderr = result.stderr.toString();
			expect(
				stderr.includes("wrangler types is currently not supported") ||
					stderr.includes(
						"--x-new-config is currently only supported for wrangler dev, build, deploy, versions upload, and versions deploy"
					)
			).toBe(true);
		} finally {
			removeDir(tmpDir, { fireAndForget: true });
		}
	});

	test("rejects when .wrangler/deploy/config.json redirect exists", async ({
		expect,
	}) => {
		const tmpDir = await stageFixture();
		try {
			const deployDir = path.join(tmpDir, ".wrangler", "deploy");
			mkdirSync(deployDir, { recursive: true });
			writeFileSync(
				path.join(deployDir, "config.json"),
				JSON.stringify({ configPath: "../../wrangler.jsonc" })
			);
			writeFileSync(
				path.join(tmpDir, "wrangler.jsonc"),
				JSON.stringify({
					name: "redirected",
					main: "src/index.ts",
					compatibility_date: "2026-05-18",
				})
			);

			const result = spawnWrangler(tmpDir, [
				"deploy",
				"--x-new-config",
				"--dry-run",
				`--outdir=${path.join(tmpDir, "out")}`,
			]);
			expect(result.status).not.toBe(0);
			expect(result.stderr.toString()).toContain(
				"--x-new-config cannot be used when a redirected config exists at .wrangler/deploy/config.json"
			);
		} finally {
			removeDir(tmpDir, { fireAndForget: true });
		}
	});

	test("silently ignores adjacent wrangler.json", async ({ expect }) => {
		const tmpDir = await stageFixture();
		try {
			writeFileSync(
				path.join(tmpDir, "wrangler.json"),
				JSON.stringify({
					name: "should-be-ignored",
					main: "src/does-not-exist.ts",
					compatibility_date: "2020-01-01",
				})
			);
			const outDir = path.join(tmpDir, "out");
			const result = spawnWrangler(tmpDir, [
				"deploy",
				"--x-new-config",
				"--dry-run",
				`--outdir=${outDir}`,
			]);
			// Should still succeed — `cloudflare.config.ts` is used; the
			// `wrangler.json` is silently ignored.
			expect(result.status, result.stderr.toString()).toBe(0);
			expect(existsSync(path.join(outDir, "index.js"))).toBe(true);
		} finally {
			removeDir(tmpDir, { fireAndForget: true });
		}
	});

	test("--env staging surfaces in ctx.mode (bound text contains 'staging')", async ({
		expect,
	}) => {
		const tmpDir = await stageFixture();
		try {
			const outDir = path.join(tmpDir, "out");
			const result = spawnWrangler(tmpDir, [
				"deploy",
				"--x-new-config",
				"--env",
				"staging",
				"--dry-run",
				`--outdir=${outDir}`,
			]);
			expect(result.status, result.stderr.toString()).toBe(0);
			// The deploy --dry-run output prints the bound `MY_TEXT` value as
			// part of the bindings table. With `--env staging`, the function-
			// form `cloudflare.config.ts` evaluates `ctx.mode === "staging"`, so
			// `bindings.text(`The mode is ${ctx.mode}`)` becomes
			// `"The mode is staging"`.
			const combined = result.stdout.toString() + result.stderr.toString();
			expect(combined).toContain("staging");
		} finally {
			removeDir(tmpDir, { fireAndForget: true });
		}
	});
});

describe("--x-new-config dev", () => {
	let tmpDir: string;
	let stop: (() => Promise<unknown>) | undefined;
	let ip: string;
	let port: number;

	beforeAll(async () => {
		tmpDir = await stageFixture();
		({ ip, port, stop } = await runWranglerDev(tmpDir, [
			"--x-new-config",
			"--env",
			"dev",
			"--port=0",
			"--inspector-port=0",
		]));
	});

	afterAll(async () => {
		await stop?.();
		removeDir(tmpDir, { fireAndForget: true });
	});

	test("serves the correct response for a worker configured via cloudflare.config.ts", async ({
		expect,
	}) => {
		const response = await fetch(`http://${ip}:${port}/`);
		expect(await response.text()).toBe("The mode is dev");
	});
});
