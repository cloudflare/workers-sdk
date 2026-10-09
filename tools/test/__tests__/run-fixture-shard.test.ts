import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "vitest";
import { clean } from "../../clean/clean";
import { getFixtureShard } from "../run-fixture-shard";

describe("getFixtureShard", () => {
	let root: string;
	beforeEach(() => {
		root = realpathSync(mkdtempSync(path.join(tmpdir(), "fixture-shard-")));
		mkdirSync(path.join(root, "fixtures"));
	});
	afterEach(() => clean([root]));

	function fixture(name: string, hasTests = true) {
		const dir = path.join(root, "fixtures", name);
		mkdirSync(dir);
		writeFileSync(
			path.join(dir, "package.json"),
			JSON.stringify({
				name: `@fixture/${name}`,
				scripts: hasTests ? { "test:ci": "custom-test-command" } : {},
			})
		);
	}

	it("covers every eligible fixture exactly once, including new fixtures", ({
		expect,
	}) => {
		const names = [
			"z-new-fixture",
			"dev-registry",
			"entrypoints-rpc-tests",
			"a",
			"browser-run",
		];
		for (const name of names) {
			fixture(name);
		}
		fixture("no-tests", false);
		mkdirSync(path.join(root, "fixtures", "not-a-pnpm-package"));
		const first = getFixtureShard(root, "1/2", "win32");
		const second = getFixtureShard(root, "2/2", "win32");
		expect([...first, ...second].sort()).toEqual(
			names.map((name) => `./fixtures/${name}`).sort()
		);
		expect(first.filter((name) => second.includes(name))).toEqual([]);
		expect(first).toContain("./fixtures/dev-registry");
		expect(second).toContain("./fixtures/entrypoints-rpc-tests");
		expect(getFixtureShard(root, "1/2", "win32")).toEqual(first);
	});

	it.for(["darwin", "linux", "win32"] as const)(
		"covers all fixtures across the dedicated and remaining groups on %s",
		(platform, { expect }) => {
			for (const name of [
				"dev-registry",
				"entrypoints-rpc-tests",
				"create-test-harness-example",
				"browser-run",
				"new-fixture",
			]) {
				fixture(name);
			}
			const dedicated = getFixtureShard(root, "1/1", platform, "dev-registry");
			const remaining = [1, 2].flatMap((index) =>
				getFixtureShard(root, `${index}/2`, platform, "remaining")
			);
			expect(dedicated).toEqual(["./fixtures/dev-registry"]);
			expect([...dedicated, ...remaining].sort()).toEqual(
				getFixtureShard(root, "1/1", platform).sort()
			);
			expect(new Set([...dedicated, ...remaining]).size).toBe(
				dedicated.length + remaining.length
			);
		}
	);

	it("retains the existing Linux-only Browser Run exclusion", ({ expect }) => {
		fixture("browser-run");
		fixture("other");
		expect(getFixtureShard(root, "1/1", "linux")).toEqual(["./fixtures/other"]);
		for (const platform of ["darwin", "win32"] as const) {
			expect(getFixtureShard(root, "1/1", platform)).toContain(
				"./fixtures/browser-run"
			);
		}
	});

	it.for(["0/2", "3/2", "1/0", "1/-2", "1.5/2", "1/2/3", "1/9007199254740992"])(
		"rejects invalid shards (%s)",
		(shard, { expect }) => {
			expect(() => getFixtureShard(root, shard)).toThrow();
		}
	);

	it("fails for an empty shard instead of running an unfiltered Turbo task", ({
		expect,
	}) => {
		fixture("only-fixture");
		expect(() => getFixtureShard(root, "2/2")).toThrow(
			"Fixture shard has no CI tests"
		);
	});

	it.for([0, 42])(
		"runs the selected packages and propagates exit code %s",
		(code, { expect }) => {
			const pnpmPath = path.join(root, "pnpm entry point.cjs");
			const argsPath = path.join(root, "args.json");
			writeFileSync(
				pnpmPath,
				`
			require("node:fs").writeFileSync(${JSON.stringify(argsPath)}, JSON.stringify(process.argv.slice(2)));
			process.exit(${code});
		`
			);
			const workspaceRoot = path.resolve(__dirname, "../../..");
			const result = spawnSync(
				process.execPath,
				[
					"-r",
					"esbuild-register",
					"tools/test/run-fixture-shard.ts",
					"--shard=1/2",
				],
				{
					cwd: workspaceRoot,
					env: { ...process.env, npm_execpath: pnpmPath },
					encoding: "utf8",
				}
			);
			expect(result.error).toBeUndefined();
			expect(result.status, result.stderr).toBe(code);
			expect(JSON.parse(readFileSync(argsPath, "utf8"))).toEqual([
				"run",
				"test:ci",
				"--summarize",
				"--concurrency=2",
				"--log-order=stream",
				...getFixtureShard(workspaceRoot, "1/2").map(
					(fixturePath) => `--filter=${fixturePath}`
				),
			]);
		}
	);

	it("launches the dedicated fixture and rejects unknown groups", ({
		expect,
	}) => {
		const workspaceRoot = path.resolve(__dirname, "../../..");
		const pnpmPath = path.join(root, "pnpm.cjs");
		const argsPath = path.join(root, "args.json");
		writeFileSync(
			pnpmPath,
			`require("node:fs").writeFileSync(${JSON.stringify(argsPath)}, JSON.stringify(process.argv.slice(2)));`
		);
		for (const group of ["dev-registry", "unknown"]) {
			const result = spawnSync(
				process.execPath,
				[
					"-r",
					"esbuild-register",
					"tools/test/run-fixture-shard.ts",
					`--group=${group}`,
					"--shard=1/1",
				],
				{
					cwd: workspaceRoot,
					env: { ...process.env, npm_execpath: pnpmPath },
					encoding: "utf8",
				}
			);
			expect(result.status).toBe(group === "dev-registry" ? 0 : 1);
		}
		expect(JSON.parse(readFileSync(argsPath, "utf8"))).toEqual([
			"run",
			"test:ci",
			"--summarize",
			"--concurrency=2",
			"--log-order=stream",
			"--filter=./fixtures/dev-registry",
		]);
	});
});
