import { Response } from "../../../http";

const CONTEXT_DESTROYED =
	"The execution context was destroyed, most likely because of a navigation or page reload. Check gotoOptions/waitForSelector/waitForTimeout options.";
const TARGET_CLOSED =
	"The target closed. Check gotoOptions/waitForSelector/waitForTimeout options.";

// Chrome and puppeteer only describe what went wrong in the error message.
// A row matches when the message contains any of its entries, and an array
// entry needs all of its strings. The first matching row wins, so what went
// wrong decides over the command that reported it. The message is returned as
// the detail unless a row sets one, and `null` leaves it out.
const USER_ERRORS: [(string | string[])[], number, string, (string | null)?][] =
	[
		[
			["_SSL_", "_CERT_"],
			5000,
			"Certificate and/or SSL error when attempting to load page",
		],
		[
			["net::ERR_ADDRESS_"],
			5001,
			"Address unreachable error when attempting to load page",
		],
		[["net::ERR_ABORTED"], 5002, "Network connection aborted."],
		[
			["net::ERR_NAME_NOT_RESOLVED", "net::ERR_DNS_TIMED_OUT"],
			5005,
			"DNS resolution failed",
		],
		[
			["ERR_TIMED_OUT", "net::ERR_CONNECTION_TIMED_OUT"],
			5002,
			"Timeout when browsing to url",
		],
		[
			["net::ERR_TOO_MANY_REDIRECTS"],
			5003,
			"Network error: Too many redirects",
		],
		[["net::ERR_HTTP2_PROTOCOL_ERROR"], 5004, "Network error: HTTP2 error"],
		[
			[
				"net::ERR_CONNECTION_CLOSED",
				"net::ERR_CONNECTION_RESET",
				"net::ERR_TUNNEL_CONNECTION_FAILED",
			],
			5006,
			"Network connection closed.",
			"Can also happen due to failure to resolve DNS.",
		],
		[["net::ERR_CONNECTION_REFUSED"], 5008, "Server refused connection.", ""],
		[
			["net::ERR_INVALID_URL"],
			5010,
			"Invalid Url when attempting to load page",
		],
		[["net::ERR_EMPTY_RESPONSE"], 5011, "Empty response from server"],
		[["net::"], 5009, "Network error when attempting to load page"],
		[["Session with given id not found"], 6001, TARGET_CLOSED],
		[
			["Execution context was destroyed, most likely because of a navigation"],
			6000,
			CONTEXT_DESTROYED,
		],
		[
			[
				"Navigation timeout",
				"timed out",
				"Timed out after waiting ",
				["Waiting failed: ", " exceeded"],
			],
			6002,
			"A timeout was reached. Check gotoOptions/waitForSelector/waitForTimeout/actionTimeout options.",
		],
		[
			[
				"Navigating frame was detached",
				"Cannot find context with specified id",
				["Protocol error", "No node with given id found"],
				[
					"Protocol error",
					"Node with given id does not belong to the document",
				],
			],
			6000,
			CONTEXT_DESTROYED,
		],
		[
			["Page.captureScreenshot", "Page.printToPDF"],
			6003,
			"Failed to capture screenshot or generate PDF. The page may be too large or in an invalid state.",
		],
		[
			["This document requires 'TrustedScript' assignment"],
			6004,
			"Content Security Policy blocked script execution",
		],
		[
			["is not a valid selector", "Failed to execute 'querySelectorAll'"],
			6005,
			"An invalid CSS selector was provided. Check your selector/waitForSelector/root syntax.",
			// The browser's message describes its internals
			null,
		],
		[
			[
				"Could not load script",
				"Cannot read properties of null (reading 'appendChild')",
			],
			6006,
			"Could not inject the requested script into the page. The target page may not support script injection (no <head>/<body>) or the script could not be loaded.",
		],
		[[["Protocol error", "Target closed"]], 6001, TARGET_CLOSED],
	];

export function quickActionErrorResponse(error: unknown): Response {
	const raw = error instanceof Error ? error.message : String(error);
	const userError = USER_ERRORS.find(([entries]) =>
		entries.some((entry) =>
			typeof entry === "string"
				? raw.includes(entry)
				: entry.every((part) => raw.includes(part))
		)
	);
	if (userError === undefined) {
		return Response.json(
			{
				success: false,
				errors: [{ message: raw || "Internal Error", code: 2000 }],
			},
			{ status: 500 }
		);
	}
	const [, code, message, detail = raw.trim()] = userError;
	return Response.json(
		{
			success: false,
			errors: [{ code, message, detail: detail ?? undefined }],
		},
		{ status: 422 }
	);
}
