import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";

const wranglerBin = path.resolve(
	import.meta.dirname,
	"../../../bin/wrangler.js"
);

async function runWranglerWithSignal(
	signal: "SIGINT" | "SIGTERM"
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
	mkdirSync("bin");
	copyFileSync(wranglerBin, "bin/wrangler.js");
	writeFileSync(
		"mock-child-process.cjs",
		`const { EventEmitter } = require("node:events");
const childProcess = require("node:child_process");

childProcess.spawn = () => {
	const child = new EventEmitter();
	child.kill = (signal) => {
		process.nextTick(() => child.emit("exit", null, signal));
	};
	return child;
};

const originalProcessOn = process.on;
process.on = function (eventName, listener) {
	const result = originalProcessOn.call(this, eventName, listener);
	if (eventName === "${signal}") {
		setImmediate(listener);
	}
	return result;
};
`
	);

	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [
			"--require",
			path.resolve("mock-child-process.cjs"),
			path.resolve("bin/wrangler.js"),
		]);
		child.on("error", reject);
		child.on("exit", (code, childSignal) =>
			resolve({ code, signal: childSignal })
		);
	});
}

describe("Wrangler executable", () => {
	runInTempDir();

	it("forwards SIGINT and exits with its shell status", async ({ expect }) => {
		const result = await runWranglerWithSignal("SIGINT");

		expect(result).toEqual({ code: 130, signal: null });
	});

	it("forwards SIGTERM and exits with its shell status", async ({ expect }) => {
		const result = await runWranglerWithSignal("SIGTERM");

		expect(result).toEqual({ code: 143, signal: null });
	});
});
