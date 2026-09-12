import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";

const wranglerBin = path.resolve(
	import.meta.dirname,
	"../../../bin/wrangler.js"
);

describe("Wrangler executable", () => {
	runInTempDir();

	it("exits nonzero when its CLI child is killed by a signal", async ({
		expect,
	}) => {
		mkdirSync("bin");
		copyFileSync(wranglerBin, "bin/wrangler.js");
		writeFileSync(
			"mock-child-process.cjs",
			`const { EventEmitter } = require("node:events");
const childProcess = require("node:child_process");

childProcess.spawn = () => {
	const child = new EventEmitter();
	process.nextTick(() => child.emit("exit", null, "SIGTERM"));
	return child;
};
`
		);

		const result = await new Promise<{
			code: number | null;
			signal: NodeJS.Signals | null;
		}>((resolve, reject) => {
			const child = spawn(process.execPath, [
				"--require",
				path.resolve("mock-child-process.cjs"),
				path.resolve("bin/wrangler.js"),
			]);
			child.on("error", reject);
			child.on("exit", (code, signal) => resolve({ code, signal }));
		});

		expect(result).toEqual({ code: 143, signal: null });
	});
});
