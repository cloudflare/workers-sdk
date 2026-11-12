import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { fetch } from "undici";
import { afterEach, describe, it, vi } from "vitest";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runWrangler } from "../helpers/run-wrangler";
import type { StartDevOptions } from "../../dev";

/**
 * Regression tests for https://github.com/cloudflare/workers-sdk/issues/10646
 *
 * A failing custom build during `wrangler dev` should be handled like a
 * failing standard build: Wrangler logs it, keeps running, and the next edit
 * that fixes the build brings the Worker back.
 */

let stopDev: (() => Promise<void>) | undefined;
vi.mock("../../dev/start-dev", async () => {
	const actual = await vi.importActual<typeof import("../../dev/start-dev")>(
		"../../dev/start-dev"
	);
	return {
		...actual,
		async startDev(options: StartDevOptions) {
			const result = await actual.startDev(options);
			stopDev = () => result.devEnv.teardown();
			return result;
		},
	};
});

// Startup and reloads have taken over 20 seconds on shared Windows runners.
const READY_TIMEOUT = 45_000;
const TEST_TIMEOUT = 120_000;

const CUSTOM_BUILD_FAILED =
	"Running custom build `node build.mjs` failed. There are likely more logs from your build command above.";

/**
 * A stand-in for a real build tool: it fails on a syntax error in
 * `src/index.js`, and otherwise copies it to `dist/index.js`.
 */
const buildScript = `
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const source = readFileSync("src/index.js", "utf8");
try {
	new Function(source.replace("export default", "return"));
} catch (e) {
	console.error("Syntax error: " + e.message);
	process.exit(1);
}
mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.js", source);
`;

const workerSource = (body: string) =>
	`export default { fetch() { return new Response(${JSON.stringify(body)}); } };\n`;
// The closing brace of the default export is missing.
const brokenWorkerSource = `export default { fetch() { return new Response("broken"); }\n`;

const wranglerConfig = (vars: Record<string, string> = {}) =>
	JSON.stringify(
		{
			name: "custom-build-errors",
			main: "dist/index.js",
			compatibility_date: "2025-09-01",
			build: { command: "node build.mjs", watch_dir: "src" },
			vars,
		},
		null,
		2
	);

const std = mockConsoleMethods();

function countOccurrences(haystack: string, needle: string) {
	return haystack.split(needle).length - 1;
}

async function startCustomBuildDev() {
	await seed({
		"wrangler.jsonc": wranglerConfig(),
		"build.mjs": buildScript,
		"src/index.js": workerSource("v1"),
	});

	const stopped = runWrangler("dev --port=0 --inspector-port=0", {
		// Config changes are only picked up when config watching is enabled.
		WRANGLER_CI_DISABLE_CONFIG_WATCHING: "false",
	});
	// `wrangler dev` only settles once it has exited.
	const exit: { exited: boolean; error?: unknown } = { exited: false };
	stopped.then(
		() => (exit.exited = true),
		(error: unknown) => {
			exit.exited = true;
			exit.error = error;
		}
	);

	const match = await Promise.race([
		vi.waitUntil(() => std.out.match(/Ready on (?<url>http:\/\/[^:]+:\d+)/), {
			timeout: READY_TIMEOUT,
		}),
		stopped.then(() => {
			throw new Error("Wrangler dev exited before ready");
		}),
	]);
	const url = match?.groups?.url;
	if (!url) {
		throw new Error(`No local dev URL: ${std.out}`);
	}
	return { url, exit };
}

function describeExit(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	// `wrangler dev` rejects with the dev environment's fatal error event.
	if (typeof error === "object" && error !== null && "reason" in error) {
		const { source, reason, cause } = error as {
			source?: string;
			reason?: string;
			cause?: { message?: string };
		};
		return `${source}: ${reason}: ${cause?.message}`;
	}
	return String(error);
}

/** Fails as soon as `wrangler dev` has exited, naming why. */
function assertStillRunning(exit: { exited: boolean; error?: unknown }) {
	if (exit.exited) {
		throw new Error(`wrangler dev exited: ${describeExit(exit.error)}`);
	}
}

async function waitForResponse(
	url: string,
	exit: { exited: boolean; error?: unknown },
	expected: string
) {
	await vi.waitFor(
		async () => {
			assertStillRunning(exit);
			const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
			if ((await response.text()) !== expected) {
				throw new Error(`Worker did not respond with ${expected} yet`);
			}
		},
		{ timeout: READY_TIMEOUT, interval: 250 }
	);
}

describe("wrangler dev custom build errors", { concurrent: false }, () => {
	runInTempDir();

	afterEach(async () => {
		await stopDev?.();
		stopDev = undefined;
	});

	it(
		"keeps running when the custom build fails after a source edit, and recovers on the next edit",
		{ timeout: TEST_TIMEOUT },
		async ({ expect }) => {
			const { url, exit } = await startCustomBuildDev();
			await waitForResponse(url, exit, "v1");

			// A syntax error makes the custom build command fail.
			await seed({ "src/index.js": brokenWorkerSource });
			await vi.waitFor(
				() => {
					assertStillRunning(exit);
					expect(std.err).toContain(CUSTOM_BUILD_FAILED);
				},
				{ timeout: READY_TIMEOUT }
			);

			// Fixing the syntax error brings the Worker back.
			await seed({ "src/index.js": workerSource("v2") });
			await waitForResponse(url, exit, "v2");
			expect(exit.exited).toBe(false);
		}
	);

	it(
		"keeps running when a config file change re-runs a custom build that fails",
		{ timeout: TEST_TIMEOUT },
		async ({ expect }) => {
			const { url, exit } = await startCustomBuildDev();
			await waitForResponse(url, exit, "v1");

			// A syntax error makes the custom build command fail.
			await seed({ "src/index.js": brokenWorkerSource });
			await vi.waitFor(
				() => {
					assertStillRunning(exit);
					expect(countOccurrences(std.err, CUSTOM_BUILD_FAILED)).toBe(1);
				},
				{ timeout: READY_TIMEOUT }
			);

			// Editing the config file while the build is still broken re-runs the
			// custom build command, which fails again. That failure must not end
			// the dev session either.
			await seed({ "wrangler.jsonc": wranglerConfig({ EDITED: "true" }) });
			await vi.waitFor(
				() =>
					expect(
						countOccurrences(std.err, CUSTOM_BUILD_FAILED)
					).toBeGreaterThanOrEqual(2),
				{ timeout: READY_TIMEOUT }
			);
			// Give an exit triggered by that failure time to happen.
			await new Promise((resolve) => setTimeout(resolve, 1_000));
			assertStillRunning(exit);

			// Fixing the syntax error brings the Worker back.
			await seed({ "src/index.js": workerSource("v2") });
			await waitForResponse(url, exit, "v2");
			expect(exit.exited).toBe(false);
		}
	);
});
