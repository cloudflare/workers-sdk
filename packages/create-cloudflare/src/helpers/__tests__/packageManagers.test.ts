import { existsSync } from "fs";
import {
	detectPackageManager,
	detectPmMismatch,
} from "helpers/packageManagers";
import { beforeEach, describe, expect, test, vi } from "vitest";
import whichPMRuns from "which-pm-runs";
import { mockPackageManager } from "./mocks";
import type { C3Context } from "types";

vi.mock("fs");
vi.mock("which-pm-runs");

describe("Package Managers", () => {
	beforeEach(() => {
		mockPackageManager("npm");
		vi.mocked(existsSync).mockImplementation(() => false);
	});

	describe("detectPackageManager", async () => {
		let pm = detectPackageManager();

		test("npm", () => {
			expect(pm.npm).toBe("npm");
			expect(pm.npx).toBe("npx");
			expect(pm.dlx).toEqual(["npx"]);
		});

		test("pnpm", () => {
			vi.mocked(whichPMRuns).mockReturnValue({
				name: "pnpm",
				version: "8.5.1",
			});
			pm = detectPackageManager();
			expect(pm.npm).toBe("pnpm");
			expect(pm.npx).toBe("pnpm");
			expect(pm.dlx).toEqual(["pnpm", "dlx"]);

			vi.mocked(whichPMRuns).mockReturnValue({
				name: "pnpm",
				version: "6.35.1",
			});
			pm = detectPackageManager();
			expect(pm.npm).toBe("pnpm");
			expect(pm.npx).toBe("pnpm");
			expect(pm.dlx).toEqual(["pnpm", "dlx"]);

			vi.mocked(whichPMRuns).mockReturnValue({
				name: "pnpm",
				version: "5.18.10",
			});
			pm = detectPackageManager();
			expect(pm.npm).toBe("pnpm");
			expect(pm.npx).toBe("pnpx");
			expect(pm.dlx).toEqual(["pnpx"]);
		});

		test("yarn", () => {
			vi.mocked(whichPMRuns).mockReturnValue({
				name: "yarn",
				version: "3.5.1",
			});
			pm = detectPackageManager();
			expect(pm.npm).toBe("yarn");
			expect(pm.npx).toBe("yarn");
			expect(pm.dlx).toEqual(["yarn", "dlx"]);

			vi.mocked(whichPMRuns).mockReturnValue({
				name: "yarn",
				version: "1.22.0",
			});
			pm = detectPackageManager();
			expect(pm.npm).toBe("yarn");
			expect(pm.npx).toBe("yarn");
			expect(pm.dlx).toEqual(["yarn"]);
		});
	});

	describe("detectPmMismatch", async () => {
		describe("pnpm", () => {
			beforeEach(() => {
				mockPackageManager("pnpm");
			});

			test.each([
				["yarn.lock", true],
				["pnpm-lock.yaml", false],
				["bun.lock", true],
				["bun.lockb", true],
			])("with %s", (file, isMismatch) => {
				vi.mocked(existsSync).mockImplementationOnce(
					(path) => !!(path as string).includes(file),
				);
				expect(detectPmMismatch({ project: { path: "" } } as C3Context)).toBe(
					isMismatch,
				);
			});
		});

		describe("yarn", () => {
			beforeEach(() => {
				mockPackageManager("yarn");
			});

			test.each([
				["yarn.lock", false],
				["pnpm-lock.yaml", true],
				["bun.lock", true],
				["bun.lockb", true],
			])("with %s", (file, isMismatch) => {
				vi.mocked(existsSync).mockImplementationOnce(
					(path) => !!(path as string).includes(file),
				);
				expect(detectPmMismatch({ project: { path: "" } } as C3Context)).toBe(
					isMismatch,
				);
			});
		});

		describe("bun", () => {
			beforeEach(() => {
				mockPackageManager("bun");
			});

			test.each([
				["yarn.lock", true],
				["pnpm-lock.yaml", true],
				["bun.lock", false],
				["bun.lockb", false],
			])("with %s", (file, isMismatch) => {
				vi.mocked(existsSync).mockImplementationOnce(
					(path) => !!(path as string).includes(file),
				);
				expect(detectPmMismatch({ project: { path: "" } } as C3Context)).toBe(
					isMismatch,
				);
			});
		});
	});
});
