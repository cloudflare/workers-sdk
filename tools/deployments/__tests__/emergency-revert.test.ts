import { spawnSync } from "node:child_process";
import { afterEach, describe, it, vitest } from "vitest";
import {
	buildDeprecateCommand,
	buildDistTagCommand,
	DEFAULT_PACKAGES,
	parseCliArgs,
	parsePackageArg,
	revertRelease,
	validateSemver,
	verifyNpmAuth,
	verifyVersionExists,
} from "../emergency-revert";
import type { Mock } from "vitest";

vitest.mock("node:child_process", async () => {
	return {
		spawnSync: vitest.fn(),
	};
});

function mockSpawnSyncResult(status: number, stdout = "") {
	(spawnSync as Mock).mockReturnValue({
		status,
		stdout: Buffer.from(stdout),
	});
}

describe("parsePackageArg()", () => {
	it("parses a plain package name", ({ expect }) => {
		expect(parsePackageArg("wrangler@3.90.0:3.89.0")).toEqual({
			name: "wrangler",
			badVersion: "3.90.0",
			goodVersion: "3.89.0",
		});
	});

	it("parses a scoped package name", ({ expect }) => {
		expect(parsePackageArg("@cloudflare/vite-plugin@1.4.0:1.3.2")).toEqual({
			name: "@cloudflare/vite-plugin",
			badVersion: "1.4.0",
			goodVersion: "1.3.2",
		});
	});

	it("throws on a missing separator", ({ expect }) => {
		expect(() =>
			parsePackageArg("wrangler@3.90.0")
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Invalid --package value "wrangler@3.90.0". Expected format: name@badVersion:goodVersion]`
		);
	});

	it("throws on a missing version", ({ expect }) => {
		expect(() =>
			parsePackageArg("wrangler:3.89.0")
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Invalid --package value "wrangler:3.89.0". Expected format: name@badVersion:goodVersion]`
		);
	});

	it("throws on an invalid semver version", ({ expect }) => {
		expect(() =>
			parsePackageArg("wrangler@abc:3.89.0")
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Invalid semver version "abc" for --package wrangler@abc:3.89.0 (bad version)]`
		);
	});
});

describe("validateSemver()", () => {
	it("accepts a valid version", ({ expect }) => {
		expect(() => validateSemver("3.90.0", "test")).not.toThrow();
	});

	it("rejects an invalid version", ({ expect }) => {
		expect(() =>
			validateSemver("abc", "test")
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Invalid semver version "abc" for test]`
		);
	});
});

describe("buildDistTagCommand()", () => {
	it("builds the default latest tag command", ({ expect }) => {
		expect(buildDistTagCommand("wrangler", "3.89.0", "latest")).toEqual([
			"dist-tag",
			"add",
			"wrangler@3.89.0",
			"latest",
		]);
	});

	it("builds a command for a custom tag", ({ expect }) => {
		expect(buildDistTagCommand("wrangler", "3.89.0", "beta")).toEqual([
			"dist-tag",
			"add",
			"wrangler@3.89.0",
			"beta",
		]);
	});
});

describe("buildDeprecateCommand()", () => {
	it("builds the deprecate command", ({ expect }) => {
		expect(buildDeprecateCommand("wrangler", "3.90.0", "bad release")).toEqual([
			"deprecate",
			"wrangler@3.90.0",
			"bad release",
		]);
	});
});

describe("verifyVersionExists()", () => {
	afterEach(() => {
		(spawnSync as Mock).mockReset();
	});

	it("returns true when npm view succeeds", ({ expect }) => {
		mockSpawnSyncResult(0, "3.89.0\n");
		expect(verifyVersionExists("wrangler", "3.89.0")).toBe(true);
		expect(spawnSync).toHaveBeenCalledWith(
			"npm",
			["view", "wrangler@3.89.0", "version"],
			expect.any(Object)
		);
	});

	it("returns false when npm view fails", ({ expect }) => {
		mockSpawnSyncResult(1);
		expect(verifyVersionExists("wrangler", "999.0.0")).toBe(false);
	});
});

describe("verifyNpmAuth()", () => {
	afterEach(() => {
		(spawnSync as Mock).mockReset();
	});

	it("returns true when whoami succeeds", ({ expect }) => {
		mockSpawnSyncResult(0, "some-user\n");
		expect(verifyNpmAuth()).toBe(true);
		expect(spawnSync).toHaveBeenCalledWith(
			"npm",
			["whoami"],
			expect.any(Object)
		);
	});

	it("returns false when whoami fails", ({ expect }) => {
		mockSpawnSyncResult(1);
		expect(verifyNpmAuth()).toBe(false);
	});
});

describe("revertRelease()", () => {
	afterEach(() => {
		(spawnSync as Mock).mockReset();
		vitest.restoreAllMocks();
	});

	it("exits with an error when given an empty spec list", ({ expect }) => {
		vitest.spyOn(console, "error").mockImplementation(() => {});
		vitest.spyOn(process, "exit").mockImplementation(() => undefined as never);

		revertRelease([], { dryRun: true, tag: "latest" });

		expect(process.exit).toHaveBeenCalledWith(1);
		expect(spawnSync).not.toHaveBeenCalled();
	});

	it("in dry-run mode never calls dist-tag or deprecate", ({ expect }) => {
		mockSpawnSyncResult(0, "1.0.0\n");
		vitest.spyOn(console, "log").mockImplementation(() => {});

		revertRelease(
			[{ name: "wrangler", badVersion: "3.90.0", goodVersion: "3.89.0" }],
			{ dryRun: true, tag: "latest" }
		);

		const calledArgs = (spawnSync as Mock).mock.calls.map((call) => call[1]);
		expect(calledArgs.some((args) => args[0] === "dist-tag")).toBe(false);
		expect(calledArgs.some((args) => args[0] === "deprecate")).toBe(false);
		expect(calledArgs.some((args) => args[0] === "whoami")).toBe(false);
	});

	it("in execute mode calls dist-tag and deprecate for each package", ({
		expect,
	}) => {
		mockSpawnSyncResult(0, "1.0.0\n");
		vitest.spyOn(console, "log").mockImplementation(() => {});

		revertRelease(
			[{ name: "wrangler", badVersion: "3.90.0", goodVersion: "3.89.0" }],
			{ dryRun: false, tag: "latest" }
		);

		const calledArgs = (spawnSync as Mock).mock.calls.map((call) => call[1]);
		expect(calledArgs).toContainEqual([
			"dist-tag",
			"add",
			"wrangler@3.89.0",
			"latest",
		]);
		expect(
			calledArgs.some(
				(args) => args[0] === "deprecate" && args[1] === "wrangler@3.90.0"
			)
		).toBe(true);
	});

	it("aborts entirely when one package fails the registry preflight", ({
		expect,
	}) => {
		(spawnSync as Mock).mockImplementation((_cmd, args: string[]) => {
			if (args[1] === "wrangler@999.0.0") {
				return { status: 1, stdout: Buffer.from("") };
			}
			return { status: 0, stdout: Buffer.from("1.0.0\n") };
		});
		vitest.spyOn(console, "log").mockImplementation(() => {});
		vitest.spyOn(console, "error").mockImplementation(() => {});
		vitest.spyOn(process, "exit").mockImplementation(() => undefined as never);

		revertRelease(
			[
				{ name: "wrangler", badVersion: "999.0.0", goodVersion: "3.89.0" },
				{ name: "miniflare", badVersion: "4.0.0", goodVersion: "3.99.0" },
			],
			{ dryRun: false, tag: "latest" }
		);

		expect(process.exit).toHaveBeenCalledWith(1);
		const calledArgs = (spawnSync as Mock).mock.calls.map((call) => call[1]);
		expect(calledArgs.some((args) => args[0] === "dist-tag")).toBe(false);
		expect(calledArgs.some((args) => args[0] === "deprecate")).toBe(false);
	});

	it("blocks execution when npm auth fails", ({ expect }) => {
		(spawnSync as Mock).mockImplementation((_cmd, args: string[]) => {
			if (args[0] === "whoami") {
				return { status: 1, stdout: Buffer.from("") };
			}
			return { status: 0, stdout: Buffer.from("1.0.0\n") };
		});
		vitest.spyOn(console, "log").mockImplementation(() => {});
		vitest.spyOn(console, "error").mockImplementation(() => {});
		vitest.spyOn(process, "exit").mockImplementation(() => undefined as never);

		revertRelease(
			[{ name: "wrangler", badVersion: "3.90.0", goodVersion: "3.89.0" }],
			{ dryRun: false, tag: "latest" }
		);

		expect(process.exit).toHaveBeenCalledWith(1);
		const calledArgs = (spawnSync as Mock).mock.calls.map((call) => call[1]);
		expect(calledArgs.some((args) => args[0] === "dist-tag")).toBe(false);
		expect(calledArgs.some((args) => args[0] === "deprecate")).toBe(false);
	});
});

describe("parseCliArgs()", () => {
	afterEach(() => {
		vitest.restoreAllMocks();
	});

	it("exits with an error when no --package flag is given", ({ expect }) => {
		vitest.spyOn(console, "error").mockImplementation(() => {});
		vitest.spyOn(console, "log").mockImplementation(() => {});
		vitest.spyOn(process, "exit").mockImplementation(() => undefined as never);

		parseCliArgs([]);

		expect(process.exit).toHaveBeenCalledWith(1);
	});

	it("exits when a package isn't in the known set", ({ expect }) => {
		vitest.spyOn(console, "error").mockImplementation(() => {});
		vitest.spyOn(process, "exit").mockImplementation(() => undefined as never);

		parseCliArgs(["--package", "not-a-known-package@1.0.0:0.9.0"]);

		expect(process.exit).toHaveBeenCalledWith(1);
	});

	it("succeeds when an unknown package is paired with --allow-package", ({
		expect,
	}) => {
		const result = parseCliArgs([
			"--allow-package",
			"@cloudflare/pages-shared",
			"--package",
			"@cloudflare/pages-shared@1.0.0:0.9.0",
		]);

		expect(result.specs).toEqual([
			{
				name: "@cloudflare/pages-shared",
				badVersion: "1.0.0",
				goodVersion: "0.9.0",
			},
		]);
	});

	it("defaults to dry-run and the latest tag", ({ expect }) => {
		const result = parseCliArgs([
			"--package",
			`${DEFAULT_PACKAGES[0]}@1.0.0:0.9.0`,
		]);

		expect(result.dryRun).toBe(true);
		expect(result.tag).toBe("latest");
	});

	it("honors --execute and a custom --tag", ({ expect }) => {
		const result = parseCliArgs([
			"--package",
			`${DEFAULT_PACKAGES[0]}@1.0.0:0.9.0`,
			"--execute",
			"--tag",
			"beta",
		]);

		expect(result.dryRun).toBe(false);
		expect(result.tag).toBe("beta");
	});
});
