import { LogLevel } from "miniflare";
import { logger } from "../logger";
import type { LoggerLevel } from "@cloudflare/workers-utils";
import type { WorkerdStructuredLog } from "miniflare";

export function castLogLevel(level: LoggerLevel): LogLevel {
	let key = level.toUpperCase() as Uppercase<LoggerLevel>;
	if (key === "LOG") {
		key = "INFO";
	}

	return LogLevel[key];
}

export function handleStructuredLogs({
	level,
	message,
}: WorkerdStructuredLog): void {
	if (level === "warn") {
		logger.warn(message);
		return;
	}

	if (level === "info" || level === "debug") {
		logger.info(message);
		return;
	}

	if (level === "error") {
		logger.error(message);
		return;
	}

	logger.log(message);
}
