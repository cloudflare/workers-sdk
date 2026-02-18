import { UserError } from "@cloudflare/workers-utils";
import { assert, describe, it } from "vitest";
import {
	runCommand,
	runCustomBuild,
} from "../deployment-bundle/run-custom-build";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";

describe("Custom Builds", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	it("runCustomBuild throws UserError when a command fails", async ({
		expect,
	}) => {
		try {
			await runCustomBuild(
				"/",
				"/",
				{ command: `node -e "process.exit(1)"` },
				undefined
			);
			assert(false, "Unreachable");
		} catch (e) {
			assert(e instanceof UserError);
			expect(e.message).toMatchInlineSnapshot(
				`"Running custom build \`node -e "process.exit(1)"\` failed. There are likely more logs from your build command above."`
			);
		}
	});

	describe("WRANGLER_COMMAND environment variable", () => {
		it("should set WRANGLER_COMMAND=dev when wranglerCommand is dev", async ({
			expect,
		}) => {
			await runCommand(
				`node -e "console.log('WRANGLER_COMMAND=' + process.env.WRANGLER_COMMAND)"`,
				process.cwd(),
				"[test]",
				"dev"
			);
			expect(std.out).toContain("WRANGLER_COMMAND=dev");
		});

		it("should set WRANGLER_COMMAND=deploy when wranglerCommand is deploy", async ({
			expect,
		}) => {
			await runCommand(
				`node -e "console.log('WRANGLER_COMMAND=' + process.env.WRANGLER_COMMAND)"`,
				process.cwd(),
				"[test]",
				"deploy"
			);
			expect(std.out).toContain("WRANGLER_COMMAND=deploy");
		});

		it("should set WRANGLER_COMMAND for versions upload", async ({
			expect,
		}) => {
			await runCommand(
				`node -e "console.log('WRANGLER_COMMAND=' + process.env.WRANGLER_COMMAND)"`,
				process.cwd(),
				"[test]",
				"versions upload"
			);
			expect(std.out).toContain("WRANGLER_COMMAND=versions upload");
		});

		it("should set WRANGLER_COMMAND=types when wranglerCommand is types", async ({
			expect,
		}) => {
			await runCommand(
				`node -e "console.log('WRANGLER_COMMAND=' + process.env.WRANGLER_COMMAND)"`,
				process.cwd(),
				"[test]",
				"types"
			);
			expect(std.out).toContain("WRANGLER_COMMAND=types");
		});

		it("should not set WRANGLER_COMMAND when wranglerCommand is undefined", async ({
			expect,
		}) => {
			await runCommand(
				`node -e "console.log('WRANGLER_COMMAND=' + (process.env.WRANGLER_COMMAND || 'undefined'))"`,
				process.cwd(),
				"[test]"
			);
			expect(std.out).toContain("WRANGLER_COMMAND=undefined");
		});
	});
});
