import { logger } from "../logger";
import type { RequestEvent, ScheduledEvent, TailEventMessage } from ".";
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
  } else {
    const requestMethod = eventMessage.event?.request.method.toUpperCase();
    const url = eventMessage.event?.request.url;
    const outcome = prettifyOutcome(eventMessage.outcome);
    const datetime = new Date(eventMessage.eventTimestamp).toLocaleString();

    logger.log(
      url
        ? `${requestMethod} ${url} - ${outcome} @ ${datetime}`
        : `[missing request] - ${outcome} @ ${datetime}`
    );
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

function isScheduledEvent(
  event: RequestEvent | ScheduledEvent | undefined | null
): event is ScheduledEvent {
  return Boolean(event && "cron" in event);
}

function prettifyOutcome(outcome: Outcome): string {
  switch (outcome) {
    case "ok":
      return "Ok";
    case "canceled":
      return "Canceled";
    case "exceededCpu":
      return "Exceeded CPU Limit";
    case "exception":
      return "Exception Thrown";
    case "unknown":
    default:
      return "Unknown";
  }
}
