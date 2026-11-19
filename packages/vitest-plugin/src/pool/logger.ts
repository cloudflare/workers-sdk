import { format } from "node:util";
import { LogLevel } from "miniflare";
import type { Logger } from "@cloudflare/workers-utils";
import type { Log } from "miniflare";

/**
 * Adapt the pool logger for shared helpers, retaining its level and formatting.
 *
 * @param log The pool logger used to display messages.
 * @returns A logger that also deduplicates messages sent through `once`.
 */
export function createSharedLogger(log: Log): Logger {
	const seen = new Set<string>();

	function message(level: LogLevel, once: boolean, args: unknown[]): void {
		const text = format(...args);
		if (once) {
			const key = `${level}:${text}`;
			if (seen.has(key)) {
				return;
			}
			seen.add(key);
		}
		log.logWithLevel(level, text);
	}

	return {
		debug: (...args) => message(LogLevel.DEBUG, false, args),
		log: (...args) => message(LogLevel.INFO, false, args),
		info: (...args) => message(LogLevel.INFO, false, args),
		warn: (...args) => message(LogLevel.WARN, false, args),
		error: (...args) => message(LogLevel.ERROR, false, args),
		once: {
			log: (...args) => message(LogLevel.INFO, true, args),
			info: (...args) => message(LogLevel.INFO, true, args),
			warn: (...args) => message(LogLevel.WARN, true, args),
			error: (...args) => message(LogLevel.ERROR, true, args),
		},
	};
}
