import { inspect } from "node:util";
import { logger } from "../logger";
import type WebSocket from "ws";

/**
 * Everything captured by the trace worker and sent to us via
 * `wrangler tail` is structured JSON that deserializes to this type.
 */
export type TailEventMessage = {
	/**
	 * The name of the script we're tailing
	 */
	scriptName?: string;

	/**
	 * The name of the entrypoint invoked by the Worker
	 */
	entrypoint?: string;

	/**
	 * Any exceptions raised by the worker
	 */
	exceptions: {
		/**
		 * The name of the exception.
		 */
		name: string;

		/**
		 * The error message
		 */
		message: unknown;

		/**
		 * When the exception was raised/thrown
		 */
		timestamp: number;

		/**
		 * The stack trace of the exception, sourcemaps are already resolved.
		 */
		stack?: string;
	}[];

	/**
	 * Any logs sent out by the worker
	 */
	logs: {
		message: unknown[];
		level: "debug" | "info" | "log" | "warn" | "error";
		timestamp: number;
	}[];

	/**
	 * When the event was triggered
	 */
	eventTimestamp: number;
};

/**
 * Pretty-Print a Tail message from a realish-preview attached tail worker
 * This is a simplified version of `prettyPrintLogs` that:
 *  - Only prints logs from HTTP triggers, since realish previews don't receive any other types of trigger.
 *  - Doesn't print the request log line (e.g. GET https://example.com/ - Ok) since in the realish
 *    context this is printed by Wrangler's proxy controller.
 */
export function realishPrintLogs(data: WebSocket.RawData): void {
	const eventMessage: TailEventMessage = JSON.parse(data.toString());

	if (eventMessage.logs.length > 0) {
		eventMessage.logs.forEach(({ level, message }) => {
			logger.console(level, ...message);
		});
	}

	if (eventMessage.exceptions.length > 0) {
		eventMessage.exceptions.forEach(({ name, message, stack }) => {
			const errorLine = `${name}: ${typeof message === "string" ? message : inspect(message)}`;
			logger.error(`${errorLine}${stack ? `\n${stack}` : ""}`);
		});
	}
}
