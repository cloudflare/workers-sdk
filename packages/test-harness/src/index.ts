import { startRuntime } from "./runtime";
import type { Runtime } from "./runtime";
import type { DispatchFetch, Json } from "miniflare";

export type TestHarnessOptions = {
	/**
	 * Base directory that relative `buildOutput` paths resolve from.
	 * Defaults to `process.cwd()`.
	 */
	root?: string | URL;
	/**
	 * Workers to run in this harness. The first Worker is the primary Worker.
	 */
	workers: WorkerInput[];
};

export type WorkerInput = {
	/**
	 * The project directory containing the build's `.cloudflare/output`.
	 * Relative paths resolve from the harness's `root`.
	 */
	buildOutput: string | URL;
	/**
	 * The Worker to run from that build, from `workers/<name>/` in its Build
	 * Output. Defaults to the build's default Worker.
	 */
	name?: string;
	/**
	 * Test-only vars that override vars from the Worker's config.
	 */
	vars?: Record<string, Json>;
	/**
	 * Test-only secrets that override values loaded from `.dev.vars` and `.env` files.
	 */
	secrets?: Record<string, string>;
	/**
	 * Test-only service binding overrides. Keys are binding names in this
	 * Worker's environment, and values are Worker names in this test harness.
	 */
	bindingOverrides?: Record<string, string>;
};

export type TestHarness = {
	/**
	 * Starts the runtime and returns its URL.
	 * Calling this more than once returns the same running runtime until the
	 * harness is closed.
	 */
	listen(): Promise<{
		url: URL;
	}>;
	/**
	 * Dispatches a fetch request to the primary Worker, starting the runtime
	 * if needed. Relative URLs are resolved against the URL returned by
	 * `listen()`.
	 */
	fetch: DispatchFetch;
	/**
	 * Stops the runtime and releases all its resources.
	 */
	close(): Promise<void>;
};

/**
 * Creates a test harness that runs Workers from their projects' Build Output.
 *
 * @param options The Workers to run, and their test values
 * @returns The test harness. Close it when done.
 */
export function createTestHarness(options: TestHarnessOptions): TestHarness {
	let runtime: Promise<Runtime> | undefined;
	function start(): Promise<Runtime> {
		runtime ??= startRuntime(options).catch((error: unknown) => {
			// Let the next call try again
			runtime = undefined;
			throw error;
		});
		return runtime;
	}

	return {
		async listen() {
			const { url } = await start();
			return { url };
		},
		async fetch(input, init) {
			const { mf, url } = await start();
			return mf.dispatchFetch(
				typeof input === "string" ? new URL(input, url) : input,
				init
			);
		},
		async close() {
			const closing = runtime;
			runtime = undefined;
			await (await closing)?.dispose();
		},
	};
}
