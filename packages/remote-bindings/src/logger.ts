import { LOGGER_LEVELS } from "@cloudflare/workers-utils";
import type { Logger, LoggerLevel } from "@cloudflare/workers-utils";

export type RemoteBindingsLogger = Logger & {
	loggerLevel: LoggerLevel;
	once: NonNullable<Logger["once"]>;
};

export function createRemoteBindingsLogger(
	loggerLevel: LoggerLevel = "log"
): RemoteBindingsLogger {
	const enabled = (level: LoggerLevel) =>
		LOGGER_LEVELS[loggerLevel] >= LOGGER_LEVELS[level];
	const logger: RemoteBindingsLogger = {
		loggerLevel,
		debug: (...args) => enabled("debug") && console.debug(...args),
		debugWithSanitization: (...args) =>
			enabled("debug") && console.debug(...args),
		log: (...args) => enabled("log") && console.log(...args),
		info: (...args) => enabled("info") && console.info(...args),
		warn: (...args) => enabled("warn") && console.warn(...args),
		error: (...args) => enabled("error") && console.error(...args),
		once: {
			info: (...args) => logger.info(...args),
			log: (...args) => logger.log(...args),
			warn: (...args) => logger.warn(...args),
			error: (...args) => logger.error(...args),
		},
	};
	return logger;
}
