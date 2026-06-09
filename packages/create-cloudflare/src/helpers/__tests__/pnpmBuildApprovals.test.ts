import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFile, writeFile } from "helpers/files";
import {
	extractIgnoredBuildPackages,
	getPnpmIgnoredBuildsGuidance,
	IgnoredBuildsError,
	isIgnoredBuildsError,
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
		expect(calledContent).toMatch(/^allowBuilds:$/m);
		expect(calledContent).toMatch(/^ {2}esbuild: true$/m);
		expect(calledContent).toMatch(/^ {2}workerd: true$/m);
		expect(calledContent).toMatch(/^ {2}sharp: true$/m);
	});

	test("writes the yaml for pnpm 10 as well (no version gate)", ({
		expect,
	}) => {
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
		// Falls back to npm when c3 is invoked outside any PM.
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
		// Our keys: placeholders → `true`; missing keys are added.
		expect(written).toMatch(/^ {2}esbuild: true$/m);
		expect(written).toMatch(/^ {2}sharp: true$/m);
		expect(written).toMatch(/^ {2}workerd: true$/m);
		// Framework key: untouched.
		expect(written).toMatch(
			/^ {2}'@parcel\/watcher': set this to true or false$/m
		);
	});

	test("respects an explicit `false` for one of our keys", ({ expect }) => {
		mockPackageManager("pnpm", "11.5.1");
		vi.mocked(existsSync).mockImplementation(
			(path) => path.toString() === yamlPath
		);
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
		expect(written).toMatch(/^packages:$/m);
		expect(written).toMatch(/^ {2}- 'packages\/\*'$/m);
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
		expect(guidance).toMatch(/framework|own/i);
	});

	test("inlines the package list when one is known", ({ expect }) => {
		const guidance = getPnpmIgnoredBuildsGuidance(["@parcel/watcher", "lmdb"]);
		expect(guidance).toContain("pnpm approve-builds @parcel/watcher lmdb");
	});

	test("falls back to the bare command when no packages are known", ({
		expect,
	}) => {
		const guidance = getPnpmIgnoredBuildsGuidance([]);
		expect(guidance).toMatch(/^ {2}pnpm approve-builds$/m);
	});
});

describe("extractIgnoredBuildPackages", () => {
	test("parses a single flagged package with version suffix", ({ expect }) => {
		const err = new Error(
			[
				"Packages: +442",
				"Progress: resolved 527, reused 205, downloaded 239, added 442, done",
				"",
				"[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @parcel/watcher@2.5.6",
				"",
				'Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.',
			].join("\n")
		);
		expect(extractIgnoredBuildPackages(err)).toEqual(["@parcel/watcher"]);
	});

	test("parses multiple comma-separated packages and dedupes", ({ expect }) => {
		const err = new Error(
			"[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @parcel/watcher@2.5.6, lmdb@2.8.1, esbuild@0.27.7, lmdb@2.8.1"
		);
		expect(extractIgnoredBuildPackages(err)).toEqual([
			"@parcel/watcher",
			"lmdb",
			"esbuild",
		]);
	});

	test("handles unscoped and scoped packages without version suffixes", ({
		expect,
	}) => {
		const err = new Error(
			"[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild, @swc/core"
		);
		expect(extractIgnoredBuildPackages(err)).toEqual(["esbuild", "@swc/core"]);
	});

	test("accepts a raw string in addition to an Error", ({ expect }) => {
		expect(
			extractIgnoredBuildPackages(
				"[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: sharp@0.34.5"
			)
		).toEqual(["sharp"]);
	});

	test("returns an empty array when no list can be parsed", ({ expect }) => {
		expect(extractIgnoredBuildPackages(new Error("network timeout"))).toEqual(
			[]
		);
		expect(extractIgnoredBuildPackages(undefined)).toEqual([]);
		expect(extractIgnoredBuildPackages(null)).toEqual([]);
		expect(extractIgnoredBuildPackages({ message: "anything" })).toEqual([]);
	});
});

describe("IgnoredBuildsError", () => {
	test("renders the parsed package list in the message", ({ expect }) => {
		const err = new IgnoredBuildsError(["@parcel/watcher", "lmdb"]);
		expect(err.message).toContain("@parcel/watcher");
		expect(err.message).toContain("lmdb");
		expect(err.packages).toEqual(["@parcel/watcher", "lmdb"]);
	});

	test("falls back to a placeholder when no packages are known", ({
		expect,
	}) => {
		const err = new IgnoredBuildsError([]);
		expect(err.message).toMatch(/unknown/);
	});

	test("`isIgnoredBuildsError` discriminates on instance, not message text", ({
		expect,
	}) => {
		expect(isIgnoredBuildsError(new IgnoredBuildsError(["x"]))).toBe(true);
		// Raw pnpm errors trip `isPnpmIgnoredBuildsError` but not `isIgnoredBuildsError`.
		const raw = new Error("[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: x");
		expect(isIgnoredBuildsError(raw)).toBe(false);
		expect(isPnpmIgnoredBuildsError(raw)).toBe(true);
	});

	test("preserves the underlying pnpm error as `cause`", ({ expect }) => {
		const original = new Error("raw pnpm output");
		const wrapped = new IgnoredBuildsError(["sharp"], original);
		expect(wrapped.cause).toBe(original);
	});
});
