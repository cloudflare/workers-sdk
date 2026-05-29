/**
 * `dev` verb handler for the `cf-wrangler` delegate binary.
 *
 * Thin adapter over `wrangler.unstable_dev` (which wraps `startDev` —
 * giving us DevEnv lifecycle, remote-bindings auth, and hotkeys for
 * free). Accepts only the five flags cf-dev passes through; the rest
 * comes from the user's wrangler config.
 */
import { unstable_dev } from "wrangler";
import { ArgParseError, parseArgs } from "./args.js";
import type { DevArgs } from "./args.js";
import type { Unstable_DevOptions, Unstable_DevWorker } from "wrangler";

/**
 * Run the bundler-based dev server until the user (or the parent
 * process) terminates it.
 *
 * Parses argv, calls `wrangler.unstable_dev`, blocks on the dev
 * session's lifetime, and translates SIGINT/SIGTERM into a clean
 * teardown. Returns the desired exit code; the bin shim is
 * responsible for `process.exit()`.
 *
 * @param argv argv slice **without** the `dev` subcommand token
 *   (e.g. `["--config", "wrangler.jsonc", "--port", "8788"]`).
 * @returns the process exit code: `0` on clean teardown, `2` on an
 *   argv parse error, `130` on SIGINT, `143` on SIGTERM.
 *
 * @example
 * ```ts
 * import { runDev } from "@cloudflare/wrangler-bundler";
 *
 * const code = await runDev(["--mode", "production", "--port", "8788"]);
 * process.exit(code);
 * ```
 */
export async function runDev(argv: string[]): Promise<number> {
	let parsed: DevArgs;
	try {
		parsed = parseArgs(argv);
	} catch (err) {
		if (err instanceof ArgParseError) {
			process.stderr.write(`Error: ${err.message}\n`);
			return 2;
		}
		throw err;
	}

	// SIGINT/SIGTERM fallback for non-TTY parents — hotkeys handle
	// the TTY case. Tracks both the signal AND a reference to the
	// server (which arrives asynchronously) so signals received during
	// `unstable_dev`'s startup phase don't get swallowed.
	let signalled: NodeJS.Signals | null = null;
	let server: Unstable_DevWorker | undefined;
	const onSignal = (sig: NodeJS.Signals) => {
		signalled = sig;
		// If startup has already produced a server, tear it down now.
		// Otherwise the post-await check below handles it.
		void server?.stop().catch((err) => {
			process.stderr.write(`teardown error: ${err}\n`);
		});
	};
	const onSigInt = () => onSignal("SIGINT");
	const onSigTerm = () => onSignal("SIGTERM");
	process.on("SIGINT", onSigInt);
	process.on("SIGTERM", onSigTerm);

	try {
		const options = {
			config: parsed.config,
			env: parsed.mode,
			port: parsed.port,
			local: parsed.local,
			host: parsed.host,
			experimental: {
				disableExperimentalWarning: true,
				// Both default to false in `unstable_dev` (suits its
				// test-harness origin); `wrangler dev` effectively
				// defaults both to true. Match `wrangler dev`.
				showInteractiveDevSession: true,
				enableContainers: true,
			},
		} as Unstable_DevOptions;

		// Entrypoint comes from `main` in wrangler config.
		server = await unstable_dev("", options);

		// Signal arrived during startup. Tear down immediately and
		// skip `waitUntilExit`.
		if (signalled !== null) {
			await server.stop().catch(() => {});
		} else {
			await server.waitUntilExit();
		}
	} finally {
		process.off("SIGINT", onSigInt);
		process.off("SIGTERM", onSigTerm);
		if (server) {
			try {
				await server.stop();
			} catch {
				// already torn down
			}
		}
	}

	if (signalled === "SIGINT") {
		return 130;
	}
	if (signalled === "SIGTERM") {
		return 143;
	}
	return 0;
}
