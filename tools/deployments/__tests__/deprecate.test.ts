import { execSync, spawnSync } from "node:child_process";
import { describe, it, vitest } from "vitest";
import {
	buildCommands,
	buildDependantsGraph,
	checkNpmLogin,
	getRequiredDependants,
	main,
	parseArgs,
	resolveVersion,
} from "../deprecate";
import type { Mock } from "vitest";

vitest.mock("node:child_process", async () => {
	return {
		execSync: vitest.fn(),
		spawnSync: vitest.fn(),
	};
});

describe("buildDependantsGraph()", () => {
	it("should build the graph from local package.json files", ({ expect }) => {
		const graph = buildDependantsGraph();

		// Core packages must be present
		expect(graph).toHaveProperty("miniflare");
		expect(graph).toHaveProperty("wrangler");
		expect(graph).toHaveProperty("@cloudflare/vite-plugin");
		expect(graph).toHaveProperty("@cloudflare/vitest-pool-workers");
		expect(graph).toHaveProperty("create-cloudflare");

		expect(graph["miniflare"]).toContain("wrangler");
		expect(graph["miniflare"]).toContain("@cloudflare/vitest-pool-workers");
		expect(graph["miniflare"]).toContain("@cloudflare/vite-plugin");

		expect(graph["wrangler"]).toContain("@cloudflare/vite-plugin");
		expect(graph["wrangler"]).toContain("@cloudflare/vitest-pool-workers");
		expect(graph["wrangler"]).not.toContain("miniflare");

		// Private packages should not be in the graph
		expect(graph).not.toHaveProperty("@cloudflare/workers-shared");
		expect(graph).not.toHaveProperty("@cloudflare/containers-shared");
	});
});

// A fixed graph for unit-testing getRequiredDependants in isolation
const TEST_GRAPH: Record<string, string[]> = {
	miniflare: ["wrangler", "pkg-a", "pkg-b"],
	wrangler: ["pkg-a", "pkg-b"],
	"pkg-a": [],
	"pkg-b": [],
	"pkg-c": [],
};

describe("getRequiredDependants()", () => {
	it("should return missing dependants when deprecating miniflare alone", ({
		expect,
	}) => {
		expect(getRequiredDependants(["miniflare"], TEST_GRAPH)).toEqual([
			"wrangler",
			"pkg-a",
			"pkg-b",
		]);
	});

	it("should return missing dependants when deprecating wrangler alone", ({
		expect,
	}) => {
		expect(getRequiredDependants(["wrangler"], TEST_GRAPH)).toEqual([
			"pkg-a",
			"pkg-b",
		]);
	});

	it("should return empty when wrangler + all dependants are provided", ({
		expect,
	}) => {
		expect(
			getRequiredDependants(["wrangler", "pkg-a", "pkg-b"], TEST_GRAPH)
		).toEqual([]);
	});

	it("should return empty when miniflare + all dependants are provided", ({
		expect,
	}) => {
		expect(
			getRequiredDependants(
				["miniflare", "wrangler", "pkg-a", "pkg-b"],
				TEST_GRAPH
			)
		).toEqual([]);
	});

	it("should return empty for a leaf package alone", ({ expect }) => {
		expect(getRequiredDependants(["pkg-c"], TEST_GRAPH)).toEqual([]);
	});

	it("should not duplicate missing dependants when multiple packages share them", ({
		expect,
	}) => {
		expect(
			getRequiredDependants(["miniflare", "wrangler"], TEST_GRAPH)
		).toEqual(["pkg-a", "pkg-b"]);
	});

	it("should throw for an unknown package", ({ expect }) => {
		expect(() => getRequiredDependants(["unknown-pkg"], TEST_GRAPH)).toThrow(
			/"unknown-pkg" is not a known package/
		);
	});
});

describe("resolveVersion()", () => {
	const registryInfo = {
		"dist-tags": { latest: "4.108.0" },
		time: {
			created: "2024-01-01T00:00:00.000Z",
			modified: "2025-07-06T00:00:00.000Z",
			"4.106.0": "2025-06-25T10:00:00.000Z",
			"4.107.0": "2025-07-01T10:00:00.000Z",
			"4.107.1": "2025-07-02T10:00:00.000Z",
			"4.108.0": "2025-07-06T10:00:00.000Z",
		},
		versions: {
			"4.106.0": {},
			"4.107.0": {},
			"4.107.1": {},
			"4.108.0": {},
		},
	};

	it("should resolve a concrete version and find the previous one", async ({
		expect,
	}) => {
		const result = await resolveVersion(
			{ name: "wrangler", version: "4.108.0" },
			registryInfo
		);
		expect(result).toEqual({
			name: "wrangler",
			badVersion: "4.108.0",
			goodVersion: "4.107.1",
		});
	});

	it("should resolve 'latest' to the concrete version", async ({ expect }) => {
		const result = await resolveVersion(
			{ name: "wrangler", version: "latest" },
			registryInfo
		);
		expect(result).toEqual({
			name: "wrangler",
			badVersion: "4.108.0",
			goodVersion: "4.107.1",
		});
	});

	it("should find the correct previous version when it's not the latest", async ({
		expect,
	}) => {
		const result = await resolveVersion(
			{ name: "wrangler", version: "4.107.1" },
			registryInfo
		);
		expect(result).toEqual({
			name: "wrangler",
			badVersion: "4.107.1",
			goodVersion: "4.107.0",
		});
	});

	it("should throw when the version does not exist on npm", async ({
		expect,
	}) => {
		await expect(
			resolveVersion({ name: "wrangler", version: "9.99.99" }, registryInfo)
		).rejects.toThrow(/Version 9.99.99 not found on npm for wrangler/);
	});

	it("should throw when there is no previous version", async ({ expect }) => {
		const singleVersionInfo = {
			"dist-tags": { latest: "1.0.0" },
			time: {
				created: "2024-01-01T00:00:00.000Z",
				modified: "2024-01-01T00:00:00.000Z",
				"1.0.0": "2024-01-01T12:00:00.000Z",
			},
			versions: { "1.0.0": {} },
		};
		await expect(
			resolveVersion({ name: "wrangler", version: "1.0.0" }, singleVersionInfo)
		).rejects.toThrow(/No previous version found/);
	});

	it("should use the rollback version override when provided", async ({
		expect,
	}) => {
		const result = await resolveVersion(
			{ name: "wrangler", version: "4.108.0", rollbackVersion: "4.106.0" },
			registryInfo
		);
		expect(result).toEqual({
			name: "wrangler",
			badVersion: "4.108.0",
			goodVersion: "4.106.0",
		});
	});

	it("should throw when the rollback version override does not exist on npm", async ({
		expect,
	}) => {
		await expect(
			resolveVersion(
				{ name: "wrangler", version: "4.108.0", rollbackVersion: "9.0.0" },
				registryInfo
			)
		).rejects.toThrow(/Rollback version 9.0.0 not found on npm for wrangler/);
	});

	it("should throw when latest dist-tag is missing", async ({ expect }) => {
		const noLatest = {
			"dist-tags": {},
			time: { created: "2024-01-01T00:00:00.000Z" },
			versions: {},
		};
		await expect(
			resolveVersion({ name: "wrangler", version: "latest" }, noLatest)
		).rejects.toThrow(/No "latest" dist-tag found/);
	});

	it("should throw when the auto-resolved rollback version is deprecated", async ({
		expect,
	}) => {
		const infoWithDeprecated = {
			"dist-tags": { latest: "4.108.0" },
			time: {
				created: "2024-01-01T00:00:00.000Z",
				modified: "2025-07-06T00:00:00.000Z",
				"4.107.1": "2025-07-02T10:00:00.000Z",
				"4.108.0": "2025-07-06T10:00:00.000Z",
			},
			versions: {
				"4.107.1": { deprecated: "Known issue. Downgrade to 4.107.0" },
				"4.108.0": {},
			},
		};
		await expect(
			resolveVersion(
				{ name: "wrangler", version: "4.108.0" },
				infoWithDeprecated
			)
		).rejects.toThrow(
			/Rollback version wrangler@4.107.1 is already deprecated/
		);
	});

	it("should throw when the user-provided rollback version is deprecated", async ({
		expect,
	}) => {
		const infoWithDeprecated = {
			...registryInfo,
			versions: {
				...registryInfo.versions,
				"4.106.0": { deprecated: "Old version" },
			},
		};
		await expect(
			resolveVersion(
				{
					name: "wrangler",
					version: "4.108.0",
					rollbackVersion: "4.106.0",
				},
				infoWithDeprecated
			)
		).rejects.toThrow(
			/Rollback version wrangler@4.106.0 is already deprecated/
		);
	});
});

describe("buildCommands()", () => {
	it("should generate dist-tag commands before deprecate commands", ({
		expect,
	}) => {
		const resolved = [
			{
				name: "wrangler",
				badVersion: "4.108.0",
				goodVersion: "4.107.1",
			},
			{
				name: "@cloudflare/vite-plugin",
				badVersion: "1.43.2",
				goodVersion: "1.43.1",
			},
		];
		const commands = buildCommands(resolved, "Regression in X");
		expect(commands.map((c) => c.args)).toEqual([
			["dist-tag", "add", "wrangler@4.107.1", "latest"],
			["dist-tag", "add", "@cloudflare/vite-plugin@1.43.1", "latest"],
			[
				"deprecate",
				"wrangler@4.108.0",
				"Regression in X. Downgrade to 4.107.1",
			],
			[
				"deprecate",
				"@cloudflare/vite-plugin@1.43.2",
				"Regression in X. Downgrade to 1.43.1",
			],
		]);
	});

	it("should produce display strings for logging", ({ expect }) => {
		const resolved = [
			{
				name: "wrangler",
				badVersion: "4.108.0",
				goodVersion: "4.107.1",
			},
		];
		const commands = buildCommands(resolved, "Regression in X");
		expect(commands.map((c) => c.display)).toEqual([
			"npm dist-tag add wrangler@4.107.1 latest",
			'npm deprecate wrangler@4.108.0 "Regression in X. Downgrade to 4.107.1"',
		]);
	});

	it("should include the reason and downgrade version in deprecation args", ({
		expect,
	}) => {
		const resolved = [
			{
				name: "miniflare",
				badVersion: "4.20260706.0",
				goodVersion: "4.20260702.0",
			},
		];
		const commands = buildCommands(resolved, "Scheduled handlers broken");
		expect(commands[1].args).toEqual([
			"deprecate",
			"miniflare@4.20260706.0",
			"Scheduled handlers broken. Downgrade to 4.20260702.0",
		]);
	});
});

describe("parseArgs()", () => {
	it("should parse a single package with reason", ({ expect }) => {
		const result = parseArgs(["--reason", "Bug in deploy", "wrangler@4.108.0"]);
		expect(result).toEqual({
			packages: [{ name: "wrangler", version: "4.108.0" }],
			reason: "Bug in deploy",
			dryRun: false,
		});
	});

	it("should parse multiple packages", ({ expect }) => {
		const result = parseArgs([
			"--reason",
			"Regression",
			"wrangler@4.108.0",
			"@cloudflare/vite-plugin@1.43.2",
		]);
		expect(result.packages).toEqual([
			{ name: "wrangler", version: "4.108.0" },
			{ name: "@cloudflare/vite-plugin", version: "1.43.2" },
		]);
	});

	it("should handle scoped packages with latest", ({ expect }) => {
		const result = parseArgs([
			"--reason",
			"Test",
			"@cloudflare/vite-plugin@latest",
		]);
		expect(result.packages).toEqual([
			{ name: "@cloudflare/vite-plugin", version: "latest" },
		]);
	});

	it("should parse --dry-run flag", ({ expect }) => {
		const result = parseArgs([
			"--reason",
			"Bug",
			"--dry-run",
			"wrangler@latest",
		]);
		expect(result.dryRun).toBe(true);
	});

	it("should parse rollback version override with arrow syntax", ({
		expect,
	}) => {
		const result = parseArgs(["--reason", "Bug", "wrangler@4.108.0>4.106.0"]);
		expect(result.packages).toEqual([
			{
				name: "wrangler",
				version: "4.108.0",
				rollbackVersion: "4.106.0",
			},
		]);
	});

	it("should parse scoped package with rollback version override", ({
		expect,
	}) => {
		const result = parseArgs([
			"--reason",
			"Bug",
			"@cloudflare/vite-plugin@1.43.2>1.42.0",
		]);
		expect(result.packages).toEqual([
			{
				name: "@cloudflare/vite-plugin",
				version: "1.43.2",
				rollbackVersion: "1.42.0",
			},
		]);
	});

	it("should throw for malformed arrow syntax with missing parts", ({
		expect,
	}) => {
		expect(() => parseArgs(["--reason", "Bug", "wrangler@4.108.0>"])).toThrow(
			/Invalid package specifier/
		);
		expect(() => parseArgs(["--reason", "Bug", "wrangler@>4.106.0"])).toThrow(
			/Invalid package specifier/
		);
	});

	it("should throw when --reason is missing", ({ expect }) => {
		expect(() => parseArgs(["wrangler@4.108.0"])).toThrow(
			/--reason is required/
		);
	});

	it("should throw when --reason has no value", ({ expect }) => {
		expect(() => parseArgs(["--reason"])).toThrow(/--reason requires a value/);
	});

	it("should throw when no packages are provided", ({ expect }) => {
		expect(() => parseArgs(["--reason", "Bug"])).toThrow(
			/No packages specified/
		);
	});

	it("should throw for malformed package specifiers", ({ expect }) => {
		expect(() => parseArgs(["--reason", "Bug", "wrangler"])).toThrow(
			/Invalid package specifier/
		);
	});

	it("should throw for unknown flags", ({ expect }) => {
		expect(() =>
			parseArgs(["--reason", "Bug", "--unknown", "wrangler@1.0.0"])
		).toThrow(/Unknown flag: --unknown/);
	});
});

describe("checkNpmLogin()", () => {
	it("should return the username when logged in", ({ expect }) => {
		(execSync as Mock).mockReturnValueOnce("wrangler-publisher\n");
		expect(checkNpmLogin()).toBe("wrangler-publisher");
	});

	it("should return null when not logged in", ({ expect }) => {
		(execSync as Mock).mockImplementationOnce(() => {
			throw new Error("ENEEDAUTH");
		});
		expect(checkNpmLogin()).toBeNull();
	});
});

describe("main()", () => {
	const mockRegistryInfo = {
		"dist-tags": { latest: "2.0.0" },
		time: {
			created: "2024-01-01T00:00:00.000Z",
			modified: "2025-01-02T00:00:00.000Z",
			"1.0.0": "2025-01-01T10:00:00.000Z",
			"2.0.0": "2025-01-02T10:00:00.000Z",
		},
		versions: {
			"1.0.0": {},
			"2.0.0": {},
		},
	};

	it("should not call execSync or spawnSync in dry-run mode", async ({
		expect,
	}) => {
		(execSync as Mock).mockClear();
		(spawnSync as Mock).mockClear();
		vitest.spyOn(console, "log").mockImplementation(() => {});
		vitest.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify(mockRegistryInfo), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			})
		);

		await main([
			"--dry-run",
			"--reason",
			"test regression",
			"create-cloudflare@latest",
		]);

		expect(execSync).not.toHaveBeenCalled();
		expect(spawnSync).not.toHaveBeenCalled();
	});
});
