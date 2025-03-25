import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("d1", () => {
	describe("d1 execute --local", () => {
		it("should execute SQL file against the local db", () => {
			const stdout = execSync("pnpm run db:reset", {
				cwd: resolve(__dirname, ".."),
			}).toString();

			expect(stdout).toContain("🚣 3 commands executed successfully.");
		});
	});
});
