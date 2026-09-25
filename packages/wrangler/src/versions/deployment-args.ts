import {
	CommandLineArgsError,
	parseHumanDuration,
} from "@cloudflare/workers-utils";
import type { NamedArgDefinitions } from "../core/types";
import type {
	Config,
	DurableObjectCodeUpdateStrategy,
} from "@cloudflare/workers-utils";

export const DEFAULT_DURABLE_OBJECTS_CODE_UPDATE_STRATEGY = {
	mode: "deferred",
	max_delay: 300,
} as const satisfies DurableObjectCodeUpdateStrategy;
const MAX_DURABLE_OBJECTS_CODE_UPDATE_DELAY_SECONDS = 24 * 60 * 60;
const DURABLE_OBJECTS_CODE_UPDATE_MODE_FLAG =
	"--durable-objects-code-update-mode";

export type DurableObjectsCodeUpdateMode =
	| { mode: "immediate" }
	| { mode: "deferred"; max_delay: number };

function parseDurableObjectsCodeUpdateMode(
	value: unknown
): DurableObjectsCodeUpdateMode {
	if (typeof value !== "string") {
		throwInvalidCodeUpdateMode();
	}
	const [mode, duration, ...extraValues] = value.trim().split(/\s+/);

	if (mode === "immediate" && duration === undefined) {
		return { mode };
	}
	if (
		mode === "deferred" &&
		duration !== undefined &&
		extraValues.length === 0
	) {
		const seconds = parseHumanDuration(duration);
		if (
			/\d/.test(duration) &&
			Number.isFinite(seconds) &&
			seconds >= 0 &&
			seconds <= MAX_DURABLE_OBJECTS_CODE_UPDATE_DELAY_SECONDS &&
			hasMillisecondPrecision(seconds)
		) {
			return { mode, max_delay: seconds };
		}
		throw new CommandLineArgsError(
			'The duration passed to "--durable-objects-code-update-mode deferred" must be between 0 seconds and 24 hours and use millisecond precision.',
			{ telemetryMessage: "durable objects code update delay invalid" }
		);
	}

	throwInvalidCodeUpdateMode();
}

function hasMillisecondPrecision(seconds: number): boolean {
	const milliseconds = seconds * 1000;
	const roundedMilliseconds = Math.round(milliseconds);
	// The tolerance absorbs float64 error, which reaches ~1e-8 ms near the
	// 24-hour maximum; a tighter bound would reject values such as 65536.001s.
	return (
		(seconds === 0 || roundedMilliseconds > 0) &&
		Math.abs(milliseconds - roundedMilliseconds) <= 1e-6
	);
}

function throwInvalidCodeUpdateMode(): never {
	throw new CommandLineArgsError(
		'The argument "--durable-objects-code-update-mode" must be either "immediate" or "deferred <duration>".',
		{ telemetryMessage: "durable objects code update mode invalid" }
	);
}

export function normalizeDurableObjectsCodeUpdateModeArgs(
	argv: string[]
): string[] {
	const normalizedArgv: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--") {
			normalizedArgv.push(...argv.slice(i));
			break;
		}
		const separateMode = arg === DURABLE_OBJECTS_CODE_UPDATE_MODE_FLAG;
		const inlineMode = arg.startsWith(
			`${DURABLE_OBJECTS_CODE_UPDATE_MODE_FLAG}=`
		)
			? arg.slice(DURABLE_OBJECTS_CODE_UPDATE_MODE_FLAG.length + 1)
			: undefined;
		const mode = separateMode ? argv[i + 1] : inlineMode;
		const durationIndex = i + (separateMode ? 2 : 1);
		const duration = argv[durationIndex];

		if (
			mode === "deferred" &&
			duration !== undefined &&
			(!duration.startsWith("-") ||
				Number.isFinite(parseHumanDuration(duration)))
		) {
			normalizedArgv.push(
				`${DURABLE_OBJECTS_CODE_UPDATE_MODE_FLAG}=deferred ${duration}`
			);
			i = durationIndex;
			continue;
		}
		normalizedArgv.push(arg);
	}
	return normalizedArgv;
}

export function resolveDurableObjectsCodeUpdateStrategy(
	codeUpdateMode: DurableObjectsCodeUpdateMode | undefined,
	codeUpdateStrategy: Config["durable_objects"]["code_update_strategy"]
): DurableObjectCodeUpdateStrategy {
	const strategy =
		codeUpdateMode ??
		codeUpdateStrategy ??
		DEFAULT_DURABLE_OBJECTS_CODE_UPDATE_STRATEGY;
	return strategy.mode === "immediate"
		? { mode: "immediate" }
		: {
				mode: "deferred",
				max_delay:
					strategy.max_delay ??
					DEFAULT_DURABLE_OBJECTS_CODE_UPDATE_STRATEGY.max_delay,
			};
}

export const durableObjectsCodeUpdateModeArg = {
	"durable-objects-code-update-mode": {
		describe:
			"How to update Durable Object code: immediate, or deferred followed by a maximum delay (for example, deferred 30s)",
		type: "string",
		requiresArg: true,
		coerce: parseDurableObjectsCodeUpdateMode,
	},
} as const satisfies NamedArgDefinitions;
