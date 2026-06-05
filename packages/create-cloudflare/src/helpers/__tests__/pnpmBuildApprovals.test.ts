import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFile, writeFile } from "helpers/files";
import {
	getPnpmIgnoredBuildsGuidance,
	isPnpmIgnoredBuildsError,
	mergeAllowBuilds,
	writePnpmBuildApprovals,
} from "helpers/pnpmBuildApprovals";
import { beforeEach, describe, test, vi } from "vitest";
import whichPMRuns from "which-pm-runs";
import { mockPackageManager } from "./mocks";

vi.mock("fs");
vi.mock("helpers/files");
vi.mock("which-pm-runs");

const projectPath = join("/path/to/my-project");
const yamlPath = join(projectPath, "pnpm-workspace.yaml");

describe("writePnpmBuildApprovals", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(existsSync).mockReturnValue(false);
	});

	test("writes a fresh yaml when pnpm is in use and no file exists", ({
		expect,
	}) => {
		mockPackageManager("pnpm", "11.5.1");

		writePnpmBuildApprovals(projectPath);

		expect(vi.mocked(writeFile)).toHaveBeenCalledTimes(1);
		const [calledPath, calledContent] = vi.mocked(writeFile).mock.calls[0];
		expect(calledPath).toBe(yamlPath);
		// Approves exactly the three packages C3 itself requires, with real
		// YAML boolean values (not a placeholder string).
		expect(calledContent).toMatch(/^allowBuilds:$/m);
		expect(calledContent).toMatch(/^ {2}esbuild: true$/m);
		expect(calledContent).toMatch(/^ {2}workerd: true$/m);
		expect(calledContent).toMatch(/^ {2}sharp: true$/m);
	});

	test("writes the yaml for pnpm 10 as well (no version gate)", ({
		expect,
	}) => {
		// pnpm 10 only warns by default, but writing the file is still correct
		// and silences the warning. The helper is intentionally version-agnostic.
		mockPackageManager("pnpm", "10.33.0");

		writePnpmBuildApprovals(projectPath);

		expect(vi.mocked(writeFile)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(writeFile).mock.calls[0][0]).toBe(yamlPath);
	});

	test("is a no-op for npm", ({ expect }) => {
		mockPackageManager("npm");

		writePnpmBuildApprovals(projectPath);

		expect(vi.mocked(writeFile)).not.toHaveBeenCalled();
		expect(vi.mocked(readFile)).not.toHaveBeenCalled();
	});

	test("is a no-op for yarn", ({ expect }) => {
		mockPackageManager("yarn", "3.5.1");

		writePnpmBuildApprovals(projectPath);

		expect(vi.mocked(writeFile)).not.toHaveBeenCalled();
	});

	test("is a no-op for bun", ({ expect }) => {
		mockPackageManager("bun", "1.1.0");

		writePnpmBuildApprovals(projectPath);

		expect(vi.mocked(writeFile)).not.toHaveBeenCalled();
	});

	test("is a no-op when no package manager can be detected", ({ expect }) => {
		// whichPmRuns returns undefined when c3 is invoked outside any PM.
		// `detectPackageManager` then falls back to npm.
		vi.mocked(whichPMRuns).mockReturnValue(
			undefined as unknown as ReturnType<typeof whichPMRuns>
		);

		writePnpmBuildApprovals(projectPath);

		expect(vi.mocked(writeFile)).not.toHaveBeenCalled();
	});

	test("converts our placeholders to true while leaving framework keys untouched", ({
		expect,
	}) => {
		mockPackageManager("pnpm", "11.5.1");
		vi.mocked(existsSync).mockImplementation(
			(path) => path.toString() === yamlPath
		);
		// Existing file written by a framework generator's `pnpm install` on
		// pnpm 11 — placeholders for everything pnpm flagged.
		vi.mocked(readFile).mockReturnValue(
			[
				"allowBuilds:",
				"  esbuild: set this to true or false",
				"  '@parcel/watcher': set this to true or false",
				"  sharp: set this to true or false",
				"",
			].join("\n")
		);

		writePnpmBuildApprovals(projectPath);

		expect(vi.mocked(writeFile)).toHaveBeenCalledTimes(1);
		const written = vi.mocked(writeFile).mock.calls[0][1] as string;
		// Our own keys: placeholders converted to `true`.
		expect(written).toMatch(/^ {2}esbuild: true$/m);
		expect(written).toMatch(/^ {2}sharp: true$/m);
		// Our key that wasn't listed: added.
		expect(written).toMatch(/^ {2}workerd: true$/m);
		// Framework key: NOT touched — still the placeholder pnpm wrote.
		expect(written).toMatch(
			/^ {2}'@parcel\/watcher': set this to true or false$/m
		);
	});

	test("respects an explicit `false` for one of our keys", ({ expect }) => {
		mockPackageManager("pnpm", "11.5.1");
		vi.mocked(existsSync).mockImplementation(
			(path) => path.toString() === yamlPath
		);
		// The user (or a future C3 run) explicitly opted out of esbuild's
		// postinstall. We respect that and only add the missing entries.
		vi.mocked(readFile).mockReturnValue(
			[
				"allowBuilds:",
				"  esbuild: false",
				"  workerd: true",
				"  sharp: true",
				"",
			].join("\n")
		);

		writePnpmBuildApprovals(projectPath);

		// Every one of our keys is already present with an explicit decision.
		expect(vi.mocked(writeFile)).not.toHaveBeenCalled();
	});

	test("is a no-op when all our keys are already approved", ({ expect }) => {
		mockPackageManager("pnpm", "11.5.1");
		vi.mocked(existsSync).mockImplementation(
			(path) => path.toString() === yamlPath
		);
		vi.mocked(readFile).mockReturnValue(
			[
				"allowBuilds:",
				"  esbuild: true",
				"  workerd: true",
				"  sharp: true",
				"",
			].join("\n")
		);

		writePnpmBuildApprovals(projectPath);

		expect(vi.mocked(writeFile)).not.toHaveBeenCalled();
	});

	test("appends an allowBuilds block when the file has none", ({ expect }) => {
		mockPackageManager("pnpm", "11.5.1");
		vi.mocked(existsSync).mockImplementation(
			(path) => path.toString() === yamlPath
		);
		vi.mocked(readFile).mockReturnValue(
			["packages:", "  - 'packages/*'", ""].join("\n")
		);

		writePnpmBuildApprovals(projectPath);

		expect(vi.mocked(writeFile)).toHaveBeenCalledTimes(1);
		const written = vi.mocked(writeFile).mock.calls[0][1] as string;
		// Original content is preserved.
		expect(written).toMatch(/^packages:$/m);
		expect(written).toMatch(/^ {2}- 'packages\/\*'$/m);
		// New allowBuilds block at the end.
		expect(written).toMatch(/^allowBuilds:$/m);
		expect(written).toMatch(/^ {2}esbuild: true$/m);
		expect(written).toMatch(/^ {2}workerd: true$/m);
		expect(written).toMatch(/^ {2}sharp: true$/m);
	});
});

describe("mergeAllowBuilds", () => {
	test("preserves CRLF line endings on Windows-style input", ({ expect }) => {
		const input = [
			"allowBuilds:",
			"  esbuild: set this to true or false",
			"  workerd: set this to true or false",
			"  sharp: set this to true or false",
			"",
		].join("\r\n");

		const output = mergeAllowBuilds(input);

		expect(output).toContain("\r\n");
		expect(output).toMatch(/^ {2}esbuild: true$/m);
	});

	test("never flips an explicit boolean on one of our keys", ({ expect }) => {
		const input = [
			"allowBuilds:",
			"  esbuild: false",
			"  workerd: true",
			"  sharp: true",
			"",
		].join("\n");

		expect(mergeAllowBuilds(input)).toBe(input);
	});

	test("never touches a value on a key that isn't ours", ({ expect }) => {
		// `@parcel/watcher` is framework-introduced; we don't decide for it.
		const input = [
			"allowBuilds:",
			"  esbuild: true",
			"  workerd: true",
			"  sharp: true",
			"  '@parcel/watcher': set this to true or false",
			"  '@swc/core': false",
			"",
		].join("\n");

		expect(mergeAllowBuilds(input)).toBe(input);
	});
});

describe("isPnpmIgnoredBuildsError", () => {
	test("matches pnpm's error code substring", ({ expect }) => {
		const err = new Error(
			"[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild, sharp, workerd"
		);
		expect(isPnpmIgnoredBuildsError(err)).toBe(true);
	});

	test("returns false for unrelated errors", ({ expect }) => {
		expect(isPnpmIgnoredBuildsError(new Error("network timed out"))).toBe(
			false
		);
	});

	test("returns false for non-Error values", ({ expect }) => {
		expect(isPnpmIgnoredBuildsError("ERR_PNPM_IGNORED_BUILDS")).toBe(false);
		expect(isPnpmIgnoredBuildsError(undefined)).toBe(false);
		expect(isPnpmIgnoredBuildsError(null)).toBe(false);
		expect(
			isPnpmIgnoredBuildsError({ message: "ERR_PNPM_IGNORED_BUILDS" })
		).toBe(false);
	});
});

describe("getPnpmIgnoredBuildsGuidance", () => {
	test("points the user at pnpm approve-builds", ({ expect }) => {
		const guidance = getPnpmIgnoredBuildsGuidance();
		expect(guidance).toContain("pnpm approve-builds");
		// Mentions that C3 deliberately doesn't approve framework builds.
		expect(guidance).toMatch(/framework|own/i);
	});
});
