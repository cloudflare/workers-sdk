import { existsSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { UserError } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { assert, describe, it, vi } from "vitest";
import {
	runCommand,
	runCustomBuild,
} from "../deployment-bundle/run-custom-build";
import { mockConsoleMethods } from "./helpers/mock-console";
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

	it("runCommand aborts the custom build command", async ({ expect }) => {
		const aborter = new AbortController();
		const commandPromise = runCommand(
			`node -e "console.log('started'); setInterval(() => {}, 1000)"`,
			process.cwd(),
			"[test]",
			{ signal: aborter.signal }
		);

		await vi.waitFor(() => expect(std.out).toContain("started"));

		aborter.abort();
		await expect(commandPromise).rejects.toBeInstanceOf(Error);
	});

	it("runCommand aborts child processes spawned by shell commands", async ({
		expect,
	}) => {
		writeFileSync(
			"child.js",
			`
				const fs = require("node:fs");
				fs.writeFileSync("child-started.txt", "yes");
				setTimeout(() => fs.writeFileSync("child-finished.txt", "yes"), 750);
				setInterval(() => {}, 1000);
			`
		);
		writeFileSync(
			"parent.js",
			`
				const childProcess = require("node:child_process");
				childProcess.spawn(process.execPath, ["child.js"], { stdio: "inherit" });
				console.log("parent started");
				setInterval(() => {}, 1000);
			`
		);
		const aborter = new AbortController();
		const commandPromise = runCommand(
			"node parent.js",
			process.cwd(),
			"[test]",
			{
				signal: aborter.signal,
			}
		);

		await vi.waitFor(() => expect(existsSync("child-started.txt")).toBe(true));

		aborter.abort();
		await expect(commandPromise).rejects.toBeInstanceOf(Error);
		await sleep(1_000);
		expect(existsSync("child-finished.txt")).toBe(false);
	});

	describe("WRANGLER_COMMAND environment variable", () => {
		it("should set WRANGLER_COMMAND=dev when wranglerCommand is dev", async ({
			expect,
		}) => {
			await runCommand(
				`node -e "console.log('WRANGLER_COMMAND=' + process.env.WRANGLER_COMMAND)"`,
				process.cwd(),
				"[test]",
				{ wranglerCommand: "dev" }
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
				{ wranglerCommand: "deploy" }
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
				{ wranglerCommand: "versions upload" }
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
				{ wranglerCommand: "types" }
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
