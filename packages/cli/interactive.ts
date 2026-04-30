/**
 * Interactive prompt module — thin adapter over `@clack/prompts`.
 *
 * `PromptConfig` mirrors `@clack/prompts`'s option shape directly
 * (`message`/`placeholder`/`initialValue`/`hint`/etc.) — there's no
 * field renaming layer. The wrapper only adds two cross-cutting
 * policies on top of clack:
 *
 *   1. **Centralised cancel handling.** Convert clack's cancel symbol
 *      to either `throw new CancelError(...)` (when `throwOnError`)
 *      or `process.exit(0)`. Saves repeating 5 lines at every callsite.
 *
 *   2. **`acceptDefault` short-circuit.** When a CLI flag has already
 *      supplied the value, skip the prompt and render a confirmation
 *      line instead. C3's `processArgument` relies on this.
 *
 * For everything else, prefer calling `@clack/prompts` directly.
 */

import { isCancel as clackIsCancel } from "@clack/core";
import * as clack from "@clack/prompts";
import chalk from "chalk";
import { CancelError } from "./error";

/**
 * Cross-cutting fields this wrapper layers on top of clack's
 * per-prompt option types.
 */
type PromptExtras = {
	/** When true, skip the prompt and use the configured default. */
	acceptDefault?: boolean;
	/** Throw `CancelError` on cancel instead of `process.exit(0)`. */
	throwOnError?: boolean;
	/** Sticky warning rendered before the prompt opens. */
	initialErrorMessage?: string | null;
	/** Optional value transformer used when displaying the auto-accepted default. */
	format?: (value: unknown) => string;
};

export type TextPromptConfig = PromptExtras &
	Parameters<typeof clack.text>[0] & { type: "text" };

export type ConfirmPromptConfig = PromptExtras &
	Parameters<typeof clack.confirm>[0] & { type: "confirm" };

export type SelectPromptConfig = PromptExtras &
	Parameters<typeof clack.select>[0] & { type: "select" };

export type MultiSelectPromptConfig = PromptExtras &
	Parameters<typeof clack.multiselect>[0] & { type: "multiselect" };

export type PromptConfig =
	| TextPromptConfig
	| ConfirmPromptConfig
	| SelectPromptConfig
	| MultiSelectPromptConfig;

/** clack-prompts' option shape, re-exported for callers that build option lists. */
export type Option = {
	value: string;
	label: string;
	hint?: string;
	disabled?: boolean;
};

/** Type-agnostic CLI argument value used by `processArgument`. */
export type Arg = string | boolean | string[] | undefined | number;

/**
 * Run a prompt and return its value.
 *
 * Wraps `@clack/prompts` with two cross-cutting policies:
 *   - If `acceptDefault` is true, render a confirmation line and skip
 *     the prompt.
 *   - On cancel, throw `CancelError` (when `throwOnError`) or exit 0.
 */
export const inputPrompt = async <T = string>(
	config: PromptConfig
): Promise<T> => {
	if (config.acceptDefault) {
		return acceptDefault<T>(config);
	}

	if (config.initialErrorMessage) {
		clack.log.warn(config.initialErrorMessage);
	}

	const result = await dispatch(config);

	if (clackIsCancel(result)) {
		if (config.throwOnError) {
			throw new CancelError("Operation cancelled");
		}
		clack.cancel("Operation cancelled");
		process.exit(0);
	}

	return result as T;
};

/**
 * Render the auto-accepted value as a clack-style submit line and
 * return it.
 */
function acceptDefault<T>(config: PromptConfig): T {
	const value = resolveDefault(config);
	const display = config.format?.(value) ?? String(value ?? "");
	const label = "message" in config ? config.message : "";
	clack.log.step(`${label} ${chalk.dim(display)}`);
	return value as T;
}

function resolveDefault(config: PromptConfig): unknown {
	switch (config.type) {
		case "text":
			return config.initialValue ?? config.defaultValue ?? "";
		case "confirm":
			return Boolean(config.initialValue);
		case "multiselect":
			return config.initialValues ?? [];
		case "select":
			return config.initialValue ?? "";
	}
}

function dispatch(config: PromptConfig): Promise<unknown> {
	const {
		type,
		acceptDefault: _a,
		throwOnError: _t,
		initialErrorMessage: _e,
		format: _f,
		...opts
	} = config;
	switch (type) {
		case "text":
			return clack.text(opts as Parameters<typeof clack.text>[0]);
		case "confirm":
			return clack.confirm(opts as Parameters<typeof clack.confirm>[0]);
		case "select":
			return clack.select(opts as Parameters<typeof clack.select>[0]);
		case "multiselect":
			return clack.multiselect(
				opts as Parameters<typeof clack.multiselect>[0]
			);
	}
}

/**
 * Test whether `stdin` and `stdout` are connected to a TTY.
 *
 * For the higher-level "should we treat this as interactive?" question
 * that also accounts for Cloudflare CI environments, use the default
 * export from `@cloudflare/cli-shared-helpers/is-interactive`.
 */
export function isInteractive(): boolean {
	try {
		return Boolean(process.stdin.isTTY && process.stdout.isTTY);
	} catch {
		return false;
	}
}

/** Direct re-export of clack's spinner. */
export const spinner = clack.spinner;

/**
 * Convenience helper: run a promise with a spinner running, surfacing
 * start/end messages.
 */
type FactoryOrValue<T> = T | (() => T);
const unwrapFactory = <T>(input: FactoryOrValue<T>): T =>
	typeof input === "function" ? (input as () => T)() : input;

export const spinnerWhile = async <T>(opts: {
	promise: FactoryOrValue<Promise<T>>;
	startMessage: FactoryOrValue<string>;
	endMessage?: FactoryOrValue<string>;
	spinner?: ReturnType<typeof spinner>;
}): Promise<T> => {
	const s = opts.spinner ?? spinner();
	s.start(unwrapFactory(opts.startMessage));
	try {
		return await unwrapFactory(opts.promise);
	} finally {
		s.stop(unwrapFactory(opts.endMessage));
	}
};


