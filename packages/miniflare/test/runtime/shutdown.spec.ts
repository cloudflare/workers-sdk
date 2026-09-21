import childProcess from "node:child_process";
import path from "node:path";
import { afterEach, beforeEach, test, vi } from "vitest";
import { Runtime } from "../../src/runtime";
import { FIXTURES_PATH } from "../test-shared";

vi.mock("../../src/plugins", () => ({
	SERVICE_LOOPBACK: "loopback",
	SOCKET_ENTRY: "entry",
}));

const unixTest = process.platform === "win32" ? test.skip : test.sequential;
let activeRuntime: Runtime | undefined;

type RuntimeTestOptions = {
	requiresGracefulShutdown?: boolean;
	ignoreSigterm?: boolean;
};

function updateRuntime(
	runtime: Runtime,
	{
		requiresGracefulShutdown = false,
		ignoreSigterm = true,
	}: RuntimeTestOptions = {}
) {
	return runtime.updateConfig(
		Buffer.alloc(0),
		{
			entryAddress: "127.0.0.1:0",
			loopbackAddress: "127.0.0.1:0",
			requiredSockets: ["entry"],
			requiresGracefulShutdown,
			runtimeEnv: ignoreSigterm
				? { LITTLE_WORKERD_SIGTERM: "ignore" }
				: undefined,
		},
		[],
		new AbortController().signal
	);
}

async function startRuntime(options: RuntimeTestOptions = {}) {
	const spawn = vi.spyOn(childProcess, "spawn");
	const kill = vi.spyOn(childProcess.ChildProcess.prototype, "kill");
	const runtime = new Runtime();
	activeRuntime = runtime;
	await updateRuntime(runtime, options);
	const runtimeProcess = spawn.mock.results[0].value;
	return {
		runtime,
		runtimeProcess,
		spawn,
		signals: () =>
			kill.mock.calls.flatMap(([signal], index) =>
				kill.mock.contexts[index] === runtimeProcess ? [signal] : []
			),
	};
}

beforeEach(() => {
	vi.stubEnv(
		"MINIFLARE_WORKERD_PATH",
		path.join(FIXTURES_PATH, "little-workerd.mjs")
	);
});

afterEach(async () => {
	await activeRuntime?.disposeImmediately();
	activeRuntime = undefined;
	vi.useRealTimers();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

unixTest("ordinary disposal remains immediate", async ({ expect }) => {
	const { runtime, signals } = await startRuntime();

	await runtime.dispose();

	expect(signals()).toEqual(["SIGKILL"]);
});

unixTest("graceful disposal is single-flight", async ({ expect }) => {
	const { runtime, signals } = await startRuntime({
		requiresGracefulShutdown: true,
		ignoreSigterm: false,
	});

	const first = runtime.dispose();
	const second = runtime.dispose();

	expect(first).toBe(second);
	await first;
	expect(signals()).toEqual(["SIGTERM"]);
});

unixTest("graceful disposal has a deadline", async ({ expect }) => {
	const { runtime, signals } = await startRuntime({
		requiresGracefulShutdown: true,
	});
	vi.useFakeTimers();

	const disposal = runtime.dispose();
	expect(signals()).toEqual(["SIGTERM"]);
	await vi.advanceTimersByTimeAsync(5_000);
	await disposal;

	expect(signals()).toEqual(["SIGTERM", "SIGKILL"]);
});

unixTest(
	"immediate disposal escalates graceful disposal",
	async ({ expect }) => {
		const { runtime, runtimeProcess, signals } = await startRuntime({
			requiresGracefulShutdown: true,
		});

		const graceful = runtime.dispose();
		expect(runtimeProcess.stdout.destroyed).toBe(false);
		const immediate = runtime.disposeImmediately();

		expect(immediate).toBe(graceful);
		await graceful;
		expect(signals()).toEqual(["SIGTERM", "SIGKILL"]);
		expect(runtimeProcess.stdout.destroyed).toBe(true);
	}
);

unixTest("replacement waits for graceful disposal", async ({ expect }) => {
	const { runtime, spawn } = await startRuntime({
		requiresGracefulShutdown: true,
	});
	vi.useFakeTimers();

	const update = updateRuntime(runtime);
	await vi.advanceTimersByTimeAsync(4_999);
	expect(spawn).toHaveBeenCalledTimes(1);
	await vi.advanceTimersByTimeAsync(1);
	await update;
	expect(spawn).toHaveBeenCalledTimes(2);

	await runtime.disposeImmediately();
});
