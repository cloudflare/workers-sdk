import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Runtime } from "miniflare";
import { test } from "vitest";

// A file with no execute bits cannot be executed by anyone, including the
// root user, so spawning it reliably fails with `EACCES` on every POSIX
// platform.
const STARTUP_DEADLINE_MS = 10_000;

function startRuntime(runtime: Runtime) {
	return runtime.updateConfig(
		Buffer.alloc(0),
		{
			entryAddress: "127.0.0.1:8787",
			loopbackAddress: "127.0.0.1:1234",
			requiredSockets: ["entry"],
			handleStructuredLogs() {},
		},
		[],
		new AbortController().signal
	);
}

type Outcome =
	| { status: "fulfilled" }
	| { status: "rejected"; error: unknown }
	| { status: "pending" };

/** Races `promise` against a deadline, reporting whether it ever settled. */
function observe(promise: PromiseLike<unknown>): Promise<Outcome> {
	return Promise.race([
		Promise.resolve(promise).then(
			() => ({ status: "fulfilled" as const }),
			(error: unknown) => ({ status: "rejected" as const, error })
		),
		new Promise<Outcome>((resolve) =>
			setTimeout(() => resolve({ status: "pending" as const }), STARTUP_DEADLINE_MS)
		),
	]);
}

test.skipIf(process.platform === "win32")(
	"rejects readiness and still disposes when workerd fails to spawn",
	async ({ expect, onTestFinished }) => {
		const directory = await mkdtemp(path.join(tmpdir(), "miniflare-spawn-failure-"));
		const executable = path.join(directory, "not-executable-workerd");
		await writeFile(executable, "#!/bin/sh\nexit 0\n");
		await chmod(executable, 0o600);
		onTestFinished(() => rm(directory, { recursive: true, force: true }));

		const previousWorkerdPath = process.env.MINIFLARE_WORKERD_PATH;
		process.env.MINIFLARE_WORKERD_PATH = executable;
		onTestFinished(() => {
			if (previousWorkerdPath === undefined) {
				delete process.env.MINIFLARE_WORKERD_PATH;
			} else {
				process.env.MINIFLARE_WORKERD_PATH = previousWorkerdPath;
			}
		});

		const runtime = new Runtime();
		const startup = startRuntime(runtime);
		onTestFinished(() => void Promise.resolve(runtime.dispose()));

		// A failed spawn emits `error` but never `exit`, so `updateConfig()`
		// must reject with the spawn failure rather than waiting forever.
		const startupOutcome = await observe(startup);
		if (startupOutcome.status !== "rejected") {
			throw new Error(
				`updateConfig() ${startupOutcome.status} after ${STARTUP_DEADLINE_MS}ms instead of rejecting with the spawn failure`
			);
		}
		expect(startupOutcome.error).toBeInstanceOf(Error);

		// Disposal must complete even though the runtime never started.
		const disposeOutcome = await observe(
			Promise.resolve(runtime.dispose()).then(() => undefined)
		);
		if (disposeOutcome.status !== "fulfilled") {
			throw new Error(
				`dispose() ${disposeOutcome.status} after ${STARTUP_DEADLINE_MS}ms following a failed spawn`
			);
		}
	}
);
