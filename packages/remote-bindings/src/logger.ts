import type { Logger, LoggerLevel } from "@cloudflare/workers-utils";

export type RemoteBindingsLogger = Logger & {
	loggerLevel: LoggerLevel;
	console: NonNullable<Logger["console"]>;
};

export let logger: RemoteBindingsLogger;

export function initLogger(value: RemoteBindingsLogger): void {
	logger = value;
}
