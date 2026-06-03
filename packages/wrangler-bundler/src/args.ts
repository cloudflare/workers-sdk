/**
 * Argv parser for `cf-wrangler dev [args...]`.
 *
 * Deliberately minimal: only the five flags the cf-dev parent
 * process needs to pass through are accepted. Everything else
 * belongs in the user's `wrangler.jsonc`. Built on `node:util`'s
 * built-in `parseArgs` (strict mode → unknown flags throw).
 */
import { parseArgs as nodeParseArgs } from "node:util";

export interface DevArgs {
	// Path to wrangler.jsonc / wrangler.toml.
	config?: string;
	// Named environment from wrangler.jsonc (`[env.X]`). Surfaced as
	// `--mode` rather than `--env` to align with the cf-dev parent
	// process's flag vocabulary; maps to wrangler's `env` option.
	mode?: string;
	// Listen port for the dev server.
	port?: number;
	// Acts-as-origin hostname override. Maps to wrangler's `--host`
	// (`dev.origin.hostname`).
	host?: string;
	// Force local execution even when `dev.remote` is set in config.
	local?: boolean;
}

export class ArgParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ArgParseError";
	}
}

export function parseArgs(argv: string[]): DevArgs {
	let parsed;
	try {
		parsed = nodeParseArgs({
			args: argv,
			options: {
				config: { type: "string" },
				mode: { type: "string" },
				host: { type: "string" },
				// `node:util.parseArgs` has no `number` type; coerce below.
				port: { type: "string" },
				local: { type: "boolean" },
			},
			strict: true,
			allowPositionals: false,
			// Deliberately NOT enabling `allowNegative`: `--no-local`
			// would map to `local: false`, which `unstable_dev` reads
			// as whole-worker remote dev — out of scope here. Falling
			// into the generic "unknown flag" error is the right UX.
		});
	} catch (err) {
		throw new ArgParseError(err instanceof Error ? err.message : String(err));
	}

	const out: DevArgs = {};
	if (parsed.values.config !== undefined) {
		out.config = parsed.values.config;
	}
	if (parsed.values.mode !== undefined) {
		out.mode = parsed.values.mode;
	}
	if (parsed.values.host !== undefined) {
		out.host = parsed.values.host;
	}
	if (parsed.values.port !== undefined) {
		const raw = parsed.values.port;
		const n = Number(raw);
		// TCP port range. `0` means "let the OS pick" — valid.
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
