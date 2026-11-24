import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { stripAnsi } from "miniflare";
import dedent from "ts-dedent";
import { version } from "../package.json";
import { test, vitestConfig } from "./helpers";

const execAsync = promisify(exec);

test(
	"disk snapshots",
	{ timeout: 90_000 },
	async ({ expect, seed, vitestRun, tmpPath }) => {
		// Check writes new snapshots
		await seed({
			"vitest.config.mts": vitestConfig(),
			"index.test.ts": dedent`
			import { it, expect } from "vitest";
			it("matches snapshot", () => {
				expect(1).toMatchSnapshot();
			});
			it("matches another snapshot", () => {
				expect(2).toMatchSnapshot("two");
			});
		`,
		});
		let result = await vitestRun();
		let exitCode = await result.exitCode;
		expect(result.stdout).toMatch("Snapshots  2 written");
		expect(exitCode).toBe(0);
		const snapshotPath = path.join(tmpPath, "__snapshots__/index.test.ts.snap");
		let snapshot = await fs.readFile(snapshotPath, "utf8");
		expect(snapshot).toMatchInlineSnapshot(`
		"// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html

		exports[\`matches another snapshot > two 1\`] = \`2\`;

		exports[\`matches snapshot 1\`] = \`1\`;
		"
	`);

		// Check fails if snapshots differ
		await seed({
			"index.test.ts": dedent`
			import { it, expect } from "vitest";
			it("matches snapshot", () => {
				expect(3).toMatchSnapshot();
			});
			it("matches another snapshot", () => {
				expect(4).toMatchSnapshot("two");
			});
		`,
		});
		result = await vitestRun();
		exitCode = await result.exitCode;
		expect(result.stdout).toMatch("Snapshots  2 failed");
		expect(result.stderr).toMatch(
			"Error: Snapshot `matches snapshot 1` mismatched"
		);
		expect(result.stderr).toMatch(
			"Error: Snapshot `matches another snapshot > two 1` mismatched"
		);
		expect(exitCode).toBe(1);

		// Check updates snapshots
		result = await vitestRun({ flags: ["--update"] });
		exitCode = await result.exitCode;
		expect(result.stdout).toMatch("Snapshots  2 updated");
		expect(exitCode).toBe(0);
		snapshot = await fs.readFile(snapshotPath, "utf8");
		expect(snapshot).toMatchInlineSnapshot(`
		"// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html

		exports[\`matches another snapshot > two 1\`] = \`4\`;

		exports[\`matches snapshot 1\`] = \`3\`;
		"
	`);

		// Check removes obsolete snapshots
		await seed({
			"index.test.ts": dedent`
			import { it, expect } from "vitest";
			it("matches snapshot", () => {
				expect(3).toMatchSnapshot();
			});
		`,
		});
		result = await vitestRun({ flags: ["--update"] });
		exitCode = await result.exitCode;
		expect(result.stdout).toMatch("Snapshots  1 removed");
		expect(exitCode).toBe(0);
		snapshot = await fs.readFile(snapshotPath, "utf8");
		expect(snapshot).toMatchInlineSnapshot(`
		"// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html

		exports[\`matches snapshot 1\`] = \`3\`;
		"
	`);

		// Check removes snapshot file
		await seed({
			"index.test.ts": dedent`
			import { it, expect } from "vitest";
			it("doesn't use snapshots", () => {
				expect(1 + 1).toBe(2);
			});
		`,
		});
		result = await vitestRun({ flags: ["--update"] });
		exitCode = await result.exitCode;
		expect(result.stdout).toMatch("Snapshots  1 files removed");
		expect(exitCode).toBe(0);
		expect(existsSync(snapshotPath)).toBe(false);
	}
);

test.skipIf(process.platform === "win32")(
	"inline snapshots",
	{ timeout: 90_000 },
	async ({ expect, seed, vitestRun, tmpPath }) => {
		// Check writes new snapshots
		await seed({
			"vitest.config.mts": vitestConfig(),
			"index.test.ts": dedent`
			import { it, expect } from "vitest";
			it("matches snapshot", () => {
				expect(1).toMatchInlineSnapshot();
			});
			it("matches another snapshot", () => {
				expect(2).toMatchInlineSnapshot();
			});
		`,
		});
		let result = await vitestRun();
		expect(result.stderr).toEqual("");
		let exitCode = await result.exitCode;
		expect(result.stdout).toMatch("Snapshots  2 written");
		expect(exitCode).toBe(0);
		const snapshotPath = path.join(tmpPath, "index.test.ts");
		let snapshot = await fs.readFile(snapshotPath, "utf8");
		expect(snapshot).toMatchInlineSnapshot(`
		"import { it, expect } from "vitest";
		it("matches snapshot", () => {
			expect(1).toMatchInlineSnapshot(\`1\`);
		});
		it("matches another snapshot", () => {
			expect(2).toMatchInlineSnapshot(\`2\`);
		});"
	`);

		// Check fails if snapshots differ
		await seed({
			"vitest.config.mts": vitestConfig(),
			"index.test.ts": dedent`
			import { it, expect } from "vitest";
			it("matches snapshot", () => {
				expect(3).toMatchInlineSnapshot(\`1\`);
			});
			it("matches another snapshot", () => {
				expect(4).toMatchInlineSnapshot(\`2\`);
			});
		`,
		});
		result = await vitestRun();
		exitCode = await result.exitCode;
		expect(result.stdout).toMatch("Snapshots  2 failed");
		expect(result.stderr).toMatch(
			"Error: Snapshot `matches snapshot 1` mismatched"
		);
		expect(result.stderr).toMatch(
			"Error: Snapshot `matches another snapshot 1` mismatched"
		);
		expect(exitCode).toBe(1);

		// Check updates snapshots
		result = await vitestRun({ flags: ["--update"] });
		expect(result.stdout).toMatch("Snapshots  2 updated");
		exitCode = await result.exitCode;
		expect(exitCode).toBe(0);
		snapshot = await fs.readFile(snapshotPath, "utf8");
		expect(snapshot).toMatchInlineSnapshot(`
		"import { it, expect } from "vitest";
		it("matches snapshot", () => {
			expect(3).toMatchInlineSnapshot(\`3\`);
		});
		it("matches another snapshot", () => {
			expect(4).toMatchInlineSnapshot(\`4\`);
		});"
	`);
	}
);

// https://github.com/cloudflare/workers-sdk/issues/17153
// Vitest 5.1.1 stopped inlining each transformed module's source map in the
// temporary files it hands its workers, and appends it after a
// `//# vitestSourceMap=` marker instead, for the worker to split off. The
// inline snapshot positions Vitest writes come from source-mapped stack
// traces, so this test installs that Vitest version beside the plugin,
// whichever version the other tests run against.
const SPLIT_SOURCE_MAP_VITEST_VERSION = "5.1.1";

test.skipIf(process.platform === "win32")(
	`writes inline snapshots at their source positions with Vitest ${SPLIT_SOURCE_MAP_VITEST_VERSION}`,
	{ timeout: 240_000 },
	async ({ expect, seed, tmpPath }) => {
		const testFile = dedent`
			import { SELF } from "cloudflare:test";
			import { expect, it } from "vitest";

			it("the expectation that should change", async () => {
				const res = await SELF.fetch("https://example.com/");
				expect(res.headers.get("cache-control")).toMatchInlineSnapshot(\`"stale value"\`);
			});

			it("padding 1", () => {});
			it("padding 2", () => {});
			it("padding 3", () => {});
			it("padding 4", () => {});
			it("padding 5", () => {});

			it("an unrelated expectation", () => {
				expect("untouched").toMatchInlineSnapshot(\`"untouched"\`);
			});
		`;
		await seed({
			"package.json": JSON.stringify({
				name: "vitest-plugin-split-source-map",
				private: true,
				type: "module",
				devDependencies: {
					"@cloudflare/vitest-plugin": version,
					vitest: SPLIT_SOURCE_MAP_VITEST_VERSION,
				},
			}),
			// Make this directory its own workspace, so it gets its own Vitest
			// rather than the one installed for the other tests.
			"pnpm-workspace.yaml": dedent`
				packages:
				  - "."
				allowBuilds:
				  esbuild: true
				  workerd: true
			`,
			"wrangler.jsonc": JSON.stringify({
				name: "repro",
				main: "src/index.ts",
				compatibility_date: "2025-12-02",
				compatibility_flags: ["nodejs_compat"],
			}),
			"src/index.ts": dedent`
				export default {
					async fetch(): Promise<Response> {
						return new Response("ok", { headers: { "cache-control": "no-store" } });
					},
				};
			`,
			"vitest.config.mts": dedent`
				import { cloudflareTest } from "@cloudflare/vitest-plugin";
				import { defineConfig } from "vitest/config";

				export default defineConfig({
					plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
				});
			`,
			"test/repro.test.ts": testFile,
		});
		const env = { ...process.env, CI: undefined, GITHUB_ACTIONS: undefined };
		await execAsync("pnpm install", { cwd: tmpPath, env });
		const installed = JSON.parse(
			await fs.readFile(
				path.join(tmpPath, "node_modules/vitest/package.json"),
				"utf8"
			)
		);
		expect(installed.version).toBe(SPLIT_SOURCE_MAP_VITEST_VERSION);

		const runVitest = async (flags: string) => {
			// eslint-disable-next-line workers-sdk/no-unsafe-command-execution -- test helper
			const result = await execAsync(`pnpm exec vitest run ${flags}`, {
				cwd: tmpPath,
				env,
			}).catch(
				(error: { stdout: string; stderr: string; code: number }) => error
			);
			return {
				output: stripAnsi(result.stdout + result.stderr),
				exitCode: "code" in result ? result.code : 0,
			};
		};

		// Check the failure points at the outdated snapshot's source position
		const failed = await runVitest("");
		expect(failed.exitCode, failed.output).toBe(1);
		expect(failed.output).toMatch(
			"Error: Snapshot `the expectation that should change 1` mismatched"
		);
		expect.soft(failed.output).toMatch("❯ test/repro.test.ts:6:43");

		// Check updating rewrites the outdated snapshot, and only that one
		const updated = await runVitest("--update");
		expect(updated.output).toMatch("Snapshots  1 updated");
		expect(updated.exitCode, updated.output).toBe(0);
		const snapshot = await fs.readFile(
			path.join(tmpPath, "test/repro.test.ts"),
			"utf8"
		);
		expect(snapshot).toBe(
			testFile.replace(`\`"stale value"\``, `\`"no-store"\``)
		);
	}
);
