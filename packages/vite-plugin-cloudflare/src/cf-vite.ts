/**
 * `cf-vite` delegate binary entry point for `@cloudflare/vite-plugin`.
 *
 * EXPERIMENTAL / internal: spawned by Cloudflare's "cf-dev" parent
 * process, not invoked directly by end users. Contract may change.
 *
 * Usage: `<pkgRoot>/bin/cf-vite <verb> [flags...]`. `dev` is the only
 * verb today; future verbs follow the same shape. Unknown/missing verbs
 * exit 2 (also the parent's version-detection signal).
 *
 * Spawn contract for `dev`: parent uses `stdio: "inherit"` and forwards
 * SIGINT/SIGTERM. Accepted flags mirror the sibling `cf-wrangler`
 * delegate (`--mode`, `--port`, `--host`, `--local`) so the parent can
 * drive either impl interchangeably; everything else lives in the user's
 * `vite.config.ts` / `wrangler.jsonc` (including the wrangler config
 * file, which is discovered by `cloudflare()` itself). `cf-vite` boots
 * Vite via `createServer()` against the user's own config (expected to
 * include `cloudflare()`); flags are bridged to it as documented inline.
 *
 * Exit codes: 0 graceful, 2 unknown verb / parse error, 130 SIGINT,
 * 143 SIGTERM.
 */

import { parseArgs as nodeParseArgs } from "node:util";
import { createServer } from "vite";
import type { InlineConfig, ServerOptions } from "vite";

interface DevArgs {
	mode?: string;
	port?: number;
	host?: string;
	local?: boolean;
}

class ArgParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ArgParseError";
	}
}

/** Strict argv parser; mirrors `cf-wrangler`'s flags (unknown → throw). */
function parseArgs(argv: string[]): DevArgs {
	let parsed;
	try {
		parsed = nodeParseArgs({
			args: argv,
			options: {
				mode: { type: "string" },
				host: { type: "string" },
				// `node:util.parseArgs` has no `number` type; coerce below.
				port: { type: "string" },
				local: { type: "boolean" },
			},
			strict: true,
			allowPositionals: false,
		});
	} catch (err) {
		throw new ArgParseError(err instanceof Error ? err.message : String(err));
	}

	const out: DevArgs = {};
	if (parsed.values.mode !== undefined) {
		out.mode = parsed.values.mode;
	}
	if (parsed.values.host !== undefined) {
		out.host = parsed.values.host;
	}
	if (parsed.values.port !== undefined) {
		const raw = parsed.values.port;
		const n = Number(raw);
		// TCP port range; 0 = OS-assigned.
		if (!Number.isInteger(n) || n < 0 || n > 65535) {
			throw new ArgParseError(
				`--port expects an integer between 0 and 65535, got "${raw}"`
			);
		}
		out.port = n;
	}
	if (parsed.values.local !== undefined) {
		out.local = parsed.values.local;
	}

	return out;
}

async function main(): Promise<number> {
	// argv: [0] node [1] cf-vite.mjs [2] verb [3+] forwarded flags.
	const verb = process.argv[2];
	const userArgv = process.argv.slice(3);

	if (verb !== "dev") {
		// Format mirrors `cf-wrangler`.
		process.stderr.write(
			`Error: unknown subcommand "${verb ?? ""}".\n` +
				`Usage: cf-vite dev [args]\n`
		);
		return 2;
	}

	let args: DevArgs;
	try {
		args = parseArgs(userArgv);
	} catch (err) {
		if (err instanceof ArgParseError) {
			process.stderr.write(`Error: ${err.message}\n`);
			return 2;
		}
		throw err;
	}

	// Bridge plugin-owned flags via env vars the plugin reads during config
	// resolution — must be set before `createServer()`.
	//   - `--local`: overrides `remoteBindings` outright, mirroring
	//     `wrangler dev --local` (force local even if config opts into
	//     remote).
	if (args.local) {
		process.env.CLOUDFLARE_VITE_FORCE_LOCAL = "true";
	}

	// Bridge Vite-owned flags via inline config; the rest auto-loads from
	// the user's `vite.config.{ts,js,mjs}` (which supplies `cloudflare()`).
	const serverOptions: ServerOptions = {};
	if (args.port !== undefined) {
		serverOptions.port = args.port;
	}
	if (args.host !== undefined) {
		serverOptions.host = args.host;
	}
	const inlineConfig: InlineConfig = { server: serverOptions };
	if (args.mode !== undefined) {
		inlineConfig.mode = args.mode;
	}

	const server = await createServer(inlineConfig);

	await server.listen();
	server.printUrls();
	server.bindCLIShortcuts({ print: true });

	// Close cleanly on signal so the dev registry entry, workerd
	// subprocess, and ports release. `closing` guards against a
	// double-signal (e.g. rapid Ctrl+C, or SIGINT then SIGTERM) racing
	// two `server.close()` / `process.exit()` calls.
	let closing = false;
	const shutdown = (signal: NodeJS.Signals) => {
		if (closing) {
			return;
		}
		closing = true;
		// Signal handlers can't be async; void the IIFE to avoid unhandled
		// rejections if `close()` throws.
		void (async () => {
			try {
				await server.close();
				process.exit(0);
			} catch {
				// Forced-exit: terminate with the 128+N code rather than
				// hang. SIGINT=130, SIGTERM=143.
				process.exit(signal === "SIGINT" ? 130 : 143);
			}
		})();
	};
	process.on("SIGINT", () => shutdown("SIGINT"));
	process.on("SIGTERM", () => shutdown("SIGTERM"));

	// Keep the event loop alive until a signal handler exits; Vite's own
	// handles (HTTP listener, watchers, workerd) hold the process open.
	return new Promise<number>(() => {});
}

// Let unhandled rejections propagate — Node prints the stack and exits
// non-zero, which the parent surfaces via inherited stdio.
const exitCode = await main();
process.exit(exitCode);
