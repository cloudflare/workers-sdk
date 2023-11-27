/* eslint-disable @typescript-eslint/no-explicit-any */

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
		if (opts instanceof Writable) opts = { stdout: opts, stderr, ignoreErrors };
		this.#stdout = opts.stdout;
		this.#stderr = opts.stderr ?? this.#stdout;
		const colors =
			typeof opts.colorMode === "string" ? false : opts.colorMode ?? false;
		this.#inspectOptions = opts.inspectOptions ?? { colors };
	}

	#write(stream: Writable, data: any[]): void {
		stream.write(formatWithOptions(this.#inspectOptions, ...data));
	}

	assert(condition?: boolean, ...data: any[]): void {
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
	debug(...data: any[]): void {
		if (this.#stdout === undefined) originalConsole.debug(...data);
		else this.#write(this.#stdout, data);
	}
	dir(item?: any, options?: any): void {
		originalConsole.dir(item, options);
	}
	dirxml(...data: any[]): void {
		originalConsole.dirxml(...data);
	}
	error(...data: any[]): void {
		if (this.#stderr === undefined) originalConsole.error(...data);
		else this.#write(this.#stderr, data);
	}
	group(...data: any[]): void {
		originalConsole.group(...data);
	}
	groupCollapsed(...data: any[]): void {
		originalConsole.groupCollapsed(...data);
	}
	groupEnd(): void {
		originalConsole.groupEnd();
	}
	info(...data: any[]): void {
		if (this.#stdout === undefined) originalConsole.info(...data);
		else this.#write(this.#stdout, data);
	}
	log(...data: any[]): void {
		if (this.#stdout === undefined) originalConsole.log(...data);
		else this.#write(this.#stdout, data);
	}
	table(tabularData?: any, properties?: string[]): void {
		originalConsole.table(tabularData, properties);
	}
	time(label?: string): void {
		originalConsole.time(label);
	}
	timeEnd(label?: string): void {
		originalConsole.timeEnd(label);
	}
	timeLog(label?: string, ...data: any[]): void {
		originalConsole.timeLog(label, ...data);
	}
	timeStamp(label?: string): void {
		originalConsole.timeStamp(label);
	}
	trace(...data: any[]): void {
		if (this.#stdout === undefined) originalConsole.trace(...data);
		else this.#write(this.#stdout, data);
	}
	warn(...data: any[]): void {
		if (this.#stderr === undefined) originalConsole.warn(...data);
		else this.#write(this.#stderr, data);
	}
}
