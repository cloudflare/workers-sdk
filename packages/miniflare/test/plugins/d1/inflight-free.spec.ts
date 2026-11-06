import assert from "node:assert";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ChildResult {
	/** Whether the argument stub was collected while the call was in flight */
	collected?: boolean;
	/** Whether a `FREE` for an in-flight call's argument completed before the call */
	freedWhileInFlight?: boolean;
	/** Whether the batch call completed successfully */
	batchSucceeded?: boolean;
	/** The error the batch call rejected with, if any */
	batchError?: string;
	/** Unexpected failure of the child process itself */
	childError?: string;
}

function runChild(): Promise<ChildResult> {
	return new Promise((resolve, reject) => {
		execFile(
			process.execPath,
			["--expose-gc", path.join(__dirname, "inflight-free-child.mjs")],
			{ timeout: 60_000 },
			(error, stdout, stderr) => {
				const lines = stdout.split("\n");
				for (let i = lines.length - 1; i >= 0; i--) {
					if (lines[i]!.startsWith("RESULT ")) {
						try {
							resolve(JSON.parse(lines[i]!.slice("RESULT ".length)));
							return;
						} catch {
							// Fall through to the reject below
						}
					}
				}
				reject(
					new Error(
						`child printed no result (exit: ${error ?? "0"}):\n` +
							`stdout:\n${stdout}\nstderr:\n${stderr}`
					)
				);
			}
		);
	});
}

test("an in-flight proxied call keeps its argument stubs alive (#16230)", async () => {
	const result = await runChild();
	assert.strictEqual(result.childError, undefined, result.childError ?? "");
	// While an async proxied call (here `database.batch()`) is in flight,
	// Miniflare must keep the stubs the call names reachable, so their
	// finalizers cannot free them on the runtime side before the call revives
	// its arguments. If the `FREE` wins the race, workerd fails the call with
	// `AssertionError: false == true` in the `Native` reviver.
	assert.strictEqual(
		result.batchSucceeded,
		true,
		`batch call failed: ${result.batchError ?? "unknown error"} ` +
			`(stub collected: ${result.collected}, freed while in flight: ` +
			`${result.freedWhileInFlight})`
	);
});
