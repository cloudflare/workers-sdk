import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import dedent from "ts-dedent";
import { minimalVitestConfig, test } from "./helpers";

test("disk snapshots", async ({ expect, seed, vitestRun, tmpPath }) => {
	// Check writes new snapshots
	await seed({
		"vitest.config.ts": minimalVitestConfig,
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
	expect(await result.exitCode).toBe(0);
	expect(result.stdout).toMatch("Snapshots  2 written");
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
	expect(await result.exitCode).toBe(1);
	expect(result.stdout).toMatch("Snapshots  2 failed");
	expect(result.stderr).toMatch(
		"Error: Snapshot `matches snapshot 1` mismatched"
	);
	expect(result.stderr).toMatch(
		"Error: Snapshot `matches another snapshot > two 1` mismatched"
	);

	// Check updates snapshots
	result = await vitestRun("--update");
	expect(await result.exitCode).toBe(0);
	expect(result.stdout).toMatch("Snapshots  2 updated");
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
	result = await vitestRun("--update");
	expect(await result.exitCode).toBe(0);
	expect(result.stdout).toMatch("Snapshots  1 removed");
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
	result = await vitestRun("--update");
	expect(await result.exitCode).toBe(0);
	expect(result.stdout).toMatch("Snapshots  1 files removed");
	expect(existsSync(snapshotPath)).toBe(false);
});

test("inline snapshots", async ({ expect, seed, vitestRun, tmpPath }) => {
	// Check writes new snapshots
	await seed({
		"vitest.config.ts": minimalVitestConfig,
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
	expect(await result.exitCode).toBe(0);
	expect(result.stdout).toMatch("Snapshots  2 written");
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
		"vitest.config.ts": minimalVitestConfig,
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
	expect(await result.exitCode).toBe(1);
	expect(result.stdout).toMatch("Snapshots  2 failed");
	expect(result.stderr).toMatch(
		"Error: Snapshot `matches snapshot 1` mismatched"
	);
	expect(result.stderr).toMatch(
		"Error: Snapshot `matches another snapshot 1` mismatched"
	);

	// Check updates snapshots
	result = await vitestRun("--update");
	expect(await result.exitCode).toBe(0);
	expect(result.stdout).toMatch("Snapshots  2 updated");
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
});
