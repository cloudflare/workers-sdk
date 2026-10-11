import { PassThrough } from "node:stream";
import { describe, it, vi } from "vitest";
import { shouldRunTest } from "../../e2e/helpers/framework-helpers";
import {
	getFrameworkTestRetries,
	selectFrameworkTests,
} from "../../e2e/helpers/framework-shard";
import { spawnWithLogging, waitForExit } from "../../e2e/helpers/spawn";
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
			const tests = getFrameworksTests().filter(shouldRunTest);
			expect(
				tests
					.filter((test) => test.retry)
					.map(({ name }) => name)
					.sort()
			).toEqual(
				config.pm === "npm" && !config.experimental
					? ["gatsby:pages", "qwik:pages"]
					: []
			);
			const partitions = Array.from({ length: config.shards }, (_, i) =>
				selectFrameworkTests(tests, `${i + 1}/${config.shards}`)
			);
			const names = tests.map(({ name }) => name).sort();
			expect(names.length).toBeGreaterThan(config.shards);
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
	it("defaults to zero and retains explicitly configured retries", ({
		expect,
	}) => {
		expect(getFrameworkTestRetries(undefined, undefined)).toBe(0);
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
