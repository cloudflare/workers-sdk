import { existsSync } from "node:fs";
import { runCommand } from "@cloudflare/cli-shared-helpers/command";
import { CancelError } from "@cloudflare/cli-shared-helpers/error";
import { inputPrompt } from "@cloudflare/cli-shared-helpers/interactive";
import { npmInstall } from "helpers/packages";
import { isIgnoredBuildsError } from "helpers/pnpmBuildApprovals";
import { beforeEach, describe, test, vi } from "vitest";
import { mockPackageManager, mockSpinner } from "./mocks";
import type { IgnoredBuildsError } from "helpers/pnpmBuildApprovals";
import type { C3Context } from "types";

vi.mock("node:fs");
vi.mock("@cloudflare/cli-shared-helpers/command");
vi.mock("@cloudflare/cli-shared-helpers/interactive");
vi.mock("which-pm-runs");

const ctx = (): C3Context =>
	({
		project: { name: "x", path: "/tmp/x" },
	}) as unknown as C3Context;

const pnpmIgnoredBuildsError = (packagesLine: string): Error =>
	new Error(
		`Packages: +1\n+\n[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: ${packagesLine}\n\nRun "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.\n`
	);

describe("npmInstall", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mockSpinner();
		// project directory does not yet have node_modules
		vi.mocked(existsSync).mockReturnValue(false);
	});

	test("falls through to plain `npm install` for non-pnpm", async ({
		expect,
	}) => {
		mockPackageManager("npm");
		vi.mocked(runCommand).mockResolvedValueOnce("");

		await npmInstall(ctx());

		expect(runCommand).toHaveBeenCalledTimes(1);
		const [cmd] = vi.mocked(runCommand).mock.calls[0];
		expect(cmd).toEqual(["npm", "install"]);
	});

	test("skips entirely when node_modules already exists", async ({
		expect,
	}) => {
		mockPackageManager("pnpm", "11.5.1");
		vi.mocked(existsSync).mockReturnValue(true);

		await npmInstall(ctx());

		expect(runCommand).not.toHaveBeenCalled();
	});

	describe("pnpm", () => {
		beforeEach(() => {
			mockPackageManager("pnpm", "11.5.1");
		});

		test("runs a single `pnpm install` when nothing is flagged", async ({
			expect,
		}) => {
			vi.mocked(runCommand).mockResolvedValueOnce("");

			await npmInstall(ctx());

			expect(runCommand).toHaveBeenCalledTimes(1);
			const [cmd, opts] = vi.mocked(runCommand).mock.calls[0];
			expect(cmd).toEqual(["pnpm", "install"]);
			// Spinner managed outside runCommand to suppress noisy failure output.
			expect(opts).toMatchObject({ silent: true, useSpinner: false });
		});

		test("rethrows non-ignored-builds install failures verbatim", async ({
			expect,
		}) => {
			const networkErr = new Error("ENOTFOUND registry.npmjs.org");
			vi.mocked(runCommand).mockRejectedValueOnce(networkErr);

			await expect(npmInstall(ctx())).rejects.toBe(networkErr);
			expect(runCommand).toHaveBeenCalledTimes(1);
			expect(inputPrompt).not.toHaveBeenCalled();
		});

		test("prompt approved: runs `pnpm approve-builds <pkgs>` and retries install once", async ({
			expect,
		}) => {
			vi.mocked(inputPrompt).mockResolvedValueOnce(true);
			// 1) install fails with ignored builds, 2) approve-builds OK, 3) retry install OK
			vi.mocked(runCommand)
				.mockRejectedValueOnce(pnpmIgnoredBuildsError("@parcel/watcher@2.5.6"))
				.mockResolvedValueOnce("") // approve-builds
				.mockResolvedValueOnce(""); // retry install

			await npmInstall(ctx());

			expect(inputPrompt).toHaveBeenCalledTimes(1);
			expect(runCommand).toHaveBeenCalledTimes(3);
			expect(vi.mocked(runCommand).mock.calls[0][0]).toEqual([
				"pnpm",
				"install",
			]);
			// approve-builds is invoked with the parsed package list, NOT --all.
			expect(vi.mocked(runCommand).mock.calls[1][0]).toEqual([
				"pnpm",
				"approve-builds",
				"@parcel/watcher",
			]);
			expect(vi.mocked(runCommand).mock.calls[2][0]).toEqual([
				"pnpm",
				"install",
			]);
		});

		test("prompt declined: throws IgnoredBuildsError without running approve-builds", async ({
			expect,
		}) => {
			vi.mocked(inputPrompt).mockResolvedValueOnce(false);
			vi.mocked(runCommand).mockRejectedValueOnce(
				pnpmIgnoredBuildsError("@parcel/watcher@2.5.6")
			);

			let caught: unknown;
			await npmInstall(ctx()).catch((e) => {
				caught = e;
			});

			expect(isIgnoredBuildsError(caught)).toBe(true);
			expect((caught as IgnoredBuildsError).packages).toEqual([
				"@parcel/watcher",
			]);
			expect(runCommand).toHaveBeenCalledTimes(1); // no approve-builds, no retry
		});

		test("prompt cancelled (no TTY / Ctrl-C): throws IgnoredBuildsError carrying the parsed list", async ({
			expect,
		}) => {
			vi.mocked(inputPrompt).mockRejectedValueOnce(
				new CancelError("Operation cancelled")
			);
			vi.mocked(runCommand).mockRejectedValueOnce(
				pnpmIgnoredBuildsError("@parcel/watcher@2.5.6, lmdb@2.8.1")
			);

			let caught: unknown;
			await npmInstall(ctx()).catch((e) => {
				caught = e;
			});

			expect(isIgnoredBuildsError(caught)).toBe(true);
			expect((caught as IgnoredBuildsError).packages).toEqual([
				"@parcel/watcher",
				"lmdb",
			]);
			expect(runCommand).toHaveBeenCalledTimes(1); // no approve-builds, no retry
		});

		test("prompt errors for an unrelated reason: rethrows verbatim", async ({
			expect,
		}) => {
			const promptErr = new Error("rendering broke");
			vi.mocked(inputPrompt).mockRejectedValueOnce(promptErr);
			vi.mocked(runCommand).mockRejectedValueOnce(
				pnpmIgnoredBuildsError("@parcel/watcher@2.5.6")
			);

			await expect(npmInstall(ctx())).rejects.toBe(promptErr);
		});

		test("retry still fails with ignored builds: throws IgnoredBuildsError carrying the second list", async ({
			expect,
		}) => {
			vi.mocked(inputPrompt).mockResolvedValueOnce(true);
			vi.mocked(runCommand)
				.mockRejectedValueOnce(pnpmIgnoredBuildsError("@parcel/watcher@2.5.6"))
				.mockResolvedValueOnce("") // approve-builds
				.mockRejectedValueOnce(pnpmIgnoredBuildsError("lmdb@2.8.1")); // retry: new package flagged

			let caught: unknown;
			await npmInstall(ctx()).catch((e) => {
				caught = e;
			});

			expect(isIgnoredBuildsError(caught)).toBe(true);
			expect((caught as IgnoredBuildsError).packages).toEqual(["lmdb"]);
		});

		test("retry fails for an unrelated reason: rethrows verbatim", async ({
			expect,
		}) => {
			vi.mocked(inputPrompt).mockResolvedValueOnce(true);
			const retryErr = new Error("disk full");
			vi.mocked(runCommand)
				.mockRejectedValueOnce(pnpmIgnoredBuildsError("@parcel/watcher@2.5.6"))
				.mockResolvedValueOnce("") // approve-builds
				.mockRejectedValueOnce(retryErr);

			await expect(npmInstall(ctx())).rejects.toBe(retryErr);
		});

		test("unparseable ignored-builds error: throws IgnoredBuildsError with empty list", async ({
			expect,
		}) => {
			// pnpm error without a recognisable `Ignored build scripts:` line
			vi.mocked(runCommand).mockRejectedValueOnce(
				new Error("[ERR_PNPM_IGNORED_BUILDS] something unexpected")
			);

			let caught: unknown;
			await npmInstall(ctx()).catch((e) => {
				caught = e;
			});

			expect(isIgnoredBuildsError(caught)).toBe(true);
			expect((caught as IgnoredBuildsError).packages).toEqual([]);
			// We never prompt if we can't tell the user which packages need approval.
			expect(inputPrompt).not.toHaveBeenCalled();
		});
	});
});
