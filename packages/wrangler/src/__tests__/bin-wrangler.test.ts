import { spawn } from "node:child_process";
import { closeSync, openSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, test } from "vitest";

const { getWranglerStdio } = createRequire(import.meta.url)(
	"../../bin/wrangler.js"
) as { getWranglerStdio: (args: string[]) => unknown[] };

describe("bin/wrangler.js", () => {
	runInTempDir();

	describe("getWranglerStdio()", () => {
		test("inherits stdio and opens an IPC channel by default", ({ expect }) => {
			expect(getWranglerStdio(["deploy", "--dry-run"])).toEqual([
				"inherit",
				"inherit",
				"inherit",
				"ipc",
			]);
		});

		test("forwards open file descriptors passed as /dev/fd paths", ({
			expect,
		}) => {
			writeFileSync("secrets.env", "SECRET=value\n");
			const fd = openSync("secrets.env", "r");
			try {
				for (const args of [
					["deploy", "--secrets-file", `/dev/fd/${fd}`],
					["deploy", `--secrets-file=/dev/fd/${fd}`],
				]) {
					const stdio = getWranglerStdio(args);
					expect(stdio).toHaveLength(fd + 1);
					expect(stdio.slice(0, 4)).toEqual([
						"inherit",
						"inherit",
						"inherit",
						"ipc",
					]);
					expect(stdio[fd]).toBe(fd);
				}
			} finally {
				closeSync(fd);
			}
		});

		test("ignores /dev/fd paths for stdio, the IPC channel, and closed file descriptors", ({
			expect,
		}) => {
			writeFileSync("secrets.env", "SECRET=value\n");
			const fd = openSync("secrets.env", "r");
			closeSync(fd);
			for (const value of ["/dev/fd/0", "/dev/fd/3", `/dev/fd/${fd}`]) {
				expect(getWranglerStdio(["--secrets-file", value])).toEqual([
					"inherit",
					"inherit",
					"inherit",
					"ipc",
				]);
			}
		});

		test.skipIf(process.platform === "win32")(
			"lets the child process read a /dev/fd path from the parent",
			async ({ expect }) => {
				writeFileSync("secrets.env", "SECRET=value\n");
				const fd = openSync("secrets.env", "r");
				try {
					const filePath = `/dev/fd/${fd}`;
					const child = spawn(
						process.execPath,
						[
							"-e",
							`try { process.send(require("node:fs").readFileSync(process.argv[1], "utf8")); } catch (e) { process.send("error: " + e.code); }`,
							filePath,
						],
						{ stdio: getWranglerStdio(["--secrets-file", filePath]) as [] }
					);
					const message = await new Promise((resolve, reject) => {
						child.once("message", resolve);
						child.once("error", reject);
					});
					child.disconnect();
					expect(message).toBe("SECRET=value\n");
				} finally {
					closeSync(fd);
				}
			}
		);
	});
});
