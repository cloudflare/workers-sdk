/**
 * Strict argv parsers for `cf-wrangler` delegate verbs. The config file comes
 * from wrangler's standard discovery, not a flag.
 */
import { parseArgs as nodeParseArgs } from "node:util";
import yargs from "yargs/yargs";
import { demandSingleValue } from "../core/helpers";
import { devArgs, validateDevArgs } from "../dev/args";
import type { StartDevOptions } from "../dev";

export interface BuildArgs {
	mode?: string; // maps to wrangler's `env` (named environment)
}

export class ArgParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ArgParseError";
	}
}

/** Parse forwarded server arguments into options consumed directly by startDev. */
export function parseArgs(argv: string[]): StartDevOptions {
	return parseDevArgs(argv);
}

/**
 * Reuse Wrangler's dev options, aliases, defaults, and choice validation.
 * cf owns config discovery and mode selection, and only runs local dev.
 */
export function parseDevArgs(argv: string[]): StartDevOptions {
	const {
		script,
		remote,
		"experimental-new-config": experimentalNewConfig,
		...serverArgs
	} = devArgs;
	const options = {
		...serverArgs,
		mode: { type: "string", requiresArg: true },
		port: { ...serverArgs.port, requiresArg: true, coerce: parsePort },
		"inspector-port": {
			...serverArgs["inspector-port"],
			requiresArg: true,
			coerce: parseInspectorPort,
		},
	} as const;

	try {
		const parser = yargs(argv)
			.exitProcess(false)
			.help(false)
			.version(false)
			.strict()
			.showHelpOnFail(false)
			.parserConfiguration({
				"parse-numbers": false,
				"parse-positional-numbers": false,
				"strip-aliased": true,
			})
			.options(options)
			.fail((message, error) => {
				throw error ?? new ArgParseError(message);
			});

		for (const [key, option] of Object.entries(options)) {
			if (!("array" in option && option.array)) {
				parser.check(demandSingleValue(key));
			}
		}
		const { mode, ...parsed } = parser.parseSync();
		if (parsed._.length > 0) {
			throw new ArgParseError("Unexpected positional arguments");
		}
		if (parsed.local === false) {
			throw new ArgParseError("--no-local and --local=false are not supported");
		}

		const devOptions: StartDevOptions = {
			...parsed,
			env: mode,
			remote: false,
			experimentalNewConfig: true,
			experimentalAutoCreate: false,
			experimentalProvision: false,
			types: parsed.types ?? false,
			config: undefined,
			script: undefined,
			cwd: undefined,
			v: undefined,
			envFile: undefined,
		};
		validateDevArgs(devOptions);
		return devOptions;
	} catch (err) {
		throw new ArgParseError(err instanceof Error ? err.message : String(err));
	}
}

function parsePort(value: number): number {
	return validatePort("port", value);
}

function parseInspectorPort(value: number): number {
	return validatePort("inspector-port", value);
}

function validatePort(name: string, value: number): number {
	// `0` lets the OS assign an available port.
	if (!Number.isInteger(value) || value < 0 || value > 65535) {
		throw new ArgParseError(
			`--${name} expects an integer between 0 and 65535, got "${value}"`
		);
	}
	return value;
}

export function parseBuildArgs(argv: string[]): BuildArgs {
	let parsed;
	try {
		parsed = nodeParseArgs({
			args: argv,
			options: {
				mode: { type: "string" },
			},
			strict: true,
			allowPositionals: false,
		});
	} catch (err) {
		throw new ArgParseError(err instanceof Error ? err.message : String(err));
	}

	const out: BuildArgs = {};
	if (parsed.values.mode !== undefined) {
		out.mode = parsed.values.mode;
	}

	return out;
}
