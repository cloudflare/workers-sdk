import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { parseTestShard } from "./vitest-shard.cjs";

// The longest fixtures on the macOS critical path in uncached CI run
// 37943018431 (2026-10-09).
// Estimates only affect scheduling; every eligible package is always assigned.
const estimatedSeconds: Record<string, number> = {
	"dev-registry": 250,
	"create-test-harness-example": 120,
	"entrypoints-rpc-tests": 80,
	"vitest-plugin-examples": 80,
	"get-platform-proxy": 60,
	"worker-logs": 50,
};

type FixtureGroup = "all" | "dev-registry" | "remaining";

/**
 * Assign all fixture packages with CI tests to disjoint, deterministic shards.
 * Whole packages preserve custom test scripts, including multi-project suites.
 *
 * @param root Workspace root containing the fixtures directory.
 * @param shard One-based shard index and count, e.g. `1/2`.
 * @param platform Runner platform; retains the existing Linux Browser Run exclusion.
 * @param group CI runs dev-registry independently so it cannot sit behind other fixtures.
 * @returns Relative package paths to select with Turbo filters.
 */
export function getFixtureShard(
	root: string,
	shard: string,
	platform: NodeJS.Platform = process.platform,
	group: FixtureGroup = "all"
): string[] {
	const { index, count } = parseTestShard(shard);

	const fixtures = readdirSync(path.join(root, "fixtures"), {
		withFileTypes: true,
	})
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.filter((name) => {
			const manifestPath = path.join(root, "fixtures", name, "package.json");
			// Some fixture directories (e.g. Python Workers) are not pnpm packages.
			if (!existsSync(manifestPath)) {
				return false;
			}
			const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
				scripts?: Record<string, string>;
			};
			return (
				manifest.scripts?.["test:ci"] !== undefined &&
				!(platform === "linux" && name === "browser-run")
			);
		})
		.filter((name) =>
			group === "all"
				? true
				: group === "dev-registry"
					? name === "dev-registry"
					: name !== "dev-registry"
		);
	const duration = (name: string) => estimatedSeconds[name] ?? 30;
	fixtures.sort(
		(a, b) => duration(b) - duration(a) || a.localeCompare(b, "en")
	);

	const shards: string[][] = Array.from({ length: count }, () => []);
	const totals = Array.from({ length: count }, () => 0);
	for (const fixture of fixtures) {
		const lightest = totals.indexOf(Math.min(...totals));
		shards[lightest].push(`./fixtures/${fixture}`);
		totals[lightest] += duration(fixture);
	}
	const selected = shards[index - 1];
	assert(selected.length > 0, "Fixture shard has no CI tests");
	return selected;
}

if (require.main === module) {
	const { values } = parseArgs({
		options: { shard: { type: "string" }, group: { type: "string" } },
	});
	assert(values.shard, "Expected --shard=<index>/<count>");
	const group = values.group ?? "all";
	assert(
		group === "all" || group === "dev-registry" || group === "remaining",
		"Expected --group=all, dev-registry, or remaining"
	);
	const root = path.resolve(__dirname, "../..");
	const fixtures = getFixtureShard(root, values.shard, process.platform, group);
	console.log(
		`Fixture group ${group}, shard ${values.shard}:\n${fixtures.join("\n")}`
	);
	// Use pnpm's Node entry point rather than a shell or Windows .cmd shim.
	// eslint-disable-next-line turbo/no-undeclared-env-vars -- pnpm provides this entry point to the root script, which runs outside Turbo
	const pnpmPath = process.env.npm_execpath;
	assert(pnpmPath, "Run this script with pnpm run test:ci:fixtures");
	const result = spawnSync(
		process.execPath,
		[
			pnpmPath,
			"run",
			"test:ci",
			"--summarize",
			"--concurrency=2",
			"--log-order=stream",
			...fixtures.map((fixture) => `--filter=${fixture}`),
		],
		{ cwd: root, stdio: "inherit" }
	);
	if (result.error) {
		throw result.error;
	}
	process.exit(result.status ?? 1);
}
