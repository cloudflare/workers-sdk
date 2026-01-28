import { getWranglerSendErrorReportsFromEnv } from "@cloudflare/workers-utils";
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
const makeSentry10Transport = (options: BaseTransportOptions) => {
	let eventQueue: [string, RequestInit][] = [];

	const transportSentry10 = async (request: TransportRequest) => {
		/**
		 * Adds helpful properties to the request body before we send it to our
		 * proxy Worker. These properties can be parsed out from the NDJSON in
		 * `request.body`, but it's easier and safer to just attach them here.
		 */
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
			logger.error(err);

			return rejectedSyncPromise(err);
		}
	};

	return Sentry.createTransport(options, transportSentry10);
};

const disabledDefaultIntegrations = [
	"LocalVariables", // Local variables may contain tokens and PII
	"Http", // Only captures method/URL/response status, but URL may contain PII
	"Undici", // Same as "Http"
	"RequestData", // Request data to Wrangler's HTTP servers may contain PII
];

export function setupSentry() {
	if (typeof SENTRY_DSN !== "undefined") {
		Sentry.init({
			release: `wrangler@${wranglerVersion}`,
			dsn: SENTRY_DSN,
			transport: makeSentry10Transport,
			integrations(defaultIntegrations) {
				return defaultIntegrations.filter(
					({ name }) => !disabledDefaultIntegrations.includes(name)
				);
			},
			beforeSend(event) {
				delete event.server_name; // Computer name may contain PII
				// Culture contains timezone and locale
				if (event.contexts !== undefined) {
					delete event.contexts.culture;
				}

				// Rewrite Wrangler install location which may contain PII
				const fakeInstallPath =
					process.platform === "win32" ? "C:\\Project\\" : "/project/";
				for (const exception of event.exception?.values ?? []) {
					for (const frame of exception.stacktrace?.frames ?? []) {
						if (frame.filename === undefined) {
							continue;
						}
						const nodeModulesIndex = frame.filename.indexOf("node_modules");

						if (nodeModulesIndex === -1) {
							continue;
						}
						frame.filename =
							fakeInstallPath + frame.filename.substring(nodeModulesIndex);
					}
				}

				return event;
			},
		});
	}
}

/**
 * Adds a breadcrumb to any message that may be posted to Sentry.
 *
 * This provides more context to any error that is captured.
 *
 * @param message The breadcrumb message to add. This must have been sanitized of any sensitive information.
 * @param level The severity level of the breadcrumb. Defaults to "log".
 */
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
		const sendErrorReportsEnvVar = getWranglerSendErrorReportsFromEnv();
		sentryReportingAllowed =
			sendErrorReportsEnvVar !== undefined
				? sendErrorReportsEnvVar
				: await confirm(
						"Would you like to report this error to Cloudflare? Wrangler's output and the error details will be shared with the Wrangler team to help us diagnose and fix the issue.",
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
