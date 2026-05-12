/**
 * `cf-vite` delegate binary entry point for `@cloudflare/vite-plugin`.
 *
 * The plugin's delegate ships a small CLI that dispatches on a leading
 * subcommand verb. Today it accepts only `dev` (long-running Vite dev
 * server with the cloudflare plugin); future verbs (`build`,
 * `deploy`, etc.) will follow the same shape.
 *
 *   <pkgRoot>/bin/cf-vite <verb> [user-argv...]
 *
 * Spawn contract for the `dev` verb:
 *
 *   - Parent process spawns this binary with `stdio: "inherit"` and
 *     forwards SIGINT/SIGTERM.
 *   - The parent does NOT read or pass project config — interpreting
 *     the project (vite.config.ts, wrangler.jsonc, etc.) is this entry
 *     point's responsibility.
 *
 * Responsibilities (`dev` verb):
 *
 *   - Strip the leading `dev` discriminator argv token.
 *   - Boot a long-running Vite dev server. Vite's `createServer()` is
 *     called with NO inline plugin config so it auto-loads the user's
 *     `vite.config.ts` from cwd. The user's vite config is expected to
 *     include `cloudflare()` (canonical setup) — that is where the
 *     plugin runs and where `wrangler.jsonc` etc. are read.
 *   - Print URLs and bind interactive CLI shortcuts (h/r/q/etc.).
 *   - Forward SIGINT/SIGTERM to a clean `server.close()`; exit 0 on
 *     graceful shutdown, non-zero on error.
 *
 * v1 limitation: user argv after the discriminator token is currently
 * ignored. Vite's `createServer()` takes a programmatic config object,
 * not a parsed argv vector — wiring through `--port`, `--host`, etc.
 * requires an argv parser tailored to whichever Vite version is
 * resolved at runtime. Out of scope for the initial subcommand
 * contract.
 */

import { createServer } from "vite";

async function main(): Promise<number> {
	// argv layout when spawned via the bin shim:
	//   [0] node
	//   [1] /path/to/dist/cf-vite.mjs (resolved by the bin shim)
	//   [2] "<verb>"  ← subcommand discriminator the parent inserts
	//   [3+] user argv forwarded from the parent invocation
	const verb = process.argv[2];
	const userArgv = process.argv.slice(3);
	void userArgv;

	if (verb !== "dev") {
		// Unknown / missing verb. The parent's "version check" relies on
		// this binary erroring on unsupported verbs (no JSON handshake).
		// `dev` is the only verb today.
		console.error(
			`cf-vite: unknown subcommand ${verb ? JSON.stringify(verb) : "(missing)"}\n` +
				`Available subcommands: dev`
		);
		return 2;
	}

	// No options: Vite auto-loads `vite.config.{ts,js,mjs}` from cwd.
	// The user's config supplies `cloudflare()` and any other plugins.
	const server = await createServer();

	await server.listen();
	server.printUrls();
	server.bindCLIShortcuts({ print: true });

	// Graceful-shutdown handlers. The parent forwards SIGINT/SIGTERM
	// from the user's terminal; we must close the server cleanly so the
	// dev registry entry, miniflare workerd subprocess, and any open
	// ports release before we exit.
	const shutdown = (signal: NodeJS.Signals) => {
		// Best-effort close. Wrap in a void IIFE since signal handlers
		// can't be async and we don't want unhandled rejections if
		// `server.close()` throws during teardown.
		void (async () => {
			try {
				await server.close();
				process.exit(0);
			} catch {
				// Forced-exit path: if cleanup fails, still terminate
				// with the conventional 128+N exit code for the signal
				// rather than hanging. SIGINT=2 (130), SIGTERM=15 (143).
				const code = signal === "SIGINT" ? 130 : 143;
				process.exit(code);
			}
		})();
	};
	process.on("SIGINT", () => shutdown("SIGINT"));
	process.on("SIGTERM", () => shutdown("SIGTERM"));

	// Idle-loop: keep the event loop alive until a signal handler calls
	// `process.exit()`. The promise is intentionally never resolved —
	// Vite's server runs on its own internal handles (HTTP listener, fs
	// watchers, miniflare workerd) so we don't need an active timer.
	return new Promise<number>(() => {});
}

// Top-level invocation. We let unhandled rejections propagate naturally
// — Node will print the stack and exit non-zero, which the parent
// surfaces via inherited stdio. No bespoke catch/format here; Vite's
// own error pipeline already produces the user-facing diagnostics.
const exitCode = await main();
process.exit(exitCode);
