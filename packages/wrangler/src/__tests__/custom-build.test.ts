import assert from "node:assert";
import { writeFileSync } from "node:fs";
import { UserError } from "@cloudflare/workers-utils";
import { describe, expect, it } from "vitest";
import { runCustomBuild, runCommand } from "../deployment-bundle/run-custom-build";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";

describe("Custom Builds", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	it("runCustomBuild throws UserError when a command fails", async () => {
		try {
			await runCustomBuild(
				"/",
				"/",
				{ command: `node -e "process.exit(1)"` },
				undefined
			);
			assert(false, "Unreachable");
		} catch (e) {
			expect(e).toBeInstanceOf(UserError);
			assert(e instanceof UserError);
			expect(e.message).toMatchInlineSnapshot(
				`"Running custom build \`node -e \\"process.exit(1)\\"\` failed. There are likely more logs from your build command above."`
			);
		}
	});

	describe("WRANGLER_COMMAND environment variable", () => {
		it("should set WRANGLER_COMMAND=dev when wranglerCommand is dev", async () => {
			const script = `console.log("WRANGLER_COMMAND=" + (process.env.WRANGLER_COMMAND || "undefined"))`;
			
			await runCommand(
				`node -e "${script}"`,
				process.cwd(),
				"[test]",
				"dev"
			);

			expect(std.out).toContain("WRANGLER_COMMAND=dev");
		});

		it("should set WRANGLER_COMMAND=deploy when wranglerCommand is deploy", async () => {
			const script = `console.log("WRANGLER_COMMAND=" + (process.env.WRANGLER_COMMAND || "undefined"))`;
			
			await runCommand(
				`node -e "${script}"`,
				process.cwd(),
				"[test]",
				"deploy"
			);

			expect(std.out).toContain("WRANGLER_COMMAND=deploy");
		});

		it("should set WRANGLER_COMMAND=versions upload when wranglerCommand is versions upload", async () => {
			const script = `console.log("WRANGLER_COMMAND=" + (process.env.WRANGLER_COMMAND || "undefined"))`;
			
			await runCommand(
				`node -e "${script}"`,
				process.cwd(),
				"[test]",
				"versions upload"
			);

			expect(std.out).toContain("WRANGLER_COMMAND=versions upload");
		});

		it("should set WRANGLER_COMMAND=types when wranglerCommand is types", async () => {
			const script = `console.log("WRANGLER_COMMAND=" + (process.env.WRANGLER_COMMAND || "undefined"))`;
			
			await runCommand(
				`node -e "${script}"`,
				process.cwd(),
				"[test]",
				"types"
			);

			expect(std.out).toContain("WRANGLER_COMMAND=types");
		});

		it("should not set WRANGLER_COMMAND when wranglerCommand is undefined", async () => {
			const script = `console.log("WRANGLER_COMMAND=" + (process.env.WRANGLER_COMMAND || "undefined"))`;
			
			await runCommand(
				`node -e "${script}"`,
				process.cwd(),
				"[test]"
			);

			expect(std.out).toContain("WRANGLER_COMMAND=undefined");
		});

		it("should pass WRANGLER_COMMAND through runCustomBuild for dev", async () => {
			writeFileSync("./test-entry.js", "// test entry");
			
			const script = `console.log("WRANGLER_COMMAND=" + (process.env.WRANGLER_COMMAND || "undefined"))`;
			
			await runCustomBuild(
				"./test-entry.js",
				"./test-entry.js",
				{ command: `node -e "${script}"` },
				undefined,
				"dev"
			);

			expect(std.out).toContain("WRANGLER_COMMAND=dev");
		});

		it("should pass WRANGLER_COMMAND through runCustomBuild for deploy", async () => {
			writeFileSync("./test-entry.js", "// test entry");
			
			const script = `console.log("WRANGLER_COMMAND=" + (process.env.WRANGLER_COMMAND || "undefined"))`;
			
			await runCustomBuild(
				"./test-entry.js",
				"./test-entry.js",
				{ command: `node -e "${script}"` },
				undefined,
				"deploy"
			);

			expect(std.out).toContain("WRANGLER_COMMAND=deploy");
		});

		it("should pass WRANGLER_COMMAND through runCustomBuild for versions upload", async () => {
			writeFileSync("./test-entry.js", "// test entry");
			
			const script = `console.log("WRANGLER_COMMAND=" + (process.env.WRANGLER_COMMAND || "undefined"))`;
			
			await runCustomBuild(
				"./test-entry.js",
				"./test-entry.js",
				{ command: `node -e "${script}"` },
				undefined,
				"versions upload"
			);

			expect(std.out).toContain("WRANGLER_COMMAND=versions upload");
		});

		it("should pass WRANGLER_COMMAND through runCustomBuild for types", async () => {
			writeFileSync("./test-entry.js", "// test entry");
			
			const script = `console.log("WRANGLER_COMMAND=" + (process.env.WRANGLER_COMMAND || "undefined"))`;
			
			await runCustomBuild(
				"./test-entry.js",
				"./test-entry.js",
				{ command: `node -e "${script}"` },
				undefined,
				"types"
			);

			expect(std.out).toContain("WRANGLER_COMMAND=types");
		});

		it("should not set WRANGLER_COMMAND when no command is provided to runCustomBuild", async () => {
			writeFileSync("./test-entry.js", "// test entry");
			
			const script = `console.log("WRANGLER_COMMAND=" + (process.env.WRANGLER_COMMAND || "undefined"))`;
			
			await runCustomBuild(
				"./test-entry.js",
				"./test-entry.js",
				{ command: `node -e "${script}"` },
				undefined
			);

			expect(std.out).toContain("WRANGLER_COMMAND=undefined");
		});
	});
});
