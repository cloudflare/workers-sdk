import * as Sentry from "@sentry/node";
import { rejectedSyncPromise } from "@sentry/utils";
import { fetch } from "undici";
import { version as wranglerVersion } from "../../package.json";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import type { BaseTransportOptions, TransportRequest } from "@sentry/types";
import type { RequestInit } from "undici";

let sentryReportingAllowed = false;

// The SENTRY_DSN is provided at esbuild time as a `define` for production and beta releases.
// Otherwise it is left undefined, which disables reporting.
declare const SENTRY_DSN: string;

/* Returns a Sentry transport for the Sentry proxy Worker. */
export const makeSentry10Transport = (options: BaseTransportOptions) => {
	const eventQueue: [string, RequestInit][] = [];

	const transportSentry10 = async (request: TransportRequest) => {
		/* Adds helpful properties to the request body before we send it to our
    proxy Worker. These properties can be parsed out from the NDJSON in
    `request.body`, but it's easier and safer to just attach them here. */
		const sentryWorkerPayload = {
			envelope: request.body,
			url: options.url,
		};

		try {
			if (sentryReportingAllowed) {
				const eventsToSend = [...eventQueue];
				eventQueue = [];
				for (const event of eventsToSend) {
					await fetch(event[0], event[1]);
				}

				const response = await fetch(
					`https://platform.dash.cloudflare.com/sentry/envelope`,
					{
						method: "POST",
						headers: {
							Accept: "*/*",
							"Content-Type": "application/json",
						},
						body: JSON.stringify(sentryWorkerPayload),
					}
				);

				return {
					statusCode: response.status,
					headers: {
						"x-sentry-rate-limits": response.headers.get(
							"X-Sentry-Rate-Limits"
						),
						"retry-after": response.headers.get("Retry-After"),
					},
				};
			} else {
				// We don't currently have permission to send this event, but maybe we will in the future.
				// Add to an in-memory just in case
				eventQueue.push([
					`https://platform.dash.cloudflare.com/sentry/envelope`,
					{
						method: "POST",
						headers: {
							Accept: "*/*",
							"Content-Type": "application/json",
						},
						body: JSON.stringify(sentryWorkerPayload),
					},
				]);
				return {
					statusCode: 200,
				};
			}
		} catch (err) {
			console.log(err);

			return rejectedSyncPromise(err);
		}
	};

	return Sentry.createTransport(options, transportSentry10);
};

export function setupSentry() {
	if (typeof SENTRY_DSN !== "undefined") {
		Sentry.init({
			release: `wrangler@${wranglerVersion}`,
			dsn: SENTRY_DSN,
			transport: makeSentry10Transport,
		});
	}
}

export function addBreadcrumb(
	message: string,
	level: Sentry.SeverityLevel = "log"
) {
	if (typeof SENTRY_DSN !== "undefined") {
		Sentry.addBreadcrumb({
			message,
			level,
		});
	}
}

// Capture top-level Wrangler errors. Also take this opportunity to ask the user for
// consent if not already granted.
export async function captureGlobalException(e: unknown) {
	if (typeof SENTRY_DSN !== "undefined") {
		sentryReportingAllowed = await confirm(
			"Would you like to report this error to Cloudflare?",
			{ fallbackValue: false }
		);

		if (!sentryReportingAllowed) {
			logger.debug(`Sentry: Reporting disabled - would have sent ${e}.`);
			return;
		}

		logger.debug(`Sentry: Capturing exception ${e}`);
		Sentry.captureException(e);
	}
}

// Ensure we send Sentry events before Wrangler exits
export async function closeSentry() {
	if (typeof SENTRY_DSN !== "undefined") {
		await Sentry.close();
	}
}
