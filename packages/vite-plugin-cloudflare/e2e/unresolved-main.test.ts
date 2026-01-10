import { describe, expect, test } from "vitest";
import { runLongLived, seed } from "./helpers";

describe("unresolved main entry file", () => {
	const projectPath = seed("unresolved-main", { pm: "pnpm" });

	test("throws an error when the main entry file cannot be resolved", async () => {
		const proc = await runLongLived("pnpm", "dev", projectPath);
		expect(await proc.exitCode).not.toBe(0);
		expect(proc.stderr).toContain(
			'Failed to resolve main entry file "nonexistent-bare-module"'
		);
	});
});
