import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import {
	addTestVarsToWranglerToml,
	shouldRunTest,
} from "../../e2e/helpers/framework-helpers";
import {
	getFrameworkTestRetries,
	selectFrameworkTests,
} from "../../e2e/helpers/framework-shard";
import {
	registerPackageManagerCache,
	spawnWithLogging,
	waitForExit,
} from "../../e2e/helpers/spawn";
import { getFrameworksTests } from "../../e2e/tests/frameworks/test-config";
import { mockPackageManager } from "../helpers/__tests__/mocks";

const mode = vi.hoisted(() => ({
	experimental: false,
	pm: "pnpm",
	version: "10.33.0",
}));
vi.mock("which-pm-runs");
vi.mock("../../e2e/helpers/constants", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../e2e/helpers/constants")>()),
	get isExperimental() {
		return mode.experimental;
	},
	get testPackageManager() {
		return mode.pm;
	},
	get testPackageManagerVersion() {
		return mode.version;
	},
}));

describe("framework case shards", () => {
	describe.each(["linux", "darwin", "win32"] as const)("on %s", (platform) => {
		beforeEach(() => {
			vi.spyOn(process, "platform", "get").mockReturnValue(platform);
		});

		it.for([
			{ pm: "pnpm", version: "10.33.0", experimental: false, shards: 3 },
			{ pm: "pnpm", version: "11.5.1", experimental: false, shards: 3 },
			{ pm: "npm", version: "11.7.0", experimental: false, shards: 3 },
			{ pm: "pnpm", version: "10.33.0", experimental: true, shards: 2 },
		])(
			"preserves all eligible cases for $pm@$version, experimental=$experimental",
			(config, { expect }) => {
				Object.assign(mode, config);
				mockPackageManager(config.pm, config.version);
				const configuredTests = getFrameworksTests();
				const tests = configuredTests.filter(shouldRunTest);
				const partitions = Array.from({ length: config.shards }, (_, i) =>
					selectFrameworkTests(tests, `${i + 1}/${config.shards}`)
				);
				const names = tests.map(({ name }) => name).sort();
				expect(
					partitions
						.flat()
						.map(({ name }) => name)
						.sort()
				).toEqual(names);
				expect(new Set(partitions.flat().map(({ name }) => name)).size).toBe(
					names.length
				);
				expect(
					Math.max(...partitions.map((part) => part.length)) -
						Math.min(...partitions.map((part) => part.length))
				).toBeLessThanOrEqual(1);
				for (let i = 0; i < config.shards; i++) {
					expect(
						selectFrameworkTests(
							[...tests].reverse(),
							`${i + 1}/${config.shards}`
						)
					).toEqual(partitions[i]);
				}
			}
		);
	});

	it.for([0, 1, 2])(
		"preserves %s cases split across three shards",
		(count, { expect }) => {
			const tests = Array.from({ length: count }, (_, i) => ({
				name: `framework-${i}`,
			}));
			const partitions = Array.from({ length: 3 }, (_, i) =>
				selectFrameworkTests(tests, `${i + 1}/3`)
			);
			expect(partitions).toEqual([
				tests.slice(0, 1),
				tests.slice(1, 2),
				tests.slice(2, 3),
			]);
		}
	);

	it("includes new variants and preserves a local filtered selection", ({
		expect,
	}) => {
		const tests = [
			{ name: "nuxt:pages:minimal" },
			{ name: "nuxt:pages" },
			{ name: "nuxt:pages:new-variant" },
		];
		expect(selectFrameworkTests(tests, undefined)).toEqual(tests);
		expect(selectFrameworkTests(tests, "1/1")).toHaveLength(3);
		expect(
			[
				...selectFrameworkTests(tests, "1/2"),
				...selectFrameworkTests(tests, "2/2"),
			]
				.map(({ name }) => name)
				.sort()
		).toEqual(tests.map(({ name }) => name).sort());
		expect(selectFrameworkTests([], "1/3")).toEqual([]);
	});

	it.for(["", "0/3", "4/3", "1/0", "1", "1/2/3", "1.5/3"])(
		"rejects invalid shard %s even with no eligible cases",
		(shard, { expect }) => {
			expect(() => selectFrameworkTests([], shard)).toThrow();
		}
	);
});

describe("framework retry allowances", () => {
	it("defaults to one and retains explicitly configured retries", ({
		expect,
	}) => {
		expect(getFrameworkTestRetries(undefined, undefined)).toBe(1);
		expect(getFrameworkTestRetries(0, undefined)).toBe(0);
		expect(getFrameworkTestRetries(1, undefined)).toBe(1);
		expect(getFrameworkTestRetries(1, "0")).toBe(0);
		expect(getFrameworkTestRetries(undefined, "2")).toBe(2);
	});

	it.for(["", "-1", "1.5", "abc", "1retry", "9007199254740992"])(
		"rejects invalid retry override %s",
		(override, { expect }) => {
			expect(() => getFrameworkTestRetries(undefined, override)).toThrow(
				"E2E_TEST_RETRIES"
			);
		}
	);
});

it.for(["end", "destroy"] as const)(
	"drains late child output after a test log's %s",
	async (close, { expect }) => {
		const log = new PassThrough();
		const errors: Error[] = [];
		log.on("error", (error) => errors.push(error));
		const proc = spawnWithLogging(
			[
				process.execPath,
				"-e",
				'process.stdout.write("late stdout"); process.stderr.write("late stderr");',
			],
			{},
			log
		);
		log[close]();
		const result = await waitForExit(proc);
		expect(result).toEqual({ output: "late stdout", errors: "late stderr" });
		expect(errors).toEqual([]);
	}
);

describe("framework test isolation", () => {
	runInTempDir();

	it("keeps per-attempt caches outside Git and reuses them across working directories", async ({
		expect,
	}) => {
		const project = join(process.cwd(), "project");
		mkdirSync(project);
		writeFileSync(join(project, "package.json"), "{}");
		const log = new PassThrough();
		registerPackageManagerCache(log, project);
		const script = `
			const fs = require('node:fs');
			const path = require('node:path');
			const keys = ['npm_config_cache', 'npm_config_store_dir', 'PNPM_HOME', 'YARN_CACHE_FOLDER'];
			const dirs = keys.map(key => process.env[key]);
			for (const dir of dirs) {
				fs.mkdirSync(dir, { recursive: true });
				fs.writeFileSync(path.join(dir, 'cache-entry'), 'cached');
			}
			process.stdout.write(JSON.stringify(dirs));
		`;
		const outputs: string[] = [];
		for (const cwd of [process.cwd(), project]) {
			const proc = spawnWithLogging(
				[process.execPath, "-e", script],
				{
					cwd,
					env: { NPM_CONFIG_CACHE: join(project, "inherited-cache") },
				},
				log
			);
			outputs.push((await waitForExit(proc)).output);
		}
		expect(outputs[1]).toBe(outputs[0]);
		expect(JSON.parse(outputs[0])).toEqual([
			join(`${project}-package-cache`, "npm"),
			join(`${project}-package-cache`, "pnpm", "store"),
			join(`${project}-package-cache`, "pnpm"),
			join(`${project}-package-cache`, "yarn"),
		]);
		execFileSync("git", ["init"], { cwd: project });
		execFileSync("git", ["add", "."], { cwd: project });
		expect(
			execFileSync("git", ["ls-files"], { cwd: project, encoding: "utf8" })
		).toBe("package.json\n");
		const otherLog = new PassThrough();
		const otherProject = join(dirname(project), "other-project");
		registerPackageManagerCache(otherLog, otherProject);
		const other = spawnWithLogging(
			[process.execPath, "-e", script],
			{},
			otherLog
		);
		expect((await waitForExit(other)).output).not.toBe(outputs[0]);
		expect(readdirSync(project)).toEqual([".git", "package.json"]);
	});

	it("isolates the inspector while preserving generated Wrangler settings", async ({
		expect,
	}) => {
		writeFileSync(
			"wrangler.jsonc",
			JSON.stringify({
				name: "test-worker",
				dev: { port: 1234, inspector_port: 9229 },
				vars: { EXISTING: "value" },
			})
		);
		await addTestVarsToWranglerToml(process.cwd());
		expect(JSON.parse(readFileSync("wrangler.jsonc", "utf8"))).toEqual({
			name: "test-worker",
			dev: { port: 1234, inspector_port: 0 },
			vars: { EXISTING: "value", TEST: "C3_TEST" },
		});
	});
});
