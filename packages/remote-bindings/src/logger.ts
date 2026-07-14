import type { Logger, LoggerLevel } from "@cloudflare/workers-utils";

export type RemoteBindingsLogger = Logger & {
	loggerLevel: LoggerLevel;
	once: NonNullable<Logger["once"]>;
};
