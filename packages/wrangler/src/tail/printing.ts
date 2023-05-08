import chalk from "chalk";
import { logger } from "../logger";
import type {
	AlarmEvent,
	EmailEvent,
	RequestEvent,
	ScheduledEvent,
	TailInfo,
	TailEventMessage,
} from "./createTail";
import type { Outcome } from "./filters";
import type WebSocket from "ws";

export function prettyPrintLogs(data: WebSocket.RawData): void {
	const eventMessage: TailEventMessage = JSON.parse(data.toString());

	if (isScheduledEvent(eventMessage.event)) {
		const cronPattern = eventMessage.event.cron;
		const datetime = new Date(
			eventMessage.event.scheduledTime
		).toLocaleString();
		const outcome = prettifyOutcome(eventMessage.outcome);

		logger.log(`"${cronPattern}" @ ${datetime} - ${outcome}`);
	} else if (isRequestEvent(eventMessage.event)) {
		const requestMethod = eventMessage.event?.request.method.toUpperCase();
		const url = eventMessage.event?.request.url;
		const outcome = prettifyOutcome(eventMessage.outcome);
		const datetime = new Date(eventMessage.eventTimestamp).toLocaleString();

		logger.log(
			url
				? `${requestMethod} ${url} - ${outcome} @ ${datetime}`
				: `[missing request] - ${outcome} @ ${datetime}`
		);
	} else if (isEmailEvent(eventMessage.event)) {
		const outcome = prettifyOutcome(eventMessage.outcome);
		const datetime = new Date(eventMessage.eventTimestamp).toLocaleString();
		const mailFrom = eventMessage.event.mailFrom;
		const rcptTo = eventMessage.event.rcptTo;
		const rawSize = eventMessage.event.rawSize;

		logger.log(
			`Email from:${mailFrom} to:${rcptTo} size:${rawSize} @ ${datetime} - ${outcome}`
		);
	} else if (isAlarmEvent(eventMessage.event)) {
		const outcome = prettifyOutcome(eventMessage.outcome);
		const datetime = new Date(
			eventMessage.event.scheduledTime
		).toLocaleString();

		logger.log(`Alarm @ ${datetime} - ${outcome}`);
	} else if (isTailInfo(eventMessage.event)) {
		if (eventMessage.event.type === "overload") {
			logger.log(`${chalk.red.bold(eventMessage.event.message)}`);
		}
	} else {
		// Unknown event type
		const outcome = prettifyOutcome(eventMessage.outcome);
		const datetime = new Date(eventMessage.eventTimestamp).toLocaleString();

		logger.log(`Unknown Event - ${outcome} @ ${datetime}`);
	}

	if (eventMessage.logs.length > 0) {
		eventMessage.logs.forEach(({ level, message }) => {
			logger.log(`  (${level})`, ...message);
		});
	}

	if (eventMessage.exceptions.length > 0) {
		eventMessage.exceptions.forEach(({ name, message }) => {
			logger.error(`  ${name}:`, message);
		});
	}
}

export function jsonPrintLogs(data: WebSocket.RawData): void {
	console.log(JSON.stringify(JSON.parse(data.toString()), null, 2));
}

function isRequestEvent(
	event: TailEventMessage["event"]
): event is RequestEvent {
	return Boolean(event && "request" in event);
}

function isScheduledEvent(
	event: TailEventMessage["event"]
): event is ScheduledEvent {
	return Boolean(event && "cron" in event);
}

function isEmailEvent(event: TailEventMessage["event"]): event is EmailEvent {
	return Boolean(event && "mailFrom" in event);
}

/**
 * Check to see if an event sent from a worker is an AlarmEvent.
 *
 * Because the only property on `AlarmEvent` is "scheduledTime", which it
 * shares with `ScheduledEvent`, `isAlarmEvent` checks if there's _not_
 * a "cron" property in `event` to confirm it's an alarm event.
 *
 * @param event An event
 * @returns true if the event is an AlarmEvent
 */
function isAlarmEvent(event: TailEventMessage["event"]): event is AlarmEvent {
	return Boolean(event && "scheduledTime" in event && !("cron" in event));
}

function isTailInfo(event: TailEventMessage["event"]): event is TailInfo {
	return Boolean(event && "message" in event && "type" in event);
}

function prettifyOutcome(outcome: Outcome): string {
	switch (outcome) {
		case "ok":
			return "Ok";
		case "canceled":
			return "Canceled";
		case "exceededCpu":
			return "Exceeded CPU Limit";
		case "exceededMemory":
			return "Exceeded Memory Limit";
		case "exception":
			return "Exception Thrown";
		case "unknown":
		default:
			return "Unknown";
	}
}
