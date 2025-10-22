import { Writable } from "node:stream";
import { formatWithOptions } from "node:util";
import type { InspectOptions } from "node:util";

const originalConsole = console;

interface ConsoleOptions {
	stdout?: Writable;
	stderr?: Writable;
	ignoreErrors?: boolean; // ignored
	colorMode?: boolean | string;
	inspectOptions?: InspectOptions;
	groupIndentation?: number; // ignored
}

export class Console {
	readonly #stdout?: Writable;
	readonly #stderr?: Writable;
	readonly #inspectOptions: InspectOptions;

	constructor(stdout: Writable, stderr?: Writable, ignoreErrors?: boolean);
	constructor(opts: ConsoleOptions);
	constructor(
		opts: Writable | ConsoleOptions,
		stderr?: Writable,
		ignoreErrors?: boolean
	) {
		if (opts instanceof Writable) {
			opts = { stdout: opts, stderr, ignoreErrors };
		}
		this.#stdout = opts.stdout;
		this.#stderr = opts.stderr ?? this.#stdout;
		const colors =
			typeof opts.colorMode === "string" ? false : opts.colorMode ?? false;
		this.#inspectOptions = opts.inspectOptions ?? { colors };

		// Ensure methods are bound to the instance
		return new Proxy(this, {
			get(target, prop) {
				const value = target[prop as keyof Console];
				if (typeof value === "function") {
					return value.bind(target);
				}
				return value;
			},
		});
	}

	// Vitest expects this function to be called `value`:
	// https://github.com/vitest-dev/vitest/blob/v1.0.0-beta.5/packages/vitest/src/runtime/console.ts#L16
	value(stream: Writable, data: unknown[]): void {
		stream.write(formatWithOptions(this.#inspectOptions, ...data) + "\n");
	}

	assert(condition?: boolean, ...data: unknown[]): void {
		originalConsole.assert(condition, ...data);
	}
	clear(): void {
		originalConsole.clear();
	}
	count(label?: string): void {
		originalConsole.count(label);
	}
	countReset(label?: string): void {
		originalConsole.countReset(label);
	}
	debug(...data: unknown[]): void {
		if (this.#stdout === undefined) {
			originalConsole.debug(...data);
		} else {
			this.value(this.#stdout, data);
		}
	}
	dir(item?: unknown, options?: unknown): void {
		originalConsole.dir(item, options);
	}
	dirxml(...data: unknown[]): void {
		originalConsole.dirxml(...data);
	}
	error(...data: unknown[]): void {
		if (this.#stderr === undefined) {
			originalConsole.error(...data);
		} else {
			this.value(this.#stderr, data);
		}
	}
	group(...data: unknown[]): void {
		originalConsole.group(...data);
	}
	groupCollapsed(...data: unknown[]): void {
		originalConsole.groupCollapsed(...data);
	}
	groupEnd(): void {
		originalConsole.groupEnd();
	}
	info(...data: unknown[]): void {
		if (this.#stdout === undefined) {
			originalConsole.info(...data);
		} else {
			this.value(this.#stdout, data);
		}
	}
	log(...data: unknown[]): void {
		if (this.#stdout === undefined) {
			originalConsole.log(...data);
		} else {
			this.value(this.#stdout, data);
		}
	}
	table(tabularData?: unknown, properties?: string[]): void {
		originalConsole.table(tabularData, properties);
	}
	time(label?: string): void {
		originalConsole.time(label);
	}
	timeEnd(label?: string): void {
		originalConsole.timeEnd(label);
	}
	timeLog(label?: string, ...data: unknown[]): void {
		originalConsole.timeLog(label, ...data);
	}
	timeStamp(label?: string): void {
		originalConsole.timeStamp(label);
	}
	trace(...data: unknown[]): void {
		if (this.#stdout === undefined) {
			originalConsole.trace(...data);
		} else {
			this.value(this.#stdout, data);
		}
	}
	warn(...data: unknown[]): void {
		if (this.#stderr === undefined) {
			originalConsole.warn(...data);
		} else {
			this.value(this.#stderr, data);
		}
	}
}
