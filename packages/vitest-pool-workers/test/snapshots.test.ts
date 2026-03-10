import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

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
