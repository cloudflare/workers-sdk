import type { Logger, LoggerLevel } from "@cloudflare/workers-utils";

export type RemoteBindingsLogger = Logger & {
	loggerLevel: LoggerLevel;
	once: NonNullable<Logger["once"]>;
};

export let logger: RemoteBindingsLogger;

export function initLogger(value: RemoteBindingsLogger): void {
	logger = value;
}
