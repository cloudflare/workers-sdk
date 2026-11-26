import { validateHeaderName, validateHeaderValue } from "node:http";
import { UserError } from "./errors";

const protectedHeaders = new Set([
	"host",
	"content-type",
	"content-encoding",
	"content-length",
	"connection",
	"transfer-encoding",
	"upgrade",
	"te",
	"trailer",
]);

function configurationError(message: string): UserError {
	return new UserError(`CLOUDFLARE_API_HEADERS ${message}`, {
		telemetryMessage: "cfetch custom api headers invalid configuration",
	});
}

/** Read additional API headers without retaining environment values between calls. */
export function getCustomApiHeaders(): Record<string, string> {
	const raw = process.env.CLOUDFLARE_API_HEADERS;
	if (!raw) {
		return {};
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw configurationError("must be a JSON object with string values.");
	}
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw configurationError("must be a JSON object with string values.");
	}
	const headers: Record<string, string> = {};
	for (const [name, value] of Object.entries(parsed)) {
		if (typeof value !== "string") {
			throw configurationError("must contain only string values.");
		}
		try {
			validateHeaderName(name);
			validateHeaderValue(name, value);
		} catch {
			// HTTP validation errors can include the supplied value.
			throw configurationError(
				"contains an invalid HTTP header name or value."
			);
		}
		const key = name.toLowerCase();
		if (protectedHeaders.has(key)) {
			throw configurationError(`cannot set the protected header "${name}".`);
		}
		if (Object.hasOwn(headers, key)) {
			throw configurationError(`contains duplicate header "${name}".`);
		}
		Object.defineProperty(headers, key, {
			value,
			enumerable: true,
			configurable: true,
			writable: true,
		});
	}
	return headers;
}

/** Apply configured headers, overriding existing unprotected API request headers. */
export function addCustomApiHeaders(headers: {
	set(name: string, value: string): void;
}): void {
	for (const [name, value] of Object.entries(getCustomApiHeaders())) {
		headers.set(name, value);
	}
}
