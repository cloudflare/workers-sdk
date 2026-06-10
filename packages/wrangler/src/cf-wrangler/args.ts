/**
 * Strict argv parser for `cf-wrangler dev`. Only four flags are accepted;
 * unknown flags throw. The config file comes from wrangler's standard
 * discovery, not a flag.
 */
import { parseArgs as nodeParseArgs } from "node:util";

export interface DevArgs {
	mode?: string; // maps to wrangler's `env` (named environment)
	port?: number;
	host?: string; // acts-as-origin hostname (`dev.origin.hostname`)
	local?: boolean; // force local even if a resource sets `remote = true`
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
				mode: { type: "string" },
				host: { type: "string" },
				// `node:util.parseArgs` has no `number` type; coerce below.
				port: { type: "string" },
				local: { type: "boolean" },
			},
			strict: true,
			allowPositionals: false,
			// No `allowNegative`: `--no-local` should be an unknown-flag
			// error, not `local: false` (which would mean remote dev).
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
		// `0` = OS-assigned, so the valid range is 0–65535.
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
